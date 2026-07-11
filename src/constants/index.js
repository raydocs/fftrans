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
    PICK_APP_CHECK_TOKEN: 'pick-app-check-token',

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
    CREATE_WINDOW: 'create-window',
    RESTART_WINDOW: 'restart-window',
    MOVE_WINDOW: 'move-window',
    MINIMIZE_WINDOW: 'minimize-window',
    RESTORE_WINDOW: 'restore-window',
    CLOSE_WINDOW: 'close-window',
    SET_ALWAYS_ON_TOP: 'set-always-on-top',
    SET_FOCUSABLE: 'set-focusable',
    SET_MIN_SIZE: 'set-min-size',
    SET_CLICK_THROUGH: 'set-click-through',
    GET_CLICK_THROUGH_CONFIG: 'get-click-through-config',
    SET_CLICK_THROUGH_CONFIG: 'set-click-through-config',
    MUTE_WINDOW: 'mute-window',
    SEND_INDEX: 'send-index',
    CHANGE_UI_TEXT: 'change-ui-text',
    OPEN_EXTERNAL_URL: 'open-external-url',
    OPEN_PATH: 'open-path',
    SHOW_INFO: 'show-info',
    MINIMIZE_ALL_WINDOWS: 'minimize-all-windows',
    HIDE_BUTTON: 'hide-button',

    // Capture
    GET_SCREEN_BOUNDS: 'get-screen-bounds',
    GET_MOUSE_POSITION: 'get-mouse-position',
    START_RECOGNIZE: 'start-recognize',
    TRANSLATE_IMAGE_TEXT: 'translate-image-text',
    SET_GOOGLE_CREDENTIAL: 'set-google-credential',

    // Dialog
    ADD_LOG: 'add-log',
    ADD_NOTIFICATION: 'add-notification',
    ADD_DIALOG: 'add-dialog',
    UPDATE_DIALOG: 'update-dialog',
    REMOVE_DIALOG: 'remove-dialog',
    HIDE_DIALOG: 'hide-dialog',
    CLEAR_DIALOG: 'clear-dialog',
    RESET_DIALOG_STYLE: 'reset-dialog-style',
    SHOW_DIALOG: 'show-dialog',
    MOVE_TO_BOTTOM: 'move-to-bottom',
    CREATE_LOG_NAME: 'create-log-name',

    // File
    READ_DIRECTORY: 'read-directory',
    READ_JSON: 'read-json',
    GET_PATH: 'get-path',
    GET_ROOT_PATH: 'get-root-path',
    GET_USER_DATA_PATH: 'get-user-data-path',

    // JSON
    CLEAR_CACHE: 'clear-cache',
    INITIALIZE_JSON: 'initialize-json',
    DOWNLOAD_JSON: 'download-json',
    LOAD_JSON: 'load-json',
    DELETE_TEMP: 'delete-temp',
    GET_USER_ARRAY: 'get-user-array',
    SAVE_USER_CUSTOM: 'save-user-custom',
    DELETE_USER_CUSTOM: 'delete-user-custom',
    CREATE_TABLE: 'create-table',

    // Request
    SET_UA: 'set-ua',
    VERSION_CHECK: 'version-check',
    POST_FORM: 'post-form',

    // Translation
    SHOW_TRANSLATION: 'show-translation',
    TRANSLATION_CHUNK: 'translation-chunk',
    GET_ENGINE_SELECT: 'get-engine-select',
    GET_ALL_LANGUAGE_SELECT: 'get-all-language-select',
    GET_SOURCE_SELECT: 'get-source-select',
    GET_PLAYER_SOURCE_SELECT: 'get-player-source-select',
    GET_TARGET_SELECT: 'get-target-select',
    GET_UI_SELECT: 'get-ui-select',
    GET_AI_LIST: 'get-ai-list',
    TEST_AI_TRANSLATION: 'test-ai-translation',
    GET_LLM_MODELS: 'get-llm-models',
    BENCHMARK_TTS: 'benchmark-tts',
    ADD_TASK: 'add-task',
    TRANSLATE_TEXT: 'translate-text',
    TRANSLATE_TEXT_STREAM: 'translate-text-stream',
    CACHE_GET_STATS: 'cache-get-stats',
    CACHE_CLEAR: 'cache-clear',
    CACHE_RESET_STATS: 'cache-reset-stats',

    // TTS
    TEST_SPEECHIFY_CONFIG: 'test-speechify-config',
    GET_SPEECHIFY_CONFIG: 'get-speechify-config',
    SET_SPEECHIFY_CONFIG: 'set-speechify-config',
    GET_TTS_ENGINE: 'get-tts-engine',
    SET_TTS_ENGINE: 'set-tts-engine',
    PREVIEW_SPEECHIFY_VOICE: 'preview-speechify-voice',
    TEST_ELEVENLABS_CONFIG: 'test-elevenlabs-config',
    PREVIEW_ELEVENLABS_VOICE: 'preview-elevenlabs-voice',
    GET_AUTH_STATUS: 'get-auth-status',
    BEGIN_BROWSER_ASSIST: 'begin-browser-assist',
    CHECK_BROWSER_ASSIST_LOGIN: 'check-browser-assist-login',
    BEGIN_EXTENSION_BRIDGE_PAIRING: 'begin-extension-bridge-pairing',
    CHECK_EXTENSION_BRIDGE_IMPORT: 'check-extension-bridge-import',
    VALIDATE_ELEVENLABS_CONFIG: 'validate-elevenlabs-config',
    VALIDATE_REFRESH_TOKEN: 'validate-refresh-token',
    CLEAR_AUTH_SESSION: 'clear-auth-session',
    TEST_CURRENT_TTS_ENGINE: 'test-current-tts-engine',
    GET_TTS_VOICES: 'get-tts-voices',
    TEST_MIMO_CONFIG: 'test-mimo-config',
    GET_MIMO_CONFIG: 'get-mimo-config',
    SET_MIMO_CONFIG: 'set-mimo-config',
    PREVIEW_MIMO_VOICE: 'preview-mimo-voice',
    TEST_FISH_CONFIG: 'test-fish-config',
    PREVIEW_FISH_VOICE: 'preview-fish-voice',
    GOOGLE_TTS: 'google-tts',
    SPEECHIFY_TTS: 'speechify-tts',
    ELEVENLABS_TTS: 'elevenlabs-tts',
    ELEVENLABS_TTS_PROGRESSIVE: 'elevenlabs-tts-progressive',
    ELEVENLABS_TTS_PROGRESSIVE_CHUNK: 'elevenlabs-tts-progressive-chunk',
    ELEVENLABS_TTS_PROGRESSIVE_COMPLETE: 'elevenlabs-tts-progressive-complete',
    ELEVENLABS_TTS_PROGRESSIVE_ERROR: 'elevenlabs-tts-progressive-error',
    MIMO_TTS: 'mimo-tts',

    // Fish 流式 TTS（主进程 → 渲染层，边收边播）
    FISH_TTS_STREAM_START: 'fish-tts-stream-start',
    FISH_TTS_STREAM_CHUNK: 'fish-tts-stream-chunk',
    FISH_TTS_STREAM_END: 'fish-tts-stream-end',
    FISH_TTS_STREAM_ERROR: 'fish-tts-stream-error',

    // Global Shortcut
    SET_GLOBAL_SHORTCUT: 'set-global-shortcut',

    // Data
    SEND_DATA: 'send-data',
    RESET_VIEW: 'reset-view',
    REVEAL_COMPACT_CONTROLS: 'reveal-compact-controls',
    ADD_TO_PLAYLIST: 'add-to-playlist',
    HIDE_UPDATE_BUTTON: 'hide-update-button',
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
    // Legacy helper: matches strings without CJK ideographs.
    NO_KANJI: /^[^\u3100-\u312F\u3400-\u4DBF\u4E00-\u9FFF]+$/,
    // Authoritative rule for short custom-text suffix handling.
    ALL_KANJI_KATAKANA: /^[\u3100-\u312F\u3400-\u4DBF\u4E00-\u9FFFァ-ヺ]+ー?$/,
};

