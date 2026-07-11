'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const {
  PROTOCOL_VERSION,
  TRANSPORT,
  createDalamudBridge,
  getPipePath,
} = require('../src/module/system/dalamud-bridge');

const TEST_TIMEOUT_MS = 4000;
const MAX_FRAME_BYTES = 2048;
const MAX_TEXT_BYTES = 256;
const API_SECRET_SENTINEL = 'must-never-leave-config';

function sourceHash(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function withTimeout(promise, label, timeoutMs = TEST_TIMEOUT_MS) {
  let timer;
  const timeoutPromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
    timer.unref?.();
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

class JsonLineClient {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.messages = [];
    this.waiters = [];
    this.closed = false;
    this.closedPromise = new Promise((resolve) => {
      this.resolveClosed = resolve;
    });

    socket.on('data', (chunk) => this.handleData(chunk));
    socket.on('error', () => {});
    socket.on('close', () => {
      this.closed = true;
      this.resolveClosed();
      for (const waiter of this.waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Named pipe connection closed before a response arrived'));
      }
    });
  }

  handleData(chunk) {
    this.buffer = this.buffer.length > 0 ? Buffer.concat([this.buffer, chunk]) : chunk;
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf(0x0a)) !== -1) {
      let frame = this.buffer.subarray(0, newlineIndex);
      this.buffer = Buffer.from(this.buffer.subarray(newlineIndex + 1));
      if (frame.length > 0 && frame[frame.length - 1] === 0x0d) {
        frame = frame.subarray(0, frame.length - 1);
      }
      this.pushMessage(JSON.parse(frame.toString('utf8')));
    }
  }

  pushMessage(message) {
    const waiter = this.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }
    this.messages.push(message);
  }

  send(message) {
    this.sendRaw(`${JSON.stringify(message)}\n`);
  }

  sendRaw(value) {
    this.socket.write(value, 'utf8');
  }

  nextMessage(timeoutMs = TEST_TIMEOUT_MS) {
    if (this.messages.length > 0) {
      return Promise.resolve(this.messages.shift());
    }
    if (this.closed) {
      return Promise.reject(new Error('Named pipe connection is already closed'));
    }

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) {
          this.waiters.splice(index, 1);
        }
        reject(new Error('Timed out waiting for a JSON Lines response'));
      }, timeoutMs);
      waiter.timer.unref?.();
      this.waiters.push(waiter);
    });
  }

  waitForClose() {
    return withTimeout(this.closedPromise, 'named pipe connection to close');
  }

  close() {
    this.socket.destroy();
  }
}

function connectClient(pipePath) {
  return withTimeout(new Promise((resolve, reject) => {
    const socket = net.createConnection(pipePath);
    const handleError = (error) => {
      socket.destroy();
      reject(error);
    };

    socket.once('error', handleError);
    socket.once('connect', () => {
      socket.removeListener('error', handleError);
      resolve(new JsonLineClient(socket));
    });
  }), 'named pipe connection');
}

function createTranslateMessage(requestId, text, overrides = {}) {
  return {
    type: 'translate',
    requestId,
    surface: 'Talk',
    speaker: 'Alphinaud',
    text,
    sourceHash: sourceHash(text),
    sentAt: Date.now(),
    ...overrides,
  };
}

function assertNoSecret(value) {
  assert.equal(JSON.stringify(value).includes(API_SECRET_SENTINEL), false);
}

