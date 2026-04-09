'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const requiredFiles = [
  'package.json',
  'src/module/system/config-module.js',
  'src/module/system/elevenlabs-browser-assist.js',
  'src/html/config.html',
  'src/html/config.js',
  'extension/elevenreader-bearer/manifest.json',
  'extension/elevenreader-bearer/background.js',
  'extension/elevenreader-bearer/README.md',
  'src/data/text/readme/index.html',
  'src/data/text/readme/elevenlabs-token-helper.html',
];

const missingFiles = requiredFiles.filter((relativePath) => !fs.existsSync(path.join(rootDir, relativePath)));
if (missingFiles.length > 0) {
  console.error('Missing required ElevenLabs release files:');
  missingFiles.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const extraFiles = Array.isArray(packageJson?.build?.extraFiles) ? packageJson.build.extraFiles : [];

const requiredExtraFiles = [
  'src/data',
  'extension/elevenreader-bearer',
];
const missingExtraFiles = requiredExtraFiles.filter((entry) => !extraFiles.includes(entry));
if (missingExtraFiles.length > 0) {
  console.error('package.json build.extraFiles is missing required entries:');
  missingExtraFiles.forEach((entry) => console.error(`- ${entry}`));
  process.exit(1);
}

if (extraFiles.includes('!src/data/text/readme')) {
  console.error('package.json build.extraFiles still excludes src/data/text/readme');
  process.exit(1);
}

console.log('ElevenLabs release assets verified.');
