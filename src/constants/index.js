'use strict';

/**
 * Application-wide constants
 * Centralizes all magic strings, channel names, and configuration values
 */

const IPC_CHANNELS = {
    // System
    GET_VERSION: 'get-version',
    CLOSE_APP: 'close-app',
    GET_CONFIG: 'get-config',
    SET_CONFIG: 'set-config',
    SET_DEFAULT_CONFIG: 'set-default-config',
    CONSOLE_LOG: 'console-log',

    // Theme
    GET_THEME: 'get-theme',
    APPLY_THEME_TO_ALL_WINDOWS: 'apply-theme-to-all-windows',
    SET_THEME: 'set-theme',

    // Chat Code
    GET_CHAT_CODE: 'get-chat-code',
    SET_CHAT_CODE: 'set-chat-code',
    SET_DEFAULT_CHAT_CODE: 'set-default-chat-code',

    // Sharlayan
    RESTART_SHARLAYAN_READER: 'restart-sharlayan-reader',
    FIX_READER: 'fix-reader',

    // Window
    MINIMIZE_ALL_WINDOWS: 'minimize-all-windows',
    HIDE_BUTTON: 'hide-button',

    // Capture
    GET_SCREEN_BOUNDS: 'get-screen-bounds',
    GET_MOUSE_POSITION: 'get-mouse-position',
    START_RECOGNIZE: 'start-recognize',
    TRANSLATE_IMAGE_TEXT: 'translate-image-text',
    SET_GOOGLE_CREDENTIAL: 'set-google-credential',

    // JSON
    INITIALIZE_JSON: 'initialize-json',
    DOWNLOAD_JSON: 'download-json',
    LOAD_JSON: 'load-json',
    DELETE_TEMP: 'delete-temp',
    GET_USER_ARRAY: 'get-user-array',
    SAVE_USER_CUSTOM: 'save-user-custom',
    DELETE_USER_CUSTOM: 'delete-user-custom',
    CREATE_TABLE: 'create-table',

    // TTS
    TEST_SPEECHIFY_CONFIG: 'test-speechify-config',
    GET_SPEECHIFY_CONFIG: 'get-speechify-config',
    SET_SPEECHIFY_CONFIG: 'set-speechify-config',
    GET_TTS_ENGINE: 'get-tts-engine',
    SET_TTS_ENGINE: 'set-tts-engine',
    PREVIEW_SPEECHIFY_VOICE: 'preview-speechify-voice',
    TEST_ELEVENLABS_CONFIG: 'test-elevenlabs-config',
    PREVIEW_ELEVENLABS_VOICE: 'preview-elevenlabs-voice',

    // Global Shortcut
    SET_GLOBAL_SHORTCUT: 'set-global-shortcut',

    // Data
    SEND_DATA: 'send-data',
};

const NOTIFICATIONS = {
    GOOGLE_CREDENTIAL_SAVED: 'GOOGLE_CREDENTIAL_SAVED',
    GOOGLE_CREDENTIAL_ERROR: 'GOOGLE_CREDENTIAL_ERROR',
    INCORRECT_FILE: 'INCORRECT_FILE',
    INVALID_PATH: 'INVALID_PATH',
    TEMP_DELETED: 'TEMP_DELETED',
};

const FILE_NAMES = {
    CUSTOM_SOURCE: 'custom-source.json',
    CUSTOM_OVERWRITE: 'custom-overwrite.json',
    PLAYER_NAME: 'player-name.json',
    CUSTOM_TARGET: 'custom-target.json',
    TEMP_NAME: 'temp-name.json',
    GOOGLE_CREDENTIAL: 'google-vision-credential.json',
    COMMON_PHRASES: 'common-phrases-en-chs.json',
};

const CUSTOM_TYPES = {
    CUSTOM_SOURCE: 'custom-source',
    CUSTOM_OVERWRITE: 'custom-overwrite',
    PLAYER: 'player',
    RETAINER: 'retainer',
    CUSTOM_TARGET: 'custom-target',
};

const REGEX_PATTERNS = {
    // No kanji pattern
    NO_KANJI: /^[^\u3100-\u312F\u3400-\u4DBF\u4E00-\u9FFF]+$/,
};

const ERROR_MESSAGES = {
    INVALID_INPUT: 'Invalid input provided',
    INVALID_TYPE: 'Invalid type specified',
    INVALID_PATH: 'Invalid file path',
    PATH_TRAVERSAL: 'Path traversal detected',
    UNSAFE_EXTENSION: 'Unsafe file extension',
};

module.exports = {
    IPC_CHANNELS,
    NOTIFICATIONS,
    FILE_NAMES,
    CUSTOM_TYPES,
    REGEX_PATTERNS,
    ERROR_MESSAGES,
};