async function run() {
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fftrans-dalamud-bridge-'));
  const descriptorPath = path.join(temporaryDirectory, 'dalamud-bridge.json');
  const secondDescriptorPath = path.join(temporaryDirectory, 'dalamud-bridge-second.json');
  const pipeName = `fftrans-dalamud-test-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const pipePath = getPipePath(pipeName);
  const clients = [];
  const holdResolvers = [];
  let resolveTwoHoldsStarted;
  const twoHoldsStarted = new Promise((resolve) => {
    resolveTwoHoldsStarted = resolve;
  });
  let releaseShutdownTranslation;
  let resolveShutdownTranslationStarted;
  const shutdownTranslationStarted = new Promise((resolve) => {
    resolveShutdownTranslationStarted = resolve;
  });
  let mockCallCount = 0;
  let bridge;
  let secondBridge;

  const config = {
    dalamudBridge: {
      enabled: true,
      pipeName,
    },
    translation: {
      engine: 'MockEngine',
      from: 'English',
      to: 'Simplified-Chinese',
      fix: false,
    },
    api: {
      mockApiKey: API_SECRET_SENTINEL,
    },
  };
  const silentLogger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
  const mockTranslator = async (request, context) => {
    mockCallCount += 1;
    assert.equal(context.translationConfig.engine, 'MockEngine');

    if (request.text === 'throw-secret') {
      throw new Error(API_SECRET_SENTINEL);
    }

    if (request.text === 'error-string') {
      return 'Error: upstream translator failed';
    }

    if (request.text === 'shutdown-hold') {
      return new Promise((resolve) => {
        releaseShutdownTranslation = () => resolve({
          translation: 'mock:shutdown-hold',
          engine: 'MockEngine',
        });
        resolveShutdownTranslationStarted();
      });
    }

    if (request.text.startsWith('hold-')) {
      return new Promise((resolve) => {
        holdResolvers.push(() => resolve({
          translation: `mock:${request.text}`,
          engine: 'MockEngine',
        }));
        if (holdResolvers.length === 2) {
          resolveTwoHoldsStarted();
        }
      });
    }

    return {
      translation: `译文：${request.text} 🌙`,
      engine: 'MockEngine',
    };
  };

  try {
    bridge = createDalamudBridge({
      getConfig: () => config,
      translateRequest: mockTranslator,
      descriptorPath,
      maxFrameBytes: MAX_FRAME_BYTES,
      maxTextBytes: MAX_TEXT_BYTES,
      maxConcurrentRequests: 2,
      authTimeoutMs: 1000,
      shutdownTimeoutMs: 1000,
      logger: silentLogger,
    });
    const status = await bridge.start();
    assert.equal(status.state, 'running');
    assert.equal(Object.hasOwn(status, 'authToken'), false);

    const descriptorText = await fs.promises.readFile(descriptorPath, 'utf8');
    const descriptor = JSON.parse(descriptorText);
    assert.deepEqual(Object.keys(descriptor).sort(), [
      'authToken',
      'pipeName',
      'protocolVersion',
      'transport',
      'updatedAt',
    ]);
    assert.equal(descriptor.protocolVersion, PROTOCOL_VERSION);
    assert.equal(descriptor.transport, TRANSPORT);
    assert.equal(descriptor.pipeName, pipeName);
    assert.match(descriptor.authToken, /^[a-f0-9]{64}$/);
    assert.equal(new Date(descriptor.updatedAt).toISOString(), descriptor.updatedAt);
    assertNoSecret(descriptorText);

    const unauthenticatedClient = await connectClient(pipePath);
    clients.push(unauthenticatedClient);
    unauthenticatedClient.send(createTranslateMessage('preauth-1', 'must not translate'));
    const preauthResponse = await unauthenticatedClient.nextMessage();
    assert.equal(preauthResponse.type, 'error');
    assert.equal(preauthResponse.errorCode, 'AUTH_REQUIRED');
    assert.equal(mockCallCount, 0);
    await unauthenticatedClient.waitForClose();

    const invalidAuthClient = await connectClient(pipePath);
    clients.push(invalidAuthClient);
    const wrongToken = `${descriptor.authToken[0] === '0' ? '1' : '0'}${descriptor.authToken.slice(1)}`;
    invalidAuthClient.send({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      authToken: wrongToken,
    });
    const invalidAuthResponse = await invalidAuthClient.nextMessage();
    assert.equal(invalidAuthResponse.type, 'error');
    assert.equal(invalidAuthResponse.errorCode, 'AUTH_FAILED');
    assertNoSecret(invalidAuthResponse);
    await invalidAuthClient.waitForClose();

    const client = await connectClient(pipePath);
    clients.push(client);
    client.send({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      authToken: descriptor.authToken,
    });
    const helloResponse = await client.nextMessage();
    assert.deepEqual(helloResponse, {
      type: 'hello.ok',
      protocolVersion: PROTOCOL_VERSION,
    });

    const unicodeText = 'Hello, 世界 👋 — エオルゼア';
    client.send(createTranslateMessage('unicode-1', unicodeText, {
      surface: 'BattleTalk',
      speaker: '阿尔菲诺',
      sentAt: new Date().toISOString(),
    }));
    const unicodeResponse = await client.nextMessage();
    assert.equal(unicodeResponse.type, 'translation');
    assert.equal(unicodeResponse.success, true);
    assert.equal(unicodeResponse.requestId, 'unicode-1');
    assert.equal(unicodeResponse.sourceHash, sourceHash(unicodeText));
    assert.equal(unicodeResponse.translation, `译文：${unicodeText} 🌙`);
    assert.equal(unicodeResponse.engine, 'MockEngine');
    assert.equal(Number.isInteger(unicodeResponse.latencyMs), true);
    assertNoSecret(unicodeResponse);
    assert.equal(mockCallCount, 1);

    const compatibleText = 'Current plugin model compatibility';
    client.send({
      type: 'translate',
      requestId: 'minimal-v1-1',
      speaker: 'Alphinaud',
      text: compatibleText,
      sourceHash: sourceHash(compatibleText),
    });
    const compatibleResponse = await client.nextMessage();
    assert.equal(compatibleResponse.success, true);
    assert.equal(compatibleResponse.requestId, 'minimal-v1-1');
    assert.equal(mockCallCount, 2);

    client.send(createTranslateMessage('secret-error-1', 'throw-secret'));
    const secretErrorResponse = await client.nextMessage();
    assert.equal(secretErrorResponse.success, false);
    assert.equal(secretErrorResponse.errorCode, 'TRANSLATION_FAILED');
    assert.equal(secretErrorResponse.errorMessage, 'Translation failed.');
    assertNoSecret(secretErrorResponse);
    assert.equal(mockCallCount, 3);

    client.send(createTranslateMessage('string-error-1', 'error-string'));
    const stringErrorResponse = await client.nextMessage();
    assert.equal(stringErrorResponse.success, false);
    assert.equal(stringErrorResponse.errorCode, 'TRANSLATION_FAILED');
    assert.equal(stringErrorResponse.errorMessage, 'Translation failed.');
    assert.equal(mockCallCount, 4);

    client.send(createTranslateMessage('hash-error-1', 'hash mismatch', {
      sourceHash: '0'.repeat(64),
    }));
    const hashErrorResponse = await client.nextMessage();
    assert.equal(hashErrorResponse.type, 'translation');
    assert.equal(hashErrorResponse.success, false);
    assert.equal(hashErrorResponse.errorCode, 'SOURCE_HASH_MISMATCH');
    assert.equal(hashErrorResponse.translation, '');
    assert.equal(mockCallCount, 4);

    const tooLongText = 'x'.repeat(MAX_TEXT_BYTES + 1);
    client.send(createTranslateMessage('text-too-long-1', tooLongText));
    const tooLongTextResponse = await client.nextMessage();
    assert.equal(tooLongTextResponse.success, false);
    assert.equal(tooLongTextResponse.errorCode, 'TEXT_TOO_LONG');
    assert.equal(mockCallCount, 4);

    const oversizedClient = await connectClient(pipePath);
    clients.push(oversizedClient);
    oversizedClient.send({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      authToken: descriptor.authToken,
    });
    assert.equal((await oversizedClient.nextMessage()).type, 'hello.ok');
    oversizedClient.sendRaw(`${JSON.stringify({
      type: 'translate',
      padding: 'x'.repeat(MAX_FRAME_BYTES),
    })}\n`);
    const oversizedResponse = await oversizedClient.nextMessage();
    assert.equal(oversizedResponse.type, 'error');
    assert.equal(oversizedResponse.errorCode, 'FRAME_TOO_LARGE');
    await oversizedClient.waitForClose();

    secondBridge = createDalamudBridge({
      getConfig: () => config,
      translateRequest: mockTranslator,
      descriptorPath: secondDescriptorPath,
      logger: silentLogger,
    });
    await assert.rejects(secondBridge.start(), (error) => {
      assert.equal(error.code, 'DALAMUD_PIPE_IN_USE');
      assert.match(error.message, /already in use/i);
      return true;
    });
    assert.equal(await fs.promises.access(secondDescriptorPath).then(() => true, () => false), false);

    client.send(createTranslateMessage('hold-1', 'hold-one'));
    client.send(createTranslateMessage('hold-2', 'hold-two'));
    await withTimeout(twoHoldsStarted, 'two mock translations to start');
    client.send(createTranslateMessage('busy-1', 'must-be-rejected'));
    const busyResponse = await client.nextMessage();
    assert.equal(busyResponse.type, 'translation');
    assert.equal(busyResponse.success, false);
    assert.equal(busyResponse.requestId, 'busy-1');
    assert.equal(busyResponse.errorCode, 'BRIDGE_BUSY');
    assert.equal(mockCallCount, 6);

    for (const release of holdResolvers) {
      release();
    }
    const concurrentResponses = [await client.nextMessage(), await client.nextMessage()]
      .sort((left, right) => left.requestId.localeCompare(right.requestId));
    assert.deepEqual(concurrentResponses.map((response) => response.requestId), ['hold-1', 'hold-2']);
    assert.equal(concurrentResponses.every((response) => response.success === true), true);

    client.send(createTranslateMessage('shutdown-1', 'shutdown-hold'));
    await withTimeout(shutdownTranslationStarted, 'shutdown translation to start');
    const clientClosed = client.waitForClose();
    const shutdownPromise = bridge.shutdown();
    await clientClosed;
    releaseShutdownTranslation();
    await shutdownPromise;
    assert.equal(bridge.getStatus().state, 'stopped');
    assert.equal(bridge.getStatus().activeRequests, 0);
    assert.equal(await fs.promises.access(descriptorPath).then(() => true, () => false), false);
    await assert.rejects(connectClient(pipePath));

    console.log('Dalamud bridge verification passed: descriptor, auth rejection/handshake, Unicode/hash, limits, concurrency, EADDRINUSE, and shutdown.');
  } finally {
    for (const client of clients) {
      client.close();
    }
    await secondBridge?.shutdown().catch(() => {});
    releaseShutdownTranslation?.();
    await bridge?.shutdown().catch(() => {});
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
