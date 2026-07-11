'use strict';

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { TextDecoder } = require('util');
const Logger = require('../../utils/logger');

const PROTOCOL_VERSION = 1;
const TRANSPORT = 'named-pipe';
const DEFAULT_PIPE_NAME = 'fftrans-dalamud-v1';
const DEFAULT_MAX_FRAME_BYTES = 64 * 1024;
const DEFAULT_MAX_TEXT_BYTES = 16 * 1024;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 4;
const DEFAULT_AUTH_TIMEOUT_MS = 5000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;
const MAX_REQUEST_ID_BYTES = 128;
const MAX_SURFACE_BYTES = 64;
const MAX_SPEAKER_BYTES = 256;
const MAX_SENT_AT_BYTES = 64;
const PIPE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SOURCE_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function createDefaultLogger() {
  return {
    debug(message, data) {
      Logger.debug('dalamud-bridge', message, data);
    },
    info(message, data) {
      Logger.info('dalamud-bridge', message, data);
    },
    warn(message, data) {
      Logger.warn('dalamud-bridge', message, data);
    },
    error(message, error) {
      Logger.error('dalamud-bridge', message, error);
    },
  };
}

function getDefaultConfig() {
  return require('./config-module').getConfig();
}

function getDefaultDescriptorPath() {
  return require('./file-module').getUserDataPath('config', 'dalamud-bridge.json');
}

