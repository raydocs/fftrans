'use strict';

const fs = require('fs');
const path = require('path');

const PRESERVE_RELATIVE_PATHS = Object.freeze([
  'cache/msq-speaker-gender.json',
  'readme/elevenlabs-token-helper.html',
]);

function resolveInside(rootPath, relativePath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to access a path outside the text directory: ${relativePath}`);
  }
  return target;
}

function capturePreservedFiles(textPath, relativePaths = PRESERVE_RELATIVE_PATHS, logger = console) {
  const preserved = {};

  for (const relativePath of relativePaths) {
    try {
      const sourcePath = resolveInside(textPath, relativePath);
      if (fs.existsSync(sourcePath)) {
        preserved[relativePath] = fs.readFileSync(sourcePath);
      }
    } catch (error) {
      logger.warn?.('Preserve read failed', relativePath, error.message);
    }
  }

  return preserved;
}

function restorePreservedFiles(textPath, preserved, logger = console) {
  for (const [relativePath, contents] of Object.entries(preserved)) {
    try {
      const destinationPath = resolveInside(textPath, relativePath);
      if (!fs.existsSync(destinationPath)) {
        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
        fs.writeFileSync(destinationPath, contents);
      }
    } catch (error) {
      logger.warn?.('Preserve restore failed', relativePath, error.message);
    }
  }
}

module.exports = {
  PRESERVE_RELATIVE_PATHS,
  capturePreservedFiles,
  restorePreservedFiles,
};
