'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'src/html/config.html');
const configJsPath = path.join(rootDir, 'src/html/config.js');
const themeCssPath = path.join(rootDir, 'src/html/css/theme.css');

const html = fs.readFileSync(htmlPath, 'utf8');
const configJs = fs.readFileSync(configJsPath, 'utf8');
const themeCss = fs.readFileSync(themeCssPath, 'utf8');

const errors = [];

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasHtmlId(id) {
  return new RegExp(`\\bid=["']${escapeRegExp(id)}["']`).test(html);
}

function getOpeningTagById(source, tagName, id) {
  const pattern = new RegExp(`<${tagName}\\b(?=[^>]*\\bid=["']${escapeRegExp(id)}["'])[^>]*>`, 'i');
  return source.match(pattern)?.[0] || '';
}

function extractElementById(source, tagName, id) {
  const openingTag = getOpeningTagById(source, tagName, id);
  if (!openingTag) {
    return '';
  }

  const startIndex = source.indexOf(openingTag);
  const endIndex = source.indexOf(`</${tagName}>`, startIndex);
  if (endIndex === -1) {
    return '';
  }

  return source.slice(startIndex, endIndex + `</${tagName}>`.length);
}

function extractBalancedBlock(source, startIndex) {
  const openIndex = source.indexOf('{', startIndex);
  if (openIndex === -1) {
    return '';
  }

  let depth = 0;
  for (let index = openIndex; index < source.length; index++) {
    const character = source[index];
    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex + 1, index);
      }
    }
  }

  return '';
}

function extractFunctionBody(source, functionName) {
  const startIndex = source.indexOf(`function ${functionName}`);
  if (startIndex === -1) {
    return '';
  }

  return extractBalancedBlock(source, startIndex);
}

function extractCssBlock(source, selector) {
  const startIndex = source.indexOf(selector);
  if (startIndex === -1) {
    return '';
  }

  return extractBalancedBlock(source, startIndex);
}

const advancedDetails = [
  'details-elevenlabs-voice-tuning',
  'details-speechify-output-options',
  'details-mimo-voice-output-options',
];

const disclosureControlMap = {
  'details-elevenlabs-voice-tuning': [
    'input-elevenlabs-stability',
    'input-elevenlabs-similarity-boost',
    'input-elevenlabs-style',
    'checkbox-elevenlabs-speaker-boost',
  ],
  'details-speechify-output-options': [
    'select-speechify-audio-format',
    'checkbox-speechify-sentence-splitting',
  ],
  'details-mimo-voice-output-options': [
    'select-mimo-response-format',
    'input-mimo-speed',
    'input-mimo-style',
    'input-mimo-emotion',
    'input-mimo-language',
  ],
};

const advancedControlIds = Object.values(disclosureControlMap).flat();

advancedDetails.forEach((detailsId) => {
  const openingTag = getOpeningTagById(html, 'details', detailsId);
  assert(openingTag, `Missing advanced <details> disclosure: ${detailsId}`);
  assert(!/\sopen(?:[\s=>]|$)/i.test(openingTag), `Advanced <details> should be default closed: ${detailsId}`);
});

const getOptionListBody = extractFunctionBody(configJs, 'getOptionList');
assert(getOptionListBody, 'Missing getOptionList() in src/html/config.js');

Object.entries(disclosureControlMap).forEach(([detailsId, controlIds]) => {
  const detailsBlock = extractElementById(html, 'details', detailsId);

  controlIds.forEach((controlId) => {
    assert(hasHtmlId(controlId), `Missing advanced control in config.html: ${controlId}`);
    assert(
      new RegExp(`\\bid=["']${escapeRegExp(controlId)}["']`).test(detailsBlock),
      `Advanced control is not contained by ${detailsId}: ${controlId}`,
    );
    assert(
      new RegExp(`\\[\\s*\\[\\s*["']${escapeRegExp(controlId)}["']\\s*,`).test(getOptionListBody),
      `Advanced control is not mapped in getOptionList(): ${controlId}`,
    );
  });
});

const getElementSearchTextBody = extractFunctionBody(configJs, 'getElementSearchText');
assert(getElementSearchTextBody, 'Missing getElementSearchText() in src/html/config.js');
assert(
  /closest\(["']details["']\)/.test(getElementSearchTextBody)
    && /querySelector\(["']summary["']\)\?\.textContent/.test(getElementSearchTextBody),
  'Settings search text must include the nearest <details><summary> text.',
);

const activateSettingsSearchResultBody = extractFunctionBody(configJs, 'activateSettingsSearchResult');
assert(activateSettingsSearchResultBody, 'Missing activateSettingsSearchResult() in src/html/config.js');
assert(
  /closest\(["']details["']\)/.test(activateSettingsSearchResultBody)
    && /\.open\s*=\s*true/.test(activateSettingsSearchResultBody),
  'Settings search activation must open an ancestor <details> disclosure.',
);

const settingsThemeTokens = [
  '--settings-surface-page',
  '--settings-surface-panel',
  '--settings-surface-panel-hover',
  '--settings-surface-raised',
  '--settings-border',
  '--settings-border-strong',
  '--settings-accent',
  '--settings-accent-text',
  '--settings-accent-soft',
  '--settings-focus-ring',
  '--settings-radius-card',
  '--settings-radius-control',
  '--settings-shadow-card',
  '--settings-shadow-menu',
  '--settings-control-highlight',
];

const darkThemeBlock = extractCssBlock(themeCss, ':root');
const lightThemeBlock = extractCssBlock(themeCss, '[data-theme="light"]');
assert(darkThemeBlock, 'Missing dark/default :root theme block in theme.css');
assert(lightThemeBlock, 'Missing [data-theme="light"] theme block in theme.css');

settingsThemeTokens.forEach((token) => {
  const tokenPattern = new RegExp(`(?:^|[;\\s{])${escapeRegExp(token)}\\s*:`, 'm');
  assert(tokenPattern.test(darkThemeBlock), `Missing dark settings theme token: ${token}`);
  assert(tokenPattern.test(lightThemeBlock), `Missing light settings theme token: ${token}`);
});

if (errors.length > 0) {
  console.error('Settings UI regression verification failed:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log('Settings UI regression contracts verified.');
console.log(`- Advanced disclosures default closed: ${advancedDetails.length}`);
console.log(`- Advanced controls present, contained, and mapped: ${advancedControlIds.length}`);
console.log('- Search text includes nearest details summary and activation opens ancestor details.');
console.log(`- Settings dark/light theme tokens present: ${settingsThemeTokens.length}`);
