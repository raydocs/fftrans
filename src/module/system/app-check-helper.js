'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const fileModule = require('./file-module');
const Logger = require('../../utils/logger');

const TOKEN_REGEX_GLOBAL = /xi-app-check-token\s*:\s*([A-Za-z0-9_\-.]+)/gi;
const CACHE_FILES = ['tokens_cache.json', 'extracted_tokens.json', 'elevenlabs_tokens.json'];
const FLOW_FILES = ['flows.elevenlabsio', 'flows.txt'];

function decodeJwtExpiryMillis(token = '') {
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const json = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    if (json.exp) {
      return Number(json.exp) * 1000;
    }
  } catch (error) {
    Logger.warn('app-check-helper', 'Failed to decode app check token exp', error);
  }
  return null;
}

function collectTokensFromText(text = '') {
  const tokens = [];
  let match;
  while ((match = TOKEN_REGEX_GLOBAL.exec(text)) !== null) {
    const token = match[1].trim();
    tokens.push({
      token,
      expiresAt: decodeJwtExpiryMillis(token),
      source: 'text',
    });
  }
  return tokens;
}

function extractWithStrings(filePath = '') {
  try {
    const result = spawnSync('strings', ['-n', '6', filePath], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
    if (result.status !== 0 || !result.stdout) {
      return null;
    }

    const lines = result.stdout.split(/\r?\n/);
    for (const line of lines) {
      if (line.toLowerCase().includes('xi-app-check-token')) {
        const parts = line.split(/xi-app-check-token\s*[:\s]+/i);
        if (parts.length >= 2) {
          const candidate = parts[1].trim();
          const match = /^([A-Za-z0-9_\-.]+)/.exec(candidate);
          if (match) {
            const token = match[1];
            return {
              token,
              expiresAt: decodeJwtExpiryMillis(token),
              source: 'strings',
            };
          }
        }
      }
    }
  } catch (error) {
    Logger.warn('app-check-helper', 'strings scan failed', error);
  }
  return null;
}

function pickBestToken(tokens = []) {
  if (!tokens.length) {
    return null;
  }

  // Prefer non-expired tokens with the latest expiry; otherwise last seen token
  const now = Date.now();
  const nonExpired = tokens.filter((t) => t.expiresAt && t.expiresAt > now);
  if (nonExpired.length > 0) {
    nonExpired.sort((a, b) => (b.expiresAt || 0) - (a.expiresAt || 0));
    return nonExpired[0];
  }

  // If all expired or missing exp, return the last encountered token
  return tokens[tokens.length - 1];
}

function extractBestTokenFromFile(filePath = '') {
  if (!filePath) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath);
    const tokens = [];

    // Try UTF-8 decode first
    const text = raw.toString('utf8');
    tokens.push(...collectTokensFromText(text));

    // Fallback: scan ASCII-only version to catch binary dumps
    if (!tokens.length) {
      const ascii = raw.toString('latin1');
      tokens.push(...collectTokensFromText(ascii));
    }

    // Last resort: mimic CLI helper with `strings` for binary .elevenlabsio
    if (!tokens.length) {
      const stringsResult = extractWithStrings(filePath);
      if (stringsResult) {
        tokens.push(stringsResult);
      }
    }

    const best = pickBestToken(tokens);
    if (!best) {
      return null;
    }

    return {
      ...best,
      source: filePath,
      method: best.source || 'flow',
    };
  } catch (error) {
    Logger.warn('app-check-helper', 'Failed to read flow file', error);
    return null;
  }
}

function extractFromFile(filePath = '') {
  const result = extractBestTokenFromFile(filePath);
  return result ? result.token : null;
}

function readTokenFromCache(cachePath = '') {
  try {
    const json = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const token = json.xi_app_check_token || json.app_check_token || json.appCheckToken;
    if (!token) {
      return null;
    }
    return {
      token: String(token).trim(),
      expiresAt: decodeJwtExpiryMillis(String(token)),
      source: cachePath,
      method: 'cache',
    };
  } catch (error) {
    Logger.warn('app-check-helper', `Failed to parse cache file: ${cachePath}`, error);
    return null;
  }
}

function getCandidateDirs() {
  const dirs = new Set();
  try {
    dirs.add(fileModule.getUserDataPath('config'));
  } catch (error) {
    Logger.warn('app-check-helper', 'Failed to resolve userData path', error);
  }
  try {
    dirs.add(fileModule.getDownloadsPath());
  } catch (error) {
    Logger.warn('app-check-helper', 'Failed to resolve downloads path', error);
  }
  try {
    dirs.add(fileModule.getRootPath());
  } catch (error) {
    Logger.warn('app-check-helper', 'Failed to resolve root path', error);
  }

  dirs.add(process.cwd());
  return Array.from(dirs).filter(Boolean);
}

function extractFromCaches() {
  const dirs = getCandidateDirs();
  for (const dir of dirs) {
    for (const cacheName of CACHE_FILES) {
      const cachePath = path.join(dir, cacheName);
      if (!fs.existsSync(cachePath)) {
        continue;
      }
      const tokenInfo = readTokenFromCache(cachePath);
      if (tokenInfo) {
        return tokenInfo;
      }
    }
  }
  return null;
}

function getFlowCandidates() {
  const dirs = getCandidateDirs();
  const candidates = [];
  for (const dir of dirs) {
    for (const flowName of FLOW_FILES) {
      const flowPath = path.join(dir, flowName);
      if (fs.existsSync(flowPath)) {
        candidates.push(flowPath);
      }
    }
  }
  return candidates;
}

function extractFromKnownLocations() {
  const cacheResult = extractFromCaches();
  if (cacheResult?.token) {
    return { ...cacheResult, method: 'cache' };
  }

  const flowFiles = getFlowCandidates();
  for (const flowFile of flowFiles) {
    const tokenInfo = extractBestTokenFromFile(flowFile);
    if (tokenInfo) {
      return tokenInfo;
    }
  }

  return null;
}

module.exports = {
  extractFromFile,
  extractBestTokenFromFile,
  extractFromKnownLocations,
};
