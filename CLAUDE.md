# CLAUDE.md - AI Assistant Development Guide

**Last Updated:** 2025-11-15
**Repository:** [raydocs/tataru](https://github.com/raydocs/tataru)
**Version:** 0.0.1

This document provides comprehensive guidance for AI assistants (Claude, GPT, etc.) working on the Tataru Assistant codebase.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Design Patterns](#architecture--design-patterns)
3. [Directory Structure](#directory-structure)
4. [Key Components](#key-components)
5. [Development Workflows](#development-workflows)
6. [Git Conventions](#git-conventions)
7. [Code Conventions](#code-conventions)
8. [Testing & Debugging](#testing--debugging)
9. [Build & Release](#build--release)
10. [Common Tasks](#common-tasks)
11. [Important Notes](#important-notes)

---

## 🎯 Project Overview

**Tataru Assistant** is an Electron-based desktop application for real-time translation of Final Fantasy XIV (FFXIV) dialogue and cutscene subtitles.

### Core Features
- **Real-time Translation**: Game chat/dialogue via Sharlayan memory reader
- **15+ Translation Engines**: Traditional (Baidu, DeepL, Google) + AI (GPT, Claude, Gemini)
- **OCR Translation**: Screen capture with Tesseract.js and Google Cloud Vision
- **VibeProxy Integration**: OAuth-based authentication for AI services
- **Text Corrections**: 3.8 MB of curated dictionaries for accurate game term translations
- **Multi-window UI**: Overlay, settings, capture, dictionary, log viewer

### Technology Stack
- **Framework**: Electron 37.2.6
- **Language**: JavaScript (ES6+)
- **UI**: HTML5, CSS3 (Bootstrap 5), Vanilla JS
- **Process Management**: Node.js child_process
- **Image Processing**: Sharp
- **OCR**: Tesseract.js, Google Cloud Vision
- **HTTP Client**: Axios
- **File Watching**: Chokidar (for VibeProxy token monitoring)
- **Encryption**: Crypto-JS

### Target Platform
- **Primary**: Windows (NSIS installer)
- **Development**: Cross-platform (Windows/Mac/Linux)
- **Build**: electron-builder

---

## 🏗 Architecture & Design Patterns

### Electron Multi-Process Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Main Process                          │
│  (src/main.js)                                          │
│                                                          │
│  ┌────────────────┐  ┌──────────────────┐              │
│  │  app-module    │  │  window-module   │              │
│  │  (lifecycle)   │  │  (UI windows)    │              │
│  └────────────────┘  └──────────────────┘              │
│                                                          │
│  ┌────────────────┐  ┌──────────────────┐              │
│  │  ipc-module    │  │ vibeproxy-manager│              │
│  │  (IPC handlers)│  │  (OAuth proxy)   │              │
│  └────────────────┘  └──────────────────┘              │
│                                                          │
│  ┌─────────────────────────────────────────┐           │
│  │  sharlayan-module (FFXIV reader)        │           │
│  │  translate-module (orchestration)       │           │
│  │  server-module (data processing)        │           │
│  └─────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────┘
                          │
                          │ IPC
                          ↓
┌─────────────────────────────────────────────────────────┐
│                 Renderer Processes                       │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  index   │  │  config  │  │  capture │             │
│  │  (overlay)│  │ (settings)│  │  (OCR)   │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │dictionary│  │  custom  │  │ read-log │             │
│  └──────────┘  └──────────┘  └──────────┘             │
└─────────────────────────────────────────────────────────┘
```

### Design Patterns

1. **Module Pattern**: Each module exports a singleton object with public methods
2. **Event-Driven**: Heavy use of IPC for cross-process communication
3. **Factory Pattern**: `window-module.js` creates windows on demand
4. **Singleton**: `vibeproxy-manager.js` uses singleton pattern
5. **Observer**: File watching (chokidar) for VibeProxy auth tokens
6. **Strategy**: `translate-module.js` selects translation engine dynamically

### Data Flow: Translation Pipeline

```
FFXIV Game Memory
    ↓
Sharlayan Reader (spawned C# process)
    ↓ stdout JSON: {type, code, name, text}
sharlayan-module.js (parse & deduplicate)
    ↓
server-module.js (apply text fixes from JSON dictionaries)
    ↓
translate-module.js (orchestration)
    ↓
engine-module.js (select engine: openrouter/gpt/deepl/etc.)
    ↓
translator/*.js (execute API request)
    ↓ translated text
translate-module.js (post-process: zh-convert)
    ↓
dialog-module.js (add to dialog list)
    ↓ IPC: 'add-dialog'
index window renderer (display in overlay)
```

---

## 📁 Directory Structure

```
/home/user/tataru/
├── .github/workflows/          # CI/CD automation
│   ├── build.yml              # Auto-build on push/schedule (every 2 hours)
│   └── manual-build.yml       # Manual build trigger
│
├── src/                       # Main source code
│   ├── main.js               # ⭐ Electron main process entry point
│   │
│   ├── html/                 # UI components
│   │   ├── index.html        # Main translation overlay
│   │   ├── config.html       # Settings window (div-based sections)
│   │   ├── capture.html      # Screen capture window
│   │   ├── custom.html       # Custom translation manager
│   │   ├── dictionary.html   # Translation lookup tool
│   │   ├── edit.html         # OCR text editor
│   │   ├── read-log.html     # Log viewer
│   │   ├── css/              # Styles (13 files: Bootstrap + custom)
│   │   ├── js/               # UI utilities (drag, speech, language)
│   │   └── img/              # Icons (Material Design SVG)
│   │
│   ├── module/               # ⭐ Core functionality modules
│   │   ├── system/           # System-level modules (17 files)
│   │   │   ├── app-module.js          # App initialization & lifecycle
│   │   │   ├── window-module.js       # Window creation & management
│   │   │   ├── ipc-module.js          # IPC handler registration (100+ handlers)
│   │   │   ├── config-module.js       # Configuration CRUD
│   │   │   ├── sharlayan-module.js    # FFXIV chat reader integration
│   │   │   ├── translate-module.js    # Translation orchestration
│   │   │   ├── dialog-module.js       # Dialog display logic
│   │   │   ├── engine-module.js       # Translation engine selection
│   │   │   ├── request-module.js      # HTTP requests (axios wrapper)
│   │   │   ├── screenshot-module.js   # Screen capture
│   │   │   ├── text-detect-module.js  # OCR (Tesseract.js)
│   │   │   ├── image-module.js        # Image processing (sharp)
│   │   │   ├── file-module.js         # File I/O operations
│   │   │   ├── server-module.js       # Data processing server
│   │   │   ├── version-module.js      # Version checking
│   │   │   └── notification-module.js # System notifications
│   │   │
│   │   ├── translator/       # Translation service integrations (19 files)
│   │   │   ├── baidu.js              # Baidu Translate
│   │   │   ├── youdao.js             # Youdao Translate
│   │   │   ├── caiyun.js             # Caiyun Translate
│   │   │   ├── papago.js             # Papago (Naver)
│   │   │   ├── deepl.js              # DeepL
│   │   │   ├── google.js             # Google Translate
│   │   │   ├── google-vision.js      # Google Cloud Vision (OCR)
│   │   │   ├── google-tts.js         # Google Text-to-Speech
│   │   │   ├── gpt.js                # ChatGPT/OpenAI
│   │   │   ├── openai.js             # OpenAI-compatible APIs
│   │   │   ├── openrouter.js         # ⭐ OpenRouter (recommended, 100+ models)
│   │   │   ├── gemini.js             # Google Gemini
│   │   │   ├── cohere.js             # Cohere AI
│   │   │   ├── kimi.js               # Kimi AI
│   │   │   ├── ai-function.js        # Shared AI utilities
│   │   │   └── zh-convert.js         # Chinese variant conversion
│   │   │
│   │   └── fix/              # Text processing/correction (10 files)
│   │       ├── fix-entry.js          # Fix orchestration
│   │       ├── json-entry.js         # JSON data loading
│   │       ├── jp-fix.js             # Japanese text fixes
│   │       └── en-fix.js             # English text fixes
│   │
│   ├── vibeproxy/            # ⭐ VibeProxy integration (OAuth proxy)
│   │   ├── vibeproxy-manager.js  # Main manager (singleton pattern)
│   │   ├── server-manager.js     # CLIProxyAPI process management
│   │   └── auth-monitor.js       # OAuth token file monitoring
│   │
│   └── data/                 # Application data
│       ├── tataru-assistant-reader/  # Sharlayan FFXIV reader binary
│       ├── text/             # ⭐ Translation dictionaries (3.8 MB)
│       │   ├── jp/          # Japanese corrections
│       │   ├── en/          # English corrections
│       │   ├── ch/          # Chinese name fixes
│       │   ├── main/        # Game content translations
│       │   │   ├── job/     # Job/class names
│       │   │   ├── event/   # Seasonal events
│       │   │   ├── item/    # Items
│       │   │   └── patch*/  # Expansion-specific content
│       │   └── readme/      # Help documentation (HTML)
│       ├── img/             # Data images
│       └── screen-capture/  # Screenshot temp folder
│
├── vibeproxy-resources/      # ⭐ VibeProxy bundled resources
│   ├── config.yaml          # CLIProxyAPI configuration (port 8318)
│   ├── cli-proxy-api.exe    # Binary (auto-downloaded by GitHub Actions)
│   ├── .gitignore           # Ignores binary (not committed)
│   └── README.md            # Integration documentation
│
├── doc/                      # Additional documentation
├── *.traineddata            # Tesseract OCR language data (ENG, JPN)
├── *-latest.json            # FFXIV game data (actions, signatures, zones)
├── package.json             # ⭐ NPM dependencies & build config
├── eslint.config.mjs        # Code linting configuration
├── README.md                # User documentation (Chinese)
├── VIBEPROXY_INTEGRATION_GUIDE.md  # Technical VibeProxy guide
├── OPENROUTER_MODELS.md     # OpenRouter model catalog
└── CLAUDE.md                # ⭐ This file
```

### Key File Locations

| Purpose | Path | Notes |
|---------|------|-------|
| Main entry | `src/main.js` | App initialization, VibeProxy startup |
| IPC handlers | `src/module/system/ipc-module.js` | 100+ handlers, search here for IPC channels |
| Config management | `src/module/system/config-module.js` | Config CRUD operations |
| Translation logic | `src/module/system/translate-module.js` | Core translation orchestration |
| VibeProxy manager | `src/vibeproxy/vibeproxy-manager.js` | OAuth proxy lifecycle |
| Window management | `src/module/system/window-module.js` | Create/manage windows |
| Settings UI | `src/html/config.html` | Main settings window (div-based sections) |
| Overlay UI | `src/html/index.html` | Main translation overlay |
| Build config | `package.json` | electron-builder configuration |
| CI/CD | `.github/workflows/build.yml` | Auto-build workflow |

---

## 🔑 Key Components

### 1. Main Process (`src/main.js`)

**Purpose**: Application entry point, initializes all modules

**Key Operations**:
```javascript
app.on("ready", async () => {
    await appModule.startApp();           // Initialize app
    await vibeProxyManager.initialize();  // Initialize VibeProxy
    if (vibeProxyManager.isAvailable()) {
        await vibeProxyManager.start();   // Start OAuth proxy
    }
});

app.on("before-quit", async () => {
    await vibeProxyManager.cleanup();     // Cleanup VibeProxy
});
```

**IMPORTANT**: Always check `vibeProxyManager.isAvailable()` before calling methods - binary may not be present in dev mode on Mac.

### 2. IPC Module (`src/module/system/ipc-module.js`)

**Purpose**: Central IPC handler registration (main ↔ renderer communication)

**Pattern**:
```javascript
// Main process (ipc-module.js)
ipcMain.handle('channel-name', async (event, ...args) => {
    // Handle request
    return result;
});

// Renderer process (HTML/JS)
const result = await ipcRenderer.invoke('channel-name', arg1, arg2);
```

**Search Strategy**: When adding IPC functionality, search `ipc-module.js` for similar handlers to follow existing patterns.

**Key Handler Categories**:
- `system-*`: System operations (file, config, version)
- `window-*`: Window management
- `translate-*`: Translation requests
- `vibeproxy-*`: VibeProxy control
- `sharlayan-*`: FFXIV reader control
- `screenshot-*`: Screen capture
- `config-*`: Configuration CRUD

### 3. Window Module (`src/module/system/window-module.js`)

**Purpose**: Create and manage BrowserWindows

**Window Types**:
```javascript
const windows = {
    index: null,        // Main overlay (frameless, transparent, always-on-top)
    config: null,       // Settings window
    capture: null,      // Screen capture
    'capture-edit': null, // OCR editor
    dictionary: null,   // Translation lookup
    custom: null,       // Custom translations
    'read-log': null    // Log viewer
};
```

**Creating Windows**:
```javascript
windowModule.createWindow('index');     // Create main overlay
windowModule.createWindow('config');    // Create settings
```

**Recent Fix**: ROG Ally minimize behavior - see commits for setMinimizable enforcement and focusable fallback patterns.

### 4. Translation Module (`src/module/system/translate-module.js`)

**Purpose**: Orchestrate translation workflow

**Flow**:
```javascript
async function translate(text, fromLanguage, toLanguage, engineName) {
    // 1. Get engine list
    const engineList = engineModule.getEngineList();

    // 2. Select engine
    const engine = translator[engineName];

    // 3. Execute translation
    const result = await engine.exec({
        text,
        fromLanguage,
        toLanguage,
        chatHistory,  // For AI context
        customPrompt  // User-defined prompt
    });

    // 4. Post-process (Chinese conversion)
    return zhConvert.convertText(result);
}
```

**AI Prompt Customization**: Users can define custom prompts in settings for AI translators.

### 5. VibeProxy Manager (`src/vibeproxy/vibeproxy-manager.js`)

**Purpose**: Manage OAuth proxy lifecycle (singleton pattern)

**Key Methods**:
```javascript
// Initialization (call once in main.js)
await vibeProxyManager.initialize();

// Check availability (binary may not exist on Mac dev)
const available = vibeProxyManager.isAvailable();

// Start server (port 8318)
const success = await vibeProxyManager.start();

// Authenticate service (opens browser OAuth flow)
const result = await vibeProxyManager.startAuth('claude');
// Supported: 'claude', 'chatgpt', 'gemini', 'qwen'

// Get status
const status = vibeProxyManager.getStatus();
// { isRunning, port, pid, uptime }

const authStatuses = vibeProxyManager.getAuthStatuses();
// { claude: { isAuthenticated, model, lastChecked }, ... }

// Stop server
await vibeProxyManager.stop();

// Cleanup (call in app.on('before-quit'))
await vibeProxyManager.cleanup();
```

**File Watching**: Monitors `~/.cli-proxy-api/*.json` for token updates via chokidar.

### 6. Sharlayan Module (`src/module/system/sharlayan-module.js`)

**Purpose**: FFXIV game memory reader integration

**Process**:
```javascript
// Spawns tataru-assistant-reader.exe (C# Sharlayan wrapper)
// Parses stdout JSON: { type, code, name, text }
// Types: DIALOG, CONSOLE, CUTSCENE
// Codes: 003D, 0044, etc. (see chat-code-module.js)
```

**Deduplication**: Maintains history to prevent repeated translations of same text.

**Auto-restart**: Automatically restarts on crash.

### 7. Translator Modules (`src/module/translator/*.js`)

**Pattern**: Each translator exports an `exec` function

```javascript
// Example: src/module/translator/openrouter.js
module.exports.exec = async function({
    text,
    fromLanguage,
    toLanguage,
    chatHistory = [],
    customPrompt = ''
}) {
    // Build request
    const messages = buildMessages(text, chatHistory, customPrompt);

    // API call
    const response = await axios.post(url, {
        model: config.model,
        messages
    }, { headers: { Authorization: `Bearer ${apiKey}` } });

    // Extract translation
    return response.data.choices[0].message.content;
};
```

**AI Function Utilities** (`ai-function.js`): Shared helpers for building prompts, managing chat history.

---

## 💻 Development Workflows

### Local Development

```bash
# Clone repository
git clone https://github.com/raydocs/tataru
cd tataru

# Install dependencies
npm install

# Run in development mode
npm start

# Linting
npx eslint src/
```

### Development Environment Notes

- **Mac/Linux**: VibeProxy binary (`cli-proxy-api.exe`) won't be present - this is expected
- **Windows**: Can test full VibeProxy integration
- **DevTools**: Press F12 in any window to open developer tools
- **Hot Reload**: Restart required for main process changes

### File Structure Conventions

1. **Module Exports**: Use `module.exports` with object properties
   ```javascript
   module.exports.functionName = function() { /* ... */ };
   ```

2. **Async/Await**: Prefer async/await over callbacks
   ```javascript
   async function loadConfig() {
       const data = await fs.promises.readFile(path);
       return JSON.parse(data);
   }
   ```

3. **Error Handling**: Always wrap in try/catch for async operations
   ```javascript
   try {
       await riskyOperation();
   } catch (error) {
       console.error('Error:', error);
       // Graceful degradation
   }
   ```

### Common Development Tasks

#### Adding a New Translation Engine

1. Create `src/module/translator/new-engine.js`
2. Implement `exec` function following existing patterns
3. Add engine to `src/module/system/engine-module.js`
4. Add UI controls in `src/html/config.html`
5. Register IPC handlers in `src/module/system/ipc-module.js` if needed
6. Test with various text lengths and languages

#### Adding a New IPC Handler

1. Open `src/module/system/ipc-module.js`
2. Find similar handler for reference
3. Register with `ipcMain.handle`:
   ```javascript
   ipcMain.handle('my-new-handler', async (event, arg1, arg2) => {
       // Implementation
       return result;
   });
   ```
4. Use in renderer process:
   ```javascript
   const result = await ipcRenderer.invoke('my-new-handler', arg1, arg2);
   ```

#### Adding a New Window

1. Create HTML file in `src/html/`
2. Add to `windows` object in `window-module.js`
3. Create window factory function following existing patterns
4. Add IPC handlers for window-specific operations

---

## 🔀 Git Conventions

### Branch Naming

**Feature Branches**: Use `claude/` or `codex/` prefix + descriptive name + session ID

Examples:
```
claude/integrate-cliproxyapi-binary-0.0.1-011CUy7L8QdeiJDVJCgWZxY2
claude/debug-vibeproxy-windows-01NJRiKpW1APSqqrRAJUDRKy
codex/-rog-ally-tod4kj
```

**Pattern**: `<ai-prefix>/<feature-description>-<session-id>`

**IMPORTANT**: Always push to the branch specified in the task instructions. Branches must start with `claude/` and end with the matching session ID, otherwise push will fail with 403 error.

### Commit Message Format

**Convention**: [Conventional Commits](https://www.conventionalcommits.org/)

**Format**:
```
<type>: <subject>

<body (optional)>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `chore`: Maintenance (version bumps, deps)
- `docs`: Documentation only
- `refactor`: Code restructuring (no behavior change)
- `test`: Adding/updating tests
- `style`: Code style changes (formatting)

**Examples**:
```bash
git commit -m "feat: integrate CLIProxyAPI v6.3.26 binary directly into repository"

git commit -m "fix: improve VibeProxy settings UI clarity and auto-start functionality"

git commit -m "chore: bump version to 2.8.23 for VibeProxy runtime downloader release"

git commit -m "fix: VibeProxy configuration and debug mode issues on Windows"
```

**Multi-line Commits**:
```bash
git commit -m "feat: integrate VibeProxy into Tataru Assistant

- Add VibeProxy OAuth proxy functionality
- Auto-download CLIProxyAPI in GitHub Actions
- Bundle everything into single installer
- No manual steps required for users"
```

### Pull Request Workflow

1. **Create Feature Branch**:
   ```bash
   git checkout -b claude/my-feature-<session-id>
   ```

2. **Make Changes**: Follow code conventions

3. **Commit**: Use conventional commits

4. **Push**: Always use `-u` flag for new branches
   ```bash
   git push -u origin claude/my-feature-<session-id>
   ```

5. **Create PR**: Via GitHub UI or `gh` CLI (if available)

6. **Merge**: Squash and merge to `main` (typically)

### Git Push Retry Logic

**IMPORTANT**: Network failures are common. Always implement retry logic:

```bash
# Retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s)
git push -u origin <branch-name> || {
    sleep 2 && git push -u origin <branch-name>
} || {
    sleep 4 && git push -u origin <branch-name>
} || {
    sleep 8 && git push -u origin <branch-name>
} || {
    sleep 16 && git push -u origin <branch-name>
}
```

---

## 📝 Code Conventions

### JavaScript Style

1. **Indentation**: 4 spaces (consistent with existing code)
2. **Quotes**: Prefer double quotes `"` for strings
3. **Semicolons**: Use semicolons
4. **Variable Naming**:
   - `camelCase` for variables/functions
   - `PascalCase` for constructors (rare)
   - `UPPER_SNAKE_CASE` for constants

### Module Structure

```javascript
// Imports
const { app } = require("electron");
const path = require("path");
const someModule = require("./some-module");

// Constants
const DEFAULT_CONFIG = { /* ... */ };

// Module state (if needed)
let currentState = null;

// Private functions
function privateHelper() {
    // ...
}

// Public exports
module.exports.publicFunction = async function(param1, param2) {
    try {
        // Implementation
        return result;
    } catch (error) {
        console.error("Error in publicFunction:", error);
        throw error;
    }
};

module.exports.anotherPublicFunction = function() {
    // ...
};
```

### Error Handling

1. **Always try/catch async operations**:
   ```javascript
   try {
       const result = await asyncOperation();
       return result;
   } catch (error) {
       console.error("Error:", error);
       // Graceful degradation or user notification
       return defaultValue;
   }
   ```

2. **Log errors with context**:
   ```javascript
   console.error("[module-name] Error in functionName:", error);
   ```

3. **User-facing errors**: Use dialog-module or notification-module
   ```javascript
   notificationModule.show("Error", "Failed to load translation");
   ```

### Path Handling

**Always use `path.join` for cross-platform compatibility**:

```javascript
// Good
const configPath = path.join(app.getPath("userData"), "config.json");

// Bad
const configPath = app.getPath("userData") + "/config.json";
```

**Resource paths** (development vs. production):

```javascript
const { app } = require("electron");
const path = require("path");

let resourcesPath;

if (!app.isPackaged) {
    // Development: project root
    resourcesPath = path.join(__dirname, "../../vibeproxy-resources");
} else {
    // Production: resources/vibeproxy
    resourcesPath = path.join(process.resourcesPath, "vibeproxy");
}
```

### IPC Handler Naming

**Convention**: `<category>-<action>`

Examples:
- `config-get`, `config-set`, `config-save`
- `window-create`, `window-close`, `window-focus`
- `translate-execute`, `translate-stop`
- `vibeproxy-start`, `vibeproxy-stop`, `vibeproxy-auth`

### Comments

1. **JSDoc for public functions**:
   ```javascript
   /**
    * Translates text using specified engine
    * @param {string} text - Text to translate
    * @param {string} fromLang - Source language code
    * @param {string} toLang - Target language code
    * @param {string} engine - Engine name
    * @returns {Promise<string>} Translated text
    */
   module.exports.translate = async function(text, fromLang, toLang, engine) {
       // ...
   };
   ```

2. **Inline comments for complex logic**:
   ```javascript
   // Deduplicate based on last 10 dialogs to prevent repeated translations
   if (lastDialogs.includes(text)) {
       return null;
   }
   ```

3. **TODO comments**:
   ```javascript
   // TODO: Implement retry logic for failed translations
   // FIXME: Memory leak when processing large images
   ```

---

## 🧪 Testing & Debugging

### Current State

**No formal test suite** - testing is primarily manual with some integration test scripts.

### Available Testing Tools

1. **DevTools**: Press F12 in any window
2. **Console Logging**: Extensive `console.log` throughout codebase
3. **Integration Tests**:
   - `test-vibeproxy-integration.js` (VibeProxy testing)

### Manual Testing Checklist

**When modifying translation logic**:
- [ ] Test with Japanese → English
- [ ] Test with Japanese → Chinese
- [ ] Test with long text (500+ characters)
- [ ] Test with special characters (emoji, symbols)
- [ ] Test with each translation engine
- [ ] Verify text corrections are applied

**When modifying VibeProxy**:
- [ ] Test server start/stop
- [ ] Test OAuth flow for each service
- [ ] Test token refresh
- [ ] Test server crash recovery
- [ ] Verify config.yaml changes

**When modifying UI**:
- [ ] Test on multiple window sizes
- [ ] Test drag functionality (frameless windows)
- [ ] Test transparency/opacity settings
- [ ] Test always-on-top behavior
- [ ] Test multi-monitor scenarios

### Debugging Tips

1. **Main Process Logs**: Check terminal output when running `npm start`
2. **Renderer Logs**: Open DevTools (F12) in specific window
3. **IPC Issues**: Log in both main and renderer to trace message flow
4. **VibeProxy Issues**: Check `~/.cli-proxy-api/` for logs and tokens
5. **Sharlayan Issues**: Check spawned process output in console

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Translation not working | FFXIV not detected | Check Sharlayan process, restart reader |
| VibeProxy not starting | Binary missing (Mac dev) | Expected - only works on Windows |
| Window not appearing | Multi-monitor position issue | Reset window positions in config |
| OCR failing | Missing traineddata files | Ensure `*.traineddata` in project root |
| Build failing | Missing dependencies | `npm install`, check `package.json` |

---

## 🏗 Build & Release

### Build Process

```bash
# Build without packaging (faster, for testing)
npm run pack

# Build installer (production)
npm run dist
```

**Output**: `build/Tataru_Assistant_Setup.exe`

### electron-builder Configuration

**Location**: `package.json` → `build` section

**Key Settings**:
- **appId**: `com.app.tataru.assistant`
- **Output**: `build/` directory
- **Target**: Windows NSIS installer
- **Icon**: `src/html/img/icon/tataru.ico`
- **Extra Files**: Data, OCR models, VibeProxy resources
- **ASAR Unpack**: Sharp native modules

**VibeProxy Bundling**:
```json
{
  "from": "vibeproxy-resources",
  "to": "vibeproxy",
  "filter": ["**/*"]
}
```

This copies `vibeproxy-resources/` to `resources/vibeproxy/` in the built app.

### GitHub Actions CI/CD

**Workflow**: `.github/workflows/build.yml`

**Triggers**:
- Push to `main` branch
- Every 2 hours (cron schedule)
- Manual workflow dispatch

**Build Steps**:

1. **Checkout Code**
2. **Download CLIProxyAPI** (latest Windows binary)
   ```yaml
   - name: Download CLIProxyAPI
     run: |
       $url = (Invoke-RestMethod https://api.github.com/repos/router-for-me/CLIProxyAPI/releases/latest).assets | Where-Object { $_.name -like "*windows*.zip" } | Select-Object -ExpandProperty browser_download_url
       Invoke-WebRequest -Uri $url -OutFile cli-proxy-api.zip
       Expand-Archive cli-proxy-api.zip -DestinationPath extracted
       Move-Item extracted/cli-proxy-api.exe vibeproxy-resources/
   ```
3. **Version Check** (`autocheck.sh`)
4. **Install Dependencies** (`npm install`)
5. **Build** (`npm run dist` + `electron-builder`)
6. **Create GitHub Release**
7. **Upload Installer**
8. **Cleanup Old Runs** (keep 6 most recent)

**Retry Logic**: Network operations (fetch, git push) implement exponential backoff (2s, 4s, 8s, 16s).

**Failure Handling**: If CLIProxyAPI download fails, build continues (VibeProxy feature disabled but main app works).

### Version Bumping

**Location**: `package.json` → `version`

**Process**:
1. Update version: `"version": "0.0.2"`
2. Commit: `git commit -m "chore: bump version to 0.0.2"`
3. Push: Triggers automatic build and release

---

## 🛠 Common Tasks

### Task 1: Add a New AI Translation Provider

**Example**: Adding "Anthropic Claude Direct API"

1. **Create translator module**:
   ```javascript
   // src/module/translator/claude-direct.js
   const axios = require("axios");
   const aiFunction = require("./ai-function");

   module.exports.exec = async function({ text, fromLanguage, toLanguage, chatHistory, customPrompt }) {
       const config = configModule.get("translation.claudeDirect");
       const messages = aiFunction.buildMessages(text, chatHistory, customPrompt, fromLanguage, toLanguage);

       const response = await axios.post("https://api.anthropic.com/v1/messages", {
           model: config.model,
           messages,
           max_tokens: 1024
       }, {
           headers: {
               "x-api-key": config.apiKey,
               "anthropic-version": "2023-06-01"
           }
       });

       return response.data.content[0].text;
   };
   ```

2. **Add to engine list** (`src/module/system/engine-module.js`):
   ```javascript
   const engineList = [
       // ... existing engines
       { name: "claudeDirect", displayName: "Claude Direct API" }
   ];
   ```

3. **Add UI controls** (`src/html/config.html`):
   - Add settings section (API key input, model selector)
   - Add to engine dropdown in translation settings

4. **Register IPC handlers** (if new config fields needed):
   ```javascript
   // src/module/system/ipc-module.js
   ipcMain.handle("config-get-claude-direct", () => {
       return configModule.get("translation.claudeDirect");
   });
   ```

5. **Test**: Run app, configure Claude Direct, translate test text

### Task 2: Fix a VibeProxy Bug

**Example**: VibeProxy server not restarting after crash

1. **Locate issue** in `src/vibeproxy/server-manager.js`

2. **Add crash detection**:
   ```javascript
   this.process.on("exit", (code) => {
       if (code !== 0 && this.isRunning) {
           console.error(`CLIProxyAPI crashed with code ${code}, restarting...`);
           setTimeout(() => this.start(), 5000); // Restart after 5s
       }
   });
   ```

3. **Test**: Manually kill process, verify restart

4. **Commit**:
   ```bash
   git add src/vibeproxy/server-manager.js
   git commit -m "fix: auto-restart VibeProxy server on crash"
   git push -u origin claude/vibeproxy-autorestart-<session-id>
   ```

### Task 3: Add a New Window

**Example**: Adding a "Translation History" window

1. **Create HTML** (`src/html/history.html`):
   ```html
   <!DOCTYPE html>
   <html>
   <head>
       <title>Translation History</title>
       <link rel="stylesheet" href="css/bootstrap.min.css">
   </head>
   <body>
       <div id="history-list"></div>
       <script src="js/history-renderer.js"></script>
   </body>
   </html>
   ```

2. **Create renderer script** (`src/html/js/history-renderer.js`):
   ```javascript
   const { ipcRenderer } = require("electron");

   async function loadHistory() {
       const history = await ipcRenderer.invoke("get-translation-history");
       document.getElementById("history-list").innerHTML = history.map(item =>
           `<div>${item.original} → ${item.translated}</div>`
       ).join("");
   }

   loadHistory();
   ```

3. **Add to window-module.js**:
   ```javascript
   const windows = {
       // ... existing windows
       history: null
   };

   function createHistoryWindow() {
       windows.history = new BrowserWindow({
           width: 800,
           height: 600,
           webPreferences: {
               nodeIntegration: true,
               contextIsolation: false
           }
       });
       windows.history.loadFile("src/html/history.html");
   }

   module.exports.createWindow = function(windowName) {
       if (windowName === "history") return createHistoryWindow();
       // ... existing logic
   };
   ```

4. **Add IPC handlers** (`ipc-module.js`):
   ```javascript
   ipcMain.handle("get-translation-history", () => {
       return translationHistory; // From some module
   });

   ipcMain.handle("window-open-history", () => {
       windowModule.createWindow("history");
   });
   ```

5. **Add UI trigger** (in `config.html` or `index.html`):
   ```javascript
   // In existing renderer script
   document.getElementById("open-history-btn").addEventListener("click", async () => {
       await ipcRenderer.invoke("window-open-history");
   });
   ```

### Task 4: Update Translation Dictionaries

**Location**: `src/data/text/`

**Example**: Add new character names to Japanese dictionary

1. **Locate dictionary**: `src/data/text/jp/jp1.json`

2. **Edit JSON**:
   ```json
   {
       "incorrect_text": "correct_text",
       "タタル": "塔塔露",
       "アルフィノ": "阿爾菲諾",
       "NewCharacterName": "新角色名稱"
   }
   ```

3. **Test**: Trigger translation with new character name, verify correction

4. **Commit**:
   ```bash
   git add src/data/text/jp/jp1.json
   git commit -m "chore: add new character names to Japanese dictionary"
   git push -u origin <branch-name>
   ```

### Task 5: Debug Translation Not Working

**Checklist**:

1. **Check Sharlayan process**:
   - Open DevTools (F12) in main window
   - Look for Sharlayan stdout in console
   - If no output → restart reader via settings

2. **Check translation engine config**:
   - Open settings window
   - Verify API key is set
   - Test API endpoint manually (curl/Postman)

3. **Check IPC flow**:
   - Add `console.log` in `translate-module.js`
   - Add `console.log` in renderer when translation received
   - Trace message flow

4. **Check for errors**:
   - Main process console (terminal)
   - Renderer DevTools console
   - Check for rate limiting (429 errors)

---

## ⚠️ Important Notes

### 1. **Bilingual Codebase**

- **User Documentation**: Chinese (README.md, UI labels)
- **Code Comments**: Mostly English
- **Variable Names**: English
- **Commit Messages**: English (conventional commits)

When adding features, ensure UI text is in Chinese (or configurable).

### 2. **Windows-Specific Features**

- **VibeProxy**: Only works on Windows (requires `cli-proxy-api.exe`)
- **Sharlayan**: FFXIV memory reading only on Windows
- **Development**: Can develop on Mac/Linux, but limited feature testing

### 3. **Security Considerations**

- **API Keys**: Stored in user config (`app.getPath("userData")/config.json`)
- **Encryption**: Uses crypto-js for sensitive data (optional)
- **No Hardcoded Secrets**: All API keys are user-provided
- **HTTPS**: Always use HTTPS for API requests

### 4. **Performance**

- **Large Dictionaries**: 3.8 MB of JSON loaded into memory
- **Image Processing**: Sharp is heavy, ensure ASAR unpacking
- **OCR**: Tesseract.js is CPU-intensive, run in worker if possible
- **Translation**: Rate limiting is user responsibility

### 5. **VibeProxy Integration**

- **Binary Not Committed**: `cli-proxy-api.exe` downloaded by GitHub Actions
- **Mac Development**: Binary won't be present - this is expected
- **OAuth Tokens**: Stored in `~/.cli-proxy-api/` (user home directory)
- **Port 8318**: Default, configurable in `vibeproxy-resources/config.yaml`
- **Singleton Pattern**: Only one instance should run

### 6. **Electron Versioning**

- **Current**: Electron 37.2.6
- **Breaking Changes**: Test thoroughly when upgrading Electron
- **Native Modules**: Sharp requires rebuild for new Electron versions

### 7. **GitHub Actions**

- **Auto-build**: Every 2 hours + on push to main
- **Manual Trigger**: Available via Actions tab
- **Cleanup**: Keeps 6 most recent workflow runs
- **Release**: Auto-created on successful build

### 8. **Multi-Monitor Support**

- **Position Persistence**: Saves window positions
- **Edge Cases**: ROG Ally and other handhelds (see window-module.js fixes)
- **Minimize Behavior**: Special handling for focusable/non-focusable windows

### 9. **Data Files**

- **Game Data**: `*-latest.json` files are large, infrequently updated
- **OCR Models**: `*.traineddata` files are essential, must be bundled
- **Translation Dictionaries**: Can grow large, consider loading on demand in future

### 10. **Error Recovery**

- **Graceful Degradation**: App should work even if some features fail
- **VibeProxy Optional**: Main translation works without VibeProxy
- **Sharlayan Restart**: Auto-restart on crash
- **Network Retry**: Implement exponential backoff for all network operations

---

## 📚 Additional Resources

### Documentation Files

- **README.md**: User guide (Chinese)
- **VIBEPROXY_INTEGRATION_GUIDE.md**: Technical VibeProxy integration guide
- **OPENROUTER_MODELS.md**: Catalog of 100+ AI models available via OpenRouter
- **OPENROUTER_VERIFICATION.md**: Verification report for OpenRouter integration

### External Links

- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-builder](https://www.electron.build/)
- [Sharlayan (FFXIV memory reader)](https://github.com/FFXIVAPP/sharlayan)
- [OpenRouter API](https://openrouter.ai/)
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)

### Project-Specific Links

- **Repository**: https://github.com/raydocs/tataru
- **Issues**: https://github.com/raydocs/tataru/issues
- **Releases**: https://github.com/raydocs/tataru/releases
- **Original Project**: https://github.com/winw1010/tataru-assistant

---

## 🎓 Learning Path for New AI Assistants

**Recommended Order**:

1. **Understand Architecture**: Read "Architecture & Design Patterns" section
2. **Explore Main Entry**: Read `src/main.js` to see initialization flow
3. **Study IPC Module**: Understand how main ↔ renderer communication works
4. **Follow Translation Flow**: Trace a translation from FFXIV → UI display
5. **Examine VibeProxy**: Understand OAuth proxy integration
6. **Review Build Process**: Check `package.json` and `.github/workflows/build.yml`
7. **Practice**: Try common tasks (add translator, modify UI)

---

## 🔄 Document Maintenance

**This document should be updated when**:

- Major architectural changes occur
- New modules or windows are added
- Build process changes
- New dependencies are added
- Development workflows change
- Common tasks or patterns emerge

**Update Process**:
1. Edit `CLAUDE.md`
2. Commit: `git commit -m "docs: update CLAUDE.md with <change description>"`
3. Push to branch

---

## 📝 Changelog

### 2025-11-15 - Initial Version
- Created comprehensive AI assistant development guide
- Documented architecture, workflows, and conventions
- Added common tasks and troubleshooting guides

---

**End of CLAUDE.md**

For questions or clarifications, refer to the source code or existing documentation files.
