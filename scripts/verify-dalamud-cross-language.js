'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createDalamudBridge } = require('../src/module/system/dalamud-bridge');

const API_SECRET_SENTINEL = 'cross-language-api-secret-must-not-leak';

function findDotnet() {
  const executable = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
  const candidates = [
    process.env.DOTNET_ROOT && path.join(process.env.DOTNET_ROOT, executable),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.dotnet', executable),
    process.env.HOME && path.join(process.env.HOME, '.dotnet', executable),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || executable;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        DOTNET_CLI_TELEMETRY_OPTOUT: '1',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(
        `${path.basename(command)} exited with code ${code}.\n${stdout}\n${stderr}`
      ));
    });
  });
}

async function run() {
  if (process.platform !== 'win32') {
    throw new Error('The FFTrans Dalamud cross-language named-pipe test requires Windows.');
  }

  const repositoryRoot = path.resolve(__dirname, '..');
  const projectPath = path.join(
    repositoryRoot,
    'dalamud',
    'FFTransDalamud',
    'tools',
    'FFTransDalamud.BridgeProbe',
    'FFTransDalamud.BridgeProbe.csproj'
  );
  const dotnet = findDotnet();
  const temporaryDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'fftrans-dalamud-cross-language-')
  );
  const descriptorPath = path.join(temporaryDirectory, 'dalamud-bridge.json');
  const pipeName = `fftrans-cross-${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
  const originalText = 'The crystal remembers every star. 世界';
  let bridge;

  try {
    await runProcess(dotnet, ['build', projectPath, '-c', 'Release'], {
      cwd: repositoryRoot,
    });

    bridge = createDalamudBridge({
      descriptorPath,
      pipeName,
      getConfig: () => ({
        dalamudBridge: { enabled: true, pipeName },
        translation: { engine: 'CrossLanguageMock' },
        api: { key: API_SECRET_SENTINEL },
      }),
      translateRequest: async (request) => ({
        translation: `水晶铭记着每一颗星辰。｜${request.text}`,
        engine: 'CrossLanguageMock',
      }),
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
    });
    await bridge.start();

    const { stdout, stderr } = await runProcess(dotnet, [
      'run',
      '--project', projectPath,
      '-c', 'Release',
      '--no-build',
      '--', descriptorPath, originalText, 'Venat',
    ], { cwd: repositoryRoot });

    const outputLines = stdout.trim().split(/\r?\n/).filter(Boolean);
    const result = JSON.parse(outputLines.at(-1));
    assert.equal(result.success, true);
    assert.equal(result.validIdentity, true);
    assert.equal(result.engine, 'CrossLanguageMock');
    assert.equal(result.translation, `水晶铭记着每一颗星辰。｜${originalText}`);
    assert.equal(result.warningCount, 0);
    assert.equal(`${stdout}\n${stderr}`.includes(API_SECRET_SENTINEL), false);

    console.log(
      `Dalamud cross-language verification passed: C# client -> Node bridge -> C# response (${result.latencyMs} ms bridge latency).`
    );
  } finally {
    await bridge?.shutdown().catch(() => {});
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

