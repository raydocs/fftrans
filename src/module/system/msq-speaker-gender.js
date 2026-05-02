'use strict';

const fs = require('fs');
const path = require('path');
const Logger = require('../../utils/logger');

const ARTIFACT_PATH = path.resolve(__dirname, '..', '..', 'data', 'text', 'cache', 'msq-speaker-gender.json');
const VALID_GENDERS = new Set(['male', 'female']);

let loadWarningEmitted = false;
let lookupState = null;

function normalizeExactName(name = '') {
  return String(name)
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeLooseName(name = '') {
  return normalizeExactName(name)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function warnOnce(message, details = {}) {
  if (loadWarningEmitted) return;
  loadWarningEmitted = true;
  Logger.warn('msq-speaker-gender', message, details);
}

function createEmptyState() {
  return {
    exactMap: new Map(),
    looseMap: new Map(),
    source: null,
  };
}

function loadLookupState() {
  if (lookupState) {
    return lookupState;
  }

  const state = createEmptyState();

  try {
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
    if (artifact?.schemaVersion !== 1 || !artifact.gendersByName || typeof artifact.gendersByName !== 'object') {
      throw new Error('Unexpected MSQ speaker gender artifact schema');
    }

    Object.entries(artifact.gendersByName).forEach(([displayName, gender]) => {
      if (!displayName || !VALID_GENDERS.has(gender)) return;

      const exactKey = normalizeExactName(displayName);
      const looseKey = normalizeLooseName(displayName);
      const entry = { gender, matchedName: displayName };

      if (exactKey) {
        state.exactMap.set(exactKey, entry);
      }
      if (looseKey && !state.looseMap.has(looseKey)) {
        state.looseMap.set(looseKey, entry);
      }
    });

    state.source = artifact.source || null;
  } catch (error) {
    warnOnce('MSQ speaker gender lookup disabled', {
      path: ARTIFACT_PATH,
      error: error?.message || String(error),
    });
  }

  lookupState = state;
  return lookupState;
}

function lookupSpeakerGender(name = '') {
  try {
    const state = loadLookupState();
    const exactKey = normalizeExactName(name);
    if (exactKey && state.exactMap.has(exactKey)) {
      return {
        ...state.exactMap.get(exactKey),
        matchType: 'exact',
      };
    }

    const looseKey = normalizeLooseName(name);
    if (looseKey && state.looseMap.has(looseKey)) {
      return {
        ...state.looseMap.get(looseKey),
        matchType: 'loose',
      };
    }
  } catch (error) {
    warnOnce('MSQ speaker gender lookup failed', {
      error: error?.message || String(error),
    });
  }

  return null;
}

function getSourceMetadata() {
  return loadLookupState().source;
}

module.exports = {
  lookupSpeakerGender,
  getSourceMetadata,
  normalizeExactName,
  normalizeLooseName,
};