function shouldAppendShortTextMarker(text = '', type = '') {
    return type !== CUSTOM_TYPES.CUSTOM_OVERWRITE &&
        text.length < 3 &&
        !REGEX_PATTERNS.ALL_KANJI_KATAKANA.test(text);
}

const ERROR_MESSAGES = {
    INVALID_INPUT: 'Invalid input provided',
    INVALID_TYPE: 'Invalid type specified',
    INVALID_PATH: 'Invalid file path',
    PATH_TRAVERSAL: 'Path traversal detected',
    UNSAFE_EXTENSION: 'Unsafe file extension',
};

const ELEVENLABS_AUTH_STATES = {
    UNCONFIGURED: 'unconfigured',
    READY: 'ready',
    SESSION_ONLY: 'session-only',
    ERROR: 'error',
};

const ELEVENLABS_AUTH_SOURCES = {
    NONE: 'none',
    REFRESH_TOKEN: 'refresh-token',
    SESSION_CACHE: 'session-cache',
    MANUAL_BEARER: 'manual-bearer',
    LEGACY_BEARER_MIGRATION: 'legacy-bearer-migration',
    EXTENSION_BRIDGE: 'extension-bridge',
};

const ELEVENLABS_BROWSER_ASSIST_BEARER_STATUS = {
    UNAVAILABLE: 'unavailable',
    TRUSTED: 'trusted',
    UNTRUSTED: 'untrusted',
};

const ELEVENLABS_BROWSER_ASSIST_BEARER_VALIDATION = {
    UNTESTED: 'untested',
    VALIDATED: 'validated',
    REJECTED: 'rejected',
};

module.exports = {
    IPC_CHANNELS,
    NOTIFICATIONS,
    FILE_NAMES,
    CUSTOM_TYPES,
    REGEX_PATTERNS,
    shouldAppendShortTextMarker,
    ERROR_MESSAGES,
    ELEVENLABS_AUTH_STATES,
    ELEVENLABS_AUTH_SOURCES,
    ELEVENLABS_BROWSER_ASSIST_BEARER_STATUS,
    ELEVENLABS_BROWSER_ASSIST_BEARER_VALIDATION,
};
