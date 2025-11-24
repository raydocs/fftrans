'use strict';

const axios = require('axios');
const crypto = require('crypto');

const configModule = require('../system/config-module');
const Logger = require('../../utils/logger');

const FIREBASE_API_KEY = 'AIzaSyDhSxLJa_WaR8I69a1BmlUG7ckfZHu7-ig';
const SECURE_TOKEN_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry

function base64UrlDecode(str = '') {
  try {
    const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch (error) {
    Logger.warn('elevenlabs-auth', 'Failed to decode base64 token payload', error);
    return null;
  }
}

function decodeTokenExpiry(token = '') {
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }
    const payload = JSON.parse(base64UrlDecode(parts[1]) || '{}');
    if (payload.exp) {
      return payload.exp * 1000;
    }
  } catch (error) {
    Logger.warn('elevenlabs-auth', 'Failed to decode token expiry', error);
  }
  return null;
}

function shouldRefreshToken(bearerToken = '', expiresAt) {
  if (!bearerToken) {
    return true;
  }
  if (!expiresAt) {
    return false;
  }
  return Date.now() + EXPIRY_BUFFER_MS >= expiresAt;
}

async function refreshBearerToken(refreshToken = '') {
  const payload = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }).toString();

  try {
    const response = await axios.post(SECURE_TOKEN_URL, payload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'FirebaseAuth.iOS/11.14.0 io.elevenlabs.readerapp/1.4.45 iPhone/26.0 hw/iPhone16_2',
        'X-Client-Version': 'iOS/FirebaseSDK/11.14.0/FirebaseCore-iOS',
        'X-iOS-Bundle-Identifier': 'io.elevenlabs.readerapp',
        'Accept': '*/*',
      },
      timeout: 20000,
    });

    const accessToken = response.data?.access_token;
    if (!accessToken) {
      throw new Error('未在刷新响应中找到 access_token');
    }

    const expiresIn = Number(response.data?.expires_in) || 3600;
    const expiresAt = Date.now() + expiresIn * 1000;

    return {
      bearerToken: accessToken,
      expiresAt,
    };
  } catch (error) {
    const message = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    Logger.error('elevenlabs-auth', 'Failed to refresh bearer token', message);
    throw new Error(`刷新 ElevenLabs Bearer Token 失败：${message}`);
  }
}

function persistBearerToken(bearerToken, expiresAtIso) {
  try {
    const current = configModule.getConfig();
    current.api.elevenlabs = {
      ...current.api.elevenlabs,
      bearerToken,
      bearerTokenExpiresAt: expiresAtIso,
    };
    configModule.setConfig(current);
  } catch (error) {
    Logger.warn('elevenlabs-auth', 'Failed to persist bearer token', error);
  }
}

function persistDeviceId(deviceId) {
  try {
    const current = configModule.getConfig();
    current.api.elevenlabs = {
      ...current.api.elevenlabs,
      deviceId,
    };
    configModule.setConfig(current);
  } catch (error) {
    Logger.warn('elevenlabs-auth', 'Failed to persist device id', error);
  }
}

function resolveDeviceId(existingId = '', persist = false) {
  const id = (existingId || '').trim();
  if (id) {
    return id;
  }

  const newId = crypto.randomUUID().toUpperCase();
  if (persist) {
    persistDeviceId(newId);
  }
  return newId;
}

function getMergedConfig(configOverride = {}) {
  const config = configModule.getConfig();
  return {
    ...config.api.elevenlabs,
    ...configOverride,
  };
}

async function resolveAuthConfig(configOverride = {}, options = {}) {
  const { persistTokens = false, allowRefresh = true } = options;
  const mergedConfig = getMergedConfig(configOverride);

  let bearerToken = (mergedConfig.bearerToken || '').trim();
  const refreshToken = (mergedConfig.refreshToken || '').trim();
  const storedExpiry = mergedConfig.bearerTokenExpiresAt ? Date.parse(mergedConfig.bearerTokenExpiresAt) : null;
  let expiresAt = storedExpiry || decodeTokenExpiry(bearerToken);

  if (allowRefresh && shouldRefreshToken(bearerToken, expiresAt) && refreshToken) {
    const refreshed = await refreshBearerToken(refreshToken);
    bearerToken = refreshed.bearerToken;
    expiresAt = refreshed.expiresAt;

    if (persistTokens) {
      persistBearerToken(bearerToken, new Date(expiresAt).toISOString());
    }
  }

  if (!bearerToken) {
    throw new Error('缺少 Bearer Token，请填写 Bearer Token 或 Firebase Refresh Token');
  }

  const deviceId = resolveDeviceId(mergedConfig.deviceId, persistTokens);

  return {
    ...mergedConfig,
    bearerToken,
    deviceId,
    bearerTokenExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : mergedConfig.bearerTokenExpiresAt,
    appCheckToken: (mergedConfig.appCheckToken || '').trim(),
  };
}

module.exports = {
  resolveAuthConfig,
  refreshBearerToken,
  decodeTokenExpiry,
};