function getPipePath(pipeName, platform = process.platform) {
  if (platform === 'win32') {
    return `\\\\.\\pipe\\${pipeName}`;
  }

  return path.join(os.tmpdir(), `${pipeName}.sock`);
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

function containsControlCharacter(value) {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function isBoundedString(value, maxBytes, options = {}) {
  if (typeof value !== 'string' || byteLength(value) > maxBytes) {
    return false;
  }

  if (options.allowEmpty !== true && value.length === 0) {
    return false;
  }

  if (options.trimmed === true && value.trim() !== value) {
    return false;
  }

  return options.allowControls === true || !containsControlCharacter(value);
}

function safeRequestId(value) {
  return isBoundedString(value, MAX_REQUEST_ID_BYTES, { trimmed: true }) ? value : '';
}

function safeSourceHash(value) {
  return typeof value === 'string' && SOURCE_HASH_PATTERN.test(value) ? value.toLowerCase() : '';
}

function safeEngine(value) {
  if (!isBoundedString(value, 64, { trimmed: true })) {
    return 'unknown';
  }
  return value;
}

function secureTokenEquals(receivedToken, expectedToken) {
  if (typeof receivedToken !== 'string' || !/^[a-f0-9]{64}$/i.test(receivedToken)) {
    return false;
  }

  const received = Buffer.from(receivedToken.toLowerCase(), 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeTranslatorResult(result, configuredEngine) {
  let normalized;

  if (typeof result === 'string') {
    normalized = { translation: result, engine: configuredEngine };
  } else if (result && typeof result === 'object' && typeof result.translation === 'string') {
    normalized = {
      translation: result.translation,
      engine: safeEngine(result.engine || configuredEngine),
    };
  } else {
    throw new Error('Translator returned an invalid result');
  }

  const translation = normalized.translation.trim();
  if (
    translation.length === 0
    || /^(?:assistant\s+)?(?:error|typeerror|axioserror|aggregateerror)\s*[:：]/i.test(translation)
    || /^translation failed\b/i.test(translation)
  ) {
    throw new Error('Translator returned an error response');
  }

  return {
    translation,
    engine: normalized.engine,
  };
}

async function translateWithExistingPipeline(request, context) {
  const translateModule = require('./translate-module');
  const enFix = require('../fix/en-fix');
  const { languageEnum } = require('./engine-module');
  const translation = { ...(context.translationConfig || {}) };
  const engine = safeEngine(translation.engine);

  if (translation.fix === true && translation.from === languageEnum.en) {
    const dialogData = {
      name: request.speaker,
      text: request.text,
      translation,
    };
    await enFix.start(dialogData);

    if (dialogData.translatedText instanceof Error) {
      throw dialogData.translatedText;
    }

    return {
      translation: typeof dialogData.translatedText === 'string'
        ? dialogData.translatedText
        : String(dialogData.translatedText || ''),
      engine,
    };
  }

  return {
    translation: await translateModule.translate(request.text, translation, [], 'sentence'),
    engine,
  };
}

function createFriendlyListenError(error, pipeName) {
  if (error?.code !== 'EADDRINUSE') {
    return error;
  }

  const friendlyError = new Error(
    `Dalamud bridge pipe "${pipeName}" is already in use. Another FFTrans instance may be running.`
  );
  friendlyError.code = 'DALAMUD_PIPE_IN_USE';
  friendlyError.cause = error;
  return friendlyError;
}

function waitWithTimeout(promise, timeoutMs) {
  let timeout;
  const timeoutPromise = new Promise((resolve) => {
    timeout = setTimeout(() => resolve(false), timeoutMs);
    timeout.unref?.();
  });

  return Promise.race([
    promise.then(() => true),
    timeoutPromise,
  ]).finally(() => clearTimeout(timeout));
}

class DalamudBridge {
  constructor(options = {}) {
    this.options = options;
    this.getConfig = options.getConfig || getDefaultConfig;
    this.translateRequest = options.translateRequest || translateWithExistingPipeline;
    this.logger = options.logger || createDefaultLogger();
    this.maxFrameBytes = options.maxFrameBytes || DEFAULT_MAX_FRAME_BYTES;
    this.maxTextBytes = options.maxTextBytes || DEFAULT_MAX_TEXT_BYTES;
    this.maxConcurrentRequests = options.maxConcurrentRequests || DEFAULT_MAX_CONCURRENT_REQUESTS;
    this.authTimeoutMs = options.authTimeoutMs || DEFAULT_AUTH_TIMEOUT_MS;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs || DEFAULT_SHUTDOWN_TIMEOUT_MS;
    this.server = null;
    this.connections = new Map();
    this.activeTasks = new Set();
    this.activeRequestIds = new Set();
    this.startPromise = null;
    this.shutdownPromise = null;
    this.state = 'stopped';
    this.pipeName = '';
    this.pipePath = '';
    this.descriptorPath = '';
    this.authToken = '';
    this.ownsPipe = false;
    this.descriptorWritten = false;
    this.closing = false;
  }

  getStatus() {
    return {
      state: this.state,
      protocolVersion: PROTOCOL_VERSION,
      transport: TRANSPORT,
      pipeName: this.pipeName,
      activeConnections: this.connections.size,
      activeRequests: this.activeTasks.size,
    };
  }

  async start() {
    if (this.state === 'running') {
      return this.getStatus();
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    if (this.shutdownPromise) {
      await this.shutdownPromise;
    }

    this.startPromise = this._start();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async _start() {
    this.state = 'starting';
    this.closing = false;
    this.descriptorWritten = false;

    const config = this.getConfig() || {};
    const bridgeConfig = config.dalamudBridge || {};
    const enabled = this.options.enabled === undefined
      ? bridgeConfig.enabled !== false
      : this.options.enabled === true;

    if (!enabled) {
      this.state = 'disabled';
      return this.getStatus();
    }

    this.pipeName = this.options.pipeName || bridgeConfig.pipeName || DEFAULT_PIPE_NAME;
    if (!PIPE_NAME_PATTERN.test(this.pipeName)) {
      const error = new Error('Dalamud bridge pipeName must use 1-128 letters, digits, dots, underscores, or hyphens.');
      error.code = 'DALAMUD_PIPE_NAME_INVALID';
      this.state = 'stopped';
      throw error;
    }

    this.pipePath = getPipePath(this.pipeName, this.options.platform);
    this.descriptorPath = this.options.descriptorPath || getDefaultDescriptorPath();
    this.authToken = crypto.randomBytes(32).toString('hex');

    try {
      await this._listen();
      this.ownsPipe = true;
      await this._writeDescriptor();
      this.descriptorWritten = true;
      this.state = 'running';
      this.logger.info(`Listening on named pipe "${this.pipeName}" (protocol v${PROTOCOL_VERSION})`);
      return this.getStatus();
    } catch (error) {
      const listenError = createFriendlyListenError(error, this.pipeName);
      await this._closeServer();
      await this._removePipeFileIfOwned();
      this.authToken = '';
      this.state = 'stopped';
      throw listenError;
    }
  }

  _listen() {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this._handleConnection(socket));
      this.server = server;

      const handleInitialError = (error) => {
        server.removeListener('listening', handleListening);
        reject(error);
      };
      const handleListening = () => {
        server.removeListener('error', handleInitialError);
        server.on('error', (error) => {
          this.logger.error('Named pipe server error', error);
        });
        resolve();
      };

      server.once('error', handleInitialError);
      server.once('listening', handleListening);
      server.listen(this.pipePath);
    });
  }

  async _writeDescriptor() {
    const descriptor = {
      protocolVersion: PROTOCOL_VERSION,
      transport: TRANSPORT,
      pipeName: this.pipeName,
      authToken: this.authToken,
      updatedAt: new Date().toISOString(),
    };
    const directory = path.dirname(this.descriptorPath);
    const temporaryPath = `${this.descriptorPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;

    await fs.promises.mkdir(directory, { recursive: true });
    try {
      await fs.promises.writeFile(temporaryPath, `${JSON.stringify(descriptor, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      await fs.promises.rm(this.descriptorPath, { force: true });
      await fs.promises.rename(temporaryPath, this.descriptorPath);
      await fs.promises.chmod(this.descriptorPath, 0o600).catch(() => {});
    } finally {
      await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    }
  }

  _handleConnection(socket) {
    if (this.closing || !['starting', 'running'].includes(this.state)) {
      socket.destroy();
      return;
    }

    const connection = {
      socket,
      buffer: Buffer.alloc(0),
      authenticated: false,
      terminated: false,
      authTimer: null,
    };
    this.connections.set(socket, connection);

    connection.authTimer = setTimeout(() => {
      this._terminate(connection, 'AUTH_TIMEOUT', 'Authentication timed out.');
    }, this.authTimeoutMs);
    connection.authTimer.unref?.();

    socket.on('data', (chunk) => this._handleData(connection, chunk));
    socket.on('error', (error) => {
      this.logger.debug('Named pipe client error', error.message);
    });
    socket.on('close', () => {
      clearTimeout(connection.authTimer);
      connection.terminated = true;
      connection.buffer = Buffer.alloc(0);
      this.connections.delete(socket);
    });
  }

  _handleData(connection, chunk) {
    if (connection.terminated || this.closing) {
      return;
    }

    const combined = connection.buffer.length > 0
      ? Buffer.concat([connection.buffer, chunk])
      : chunk;
    let offset = 0;

    while (!connection.terminated) {
      const newlineIndex = combined.indexOf(0x0a, offset);
      if (newlineIndex === -1) {
        break;
      }

      let frame = combined.subarray(offset, newlineIndex);
      offset = newlineIndex + 1;
      if (frame.length > 0 && frame[frame.length - 1] === 0x0d) {
        frame = frame.subarray(0, frame.length - 1);
      }

      if (frame.length > this.maxFrameBytes) {
        this._terminate(connection, 'FRAME_TOO_LARGE', 'JSON frame exceeds the allowed size.');
        return;
      }
      if (frame.length === 0) {
        this._terminate(connection, 'INVALID_FRAME', 'JSON frame must not be empty.');
        return;
      }

      this._handleFrame(connection, frame);
    }

    if (connection.terminated) {
      return;
    }

    connection.buffer = Buffer.from(combined.subarray(offset));
    if (connection.buffer.length > this.maxFrameBytes) {
      this._terminate(connection, 'FRAME_TOO_LARGE', 'JSON frame exceeds the allowed size.');
    }
  }

  _handleFrame(connection, frame) {
    let message;
    try {
      message = JSON.parse(utf8Decoder.decode(frame));
    } catch {
      this._terminate(connection, 'INVALID_JSON', 'Frame must contain valid UTF-8 JSON.');
      return;
    }

    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      this._terminate(connection, 'INVALID_MESSAGE', 'Message must be a JSON object.');
      return;
    }

    if (!connection.authenticated) {
      this._handleHello(connection, message);
      return;
    }

    if (message.type !== 'translate') {
      this._send(connection, {
        type: 'error',
        errorCode: 'UNSUPPORTED_MESSAGE',
        errorMessage: 'Only translate messages are accepted after authentication.',
      });
      return;
    }

    this._handleTranslate(connection, message);
  }

  _handleHello(connection, message) {
    if (message.type !== 'hello') {
      this._terminate(connection, 'AUTH_REQUIRED', 'The first message must authenticate the connection.');
      return;
    }

    if (message.protocolVersion !== PROTOCOL_VERSION) {
      this._terminate(connection, 'PROTOCOL_VERSION_UNSUPPORTED', `Protocol version ${PROTOCOL_VERSION} is required.`);
      return;
    }

    if (!secureTokenEquals(message.authToken, this.authToken)) {
      this._terminate(connection, 'AUTH_FAILED', 'Authentication failed.');
      return;
    }

    connection.authenticated = true;
    clearTimeout(connection.authTimer);
    this._send(connection, {
      type: 'hello.ok',
      protocolVersion: PROTOCOL_VERSION,
    });
  }

  _validateTranslateRequest(message) {
    if (!isBoundedString(message.requestId, MAX_REQUEST_ID_BYTES, { trimmed: true })) {
      return ['INVALID_REQUEST_ID', 'requestId must be a non-empty string of at most 128 UTF-8 bytes.'];
    }
    if (
      message.surface !== undefined
      && !isBoundedString(message.surface, MAX_SURFACE_BYTES, { trimmed: true })
    ) {
      return ['INVALID_SURFACE', 'surface must be a non-empty string of at most 64 UTF-8 bytes.'];
    }
    if (!isBoundedString(message.speaker, MAX_SPEAKER_BYTES, { allowEmpty: true })) {
      return ['INVALID_SPEAKER', 'speaker must be a string of at most 256 UTF-8 bytes.'];
    }
    if (typeof message.text !== 'string' || message.text.length === 0) {
      return ['INVALID_TEXT', 'text must be a non-empty string.'];
    }
    if (byteLength(message.text) > this.maxTextBytes) {
      return ['TEXT_TOO_LONG', `text exceeds the ${this.maxTextBytes}-byte UTF-8 limit.`];
    }
    if (typeof message.sourceHash !== 'string' || !SOURCE_HASH_PATTERN.test(message.sourceHash)) {
      return ['INVALID_SOURCE_HASH', 'sourceHash must be a SHA-256 hex string.'];
    }
    if (
      message.sentAt !== undefined
      && !(
        (typeof message.sentAt === 'number' && Number.isFinite(message.sentAt))
        || isBoundedString(message.sentAt, MAX_SENT_AT_BYTES, { trimmed: true })
      )
    ) {
      return ['INVALID_SENT_AT', 'sentAt must be a finite number or a non-empty string of at most 64 UTF-8 bytes.'];
    }

    const expectedHash = sha256(message.text);
    const providedHash = message.sourceHash.toLowerCase();
    if (!crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(expectedHash))) {
      return ['SOURCE_HASH_MISMATCH', 'sourceHash does not match text.'];
    }

    return null;
  }

  _getTranslationContext() {
    try {
      const config = this.getConfig() || {};
      const translationConfig = config.translation && typeof config.translation === 'object'
        ? { ...config.translation }
        : {};
      return {
        config,
        translationConfig,
        engine: safeEngine(translationConfig.engine),
      };
    } catch (error) {
      this.logger.error('Failed to read translation configuration', error);
      return {
        config: {},
        translationConfig: {},
        engine: 'unknown',
      };
    }
  }

  _handleTranslate(connection, message) {
    const startedAt = Date.now();
    const context = this._getTranslationContext();
    const validationError = this._validateTranslateRequest(message);

    if (validationError) {
      this._sendTranslationError(connection, message, context.engine, startedAt, ...validationError);
      return;
    }

    if (this.closing) {
      this._sendTranslationError(
        connection,
        message,
        context.engine,
        startedAt,
        'SERVER_SHUTTING_DOWN',
        'The translation bridge is shutting down.'
      );
      return;
    }

    if (this.activeRequestIds.has(message.requestId)) {
      this._sendTranslationError(
        connection,
        message,
        context.engine,
        startedAt,
        'DUPLICATE_REQUEST_ID',
        'requestId is already in progress.'
      );
      return;
    }

    if (this.activeTasks.size >= this.maxConcurrentRequests) {
      this._sendTranslationError(
        connection,
        message,
        context.engine,
        startedAt,
        'BRIDGE_BUSY',
        'The translation concurrency limit has been reached.'
      );
      return;
    }

    this.activeRequestIds.add(message.requestId);
    const task = this._executeTranslation(connection, message, context, startedAt);
    this.activeTasks.add(task);
    void task.finally(() => {
      this.activeTasks.delete(task);
      this.activeRequestIds.delete(message.requestId);
    });
  }

  async _executeTranslation(connection, message, context, startedAt) {
    try {
      const rawResult = await this.translateRequest(
        {
          requestId: message.requestId,
          surface: message.surface || 'unknown',
          speaker: message.speaker,
          text: message.text,
          sourceHash: message.sourceHash.toLowerCase(),
          sentAt: message.sentAt ?? null,
        },
        context
      );
      const result = normalizeTranslatorResult(rawResult, context.engine);
      const sent = this._send(connection, {
        type: 'translation',
        success: true,
        requestId: message.requestId,
        sourceHash: message.sourceHash.toLowerCase(),
        translation: result.translation,
        engine: result.engine,
        latencyMs: Math.max(0, Date.now() - startedAt),
      });

      if (!sent && !connection.terminated && !connection.socket.destroyed) {
        this._sendTranslationError(
          connection,
          message,
          result.engine,
          startedAt,
          'RESPONSE_TOO_LARGE',
          'The translation response exceeds the allowed frame size.'
        );
      }
    } catch (error) {
      this.logger.error(`Translation request "${message.requestId}" failed`, error);
      this._sendTranslationError(
        connection,
        message,
        context.engine,
        startedAt,
        'TRANSLATION_FAILED',
        'Translation failed.'
      );
    }
  }

  _sendTranslationError(connection, message, engine, startedAt, errorCode, errorMessage) {
    this._send(connection, {
      type: 'translation',
      success: false,
      requestId: safeRequestId(message.requestId),
      sourceHash: safeSourceHash(message.sourceHash),
      translation: '',
      engine: safeEngine(engine),
      latencyMs: Math.max(0, Date.now() - startedAt),
      errorCode,
      errorMessage,
    });
  }

  _send(connection, payload) {
    if (connection.terminated || connection.socket.destroyed || !connection.socket.writable) {
      return false;
    }

    const frame = `${JSON.stringify(payload)}\n`;
    if (byteLength(frame) > this.maxFrameBytes) {
      return false;
    }

    try {
      connection.socket.write(frame, 'utf8');
      return true;
    } catch (error) {
      this.logger.debug('Failed to write named pipe response', error.message);
      return false;
    }
  }

  _terminate(connection, errorCode, errorMessage) {
    if (connection.terminated) {
      return;
    }

    connection.terminated = true;
    connection.buffer = Buffer.alloc(0);
    clearTimeout(connection.authTimer);
    const frame = `${JSON.stringify({ type: 'error', errorCode, errorMessage })}\n`;

    if (!connection.socket.destroyed && connection.socket.writable) {
      try {
        connection.socket.end(frame, 'utf8');
        const destroyTimer = setTimeout(() => connection.socket.destroy(), 250);
        destroyTimer.unref?.();
        return;
      } catch {
        // Fall through to immediate destruction.
      }
    }

    connection.socket.destroy();
  }

  async shutdown() {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    if (this.startPromise) {
      await this.startPromise.catch(() => {});
    }

    this.shutdownPromise = this._shutdown();
    try {
      await this.shutdownPromise;
    } finally {
      this.shutdownPromise = null;
    }
  }

  async _shutdown() {
    this.closing = true;
    if (!this.server && !this.descriptorWritten && this.connections.size === 0) {
      this.state = this.state === 'disabled' ? 'disabled' : 'stopped';
      this.authToken = '';
      return;
    }

    this.state = 'stopping';
    const closePromise = this._closeServer();

    for (const connection of this.connections.values()) {
      clearTimeout(connection.authTimer);
      connection.terminated = true;
      connection.socket.destroy();
    }
    this.connections.clear();

    await closePromise;

    if (this.activeTasks.size > 0) {
      const completed = await waitWithTimeout(
        Promise.allSettled([...this.activeTasks]),
        this.shutdownTimeoutMs
      );
      if (!completed) {
        this.logger.warn(
          `Shutdown continued after waiting ${this.shutdownTimeoutMs}ms for active translations.`
        );
      }
    }

    await this._removeDescriptorIfOwned();
    await this._removePipeFileIfOwned();
    this.activeTasks.clear();
    this.activeRequestIds.clear();
    this.authToken = '';
    this.descriptorWritten = false;
    this.state = 'stopped';
    this.closing = false;
    this.logger.info('Named pipe bridge stopped');
  }

  async _closeServer() {
    const server = this.server;
    this.server = null;
    if (!server) {
      return;
    }

    await new Promise((resolve) => {
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  async _removeDescriptorIfOwned() {
    if (!this.descriptorWritten || !this.descriptorPath || !this.authToken) {
      return;
    }

    try {
      const descriptor = JSON.parse(await fs.promises.readFile(this.descriptorPath, 'utf8'));
      if (descriptor.authToken === this.authToken) {
        await fs.promises.rm(this.descriptorPath, { force: true });
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.logger.warn('Failed to clean up Dalamud bridge descriptor', error.message);
      }
    }
  }

  async _removePipeFileIfOwned() {
    if (!this.ownsPipe) {
      return;
    }

    this.ownsPipe = false;
    if ((this.options.platform || process.platform) !== 'win32' && this.pipePath) {
      await fs.promises.rm(this.pipePath, { force: true }).catch(() => {});
    }
  }
}

function createDalamudBridge(options = {}) {
  return new DalamudBridge(options);
}

const defaultBridge = createDalamudBridge();

module.exports = {
  PROTOCOL_VERSION,
  TRANSPORT,
  DEFAULT_PIPE_NAME,
  DEFAULT_MAX_FRAME_BYTES,
  DEFAULT_MAX_TEXT_BYTES,
  DEFAULT_MAX_CONCURRENT_REQUESTS,
  createDalamudBridge,
  getPipePath,
  initialize: () => defaultBridge.start(),
  shutdown: () => defaultBridge.shutdown(),
  getStatus: () => defaultBridge.getStatus(),
};
