'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  PRESERVE_RELATIVE_PATHS,
  capturePreservedFiles,
  restorePreservedFiles,
} = require('../src/module/fix/text-update-preserve');

const expectedPaths = [
  'cache/msq-speaker-gender.json',
  'readme/elevenlabs-token-helper.html',
];

assert.deepStrictEqual(PRESERVE_RELATIVE_PATHS, expectedPaths);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fftrans-text-update-'));

try {
  const original = {
    'cache/msq-speaker-gender.json': Buffer.from('{"NPC":"female"}', 'utf8'),
    'readme/elevenlabs-token-helper.html': Buffer.from('<html>fork helper</html>', 'utf8'),
  };

  for (const [relativePath, contents] of Object.entries(original)) {
    const destination = path.join(temporaryRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents);
  }

  const preserved = capturePreservedFiles(temporaryRoot);
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  fs.mkdirSync(temporaryRoot, { recursive: true });

  const upstreamHelper = Buffer.from('<html>upstream helper</html>', 'utf8');
  const helperPath = path.join(temporaryRoot, 'readme/elevenlabs-token-helper.html');
  fs.mkdirSync(path.dirname(helperPath), { recursive: true });
  fs.writeFileSync(helperPath, upstreamHelper);

  restorePreservedFiles(temporaryRoot, preserved);

  assert.deepStrictEqual(
    fs.readFileSync(path.join(temporaryRoot, 'cache/msq-speaker-gender.json')),
    original['cache/msq-speaker-gender.json'],
    'NPC speaker-gender cache was not restored byte-for-byte',
  );
  assert.deepStrictEqual(
    fs.readFileSync(helperPath),
    upstreamHelper,
    'An upstream replacement must not be overwritten',
  );

  const ignored = capturePreservedFiles(temporaryRoot, ['../outside.txt'], { warn() {} });
  assert.deepStrictEqual(ignored, {}, 'Path traversal must be rejected');

  console.log('Text-update preservation verified.');
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
