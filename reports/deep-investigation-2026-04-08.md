# Investigation: Remaining Bugs and Upgrade Opportunities

## Summary
The original Windows missing-module crash is fixed, but the codebase still has several confirmed bugs and a few high-confidence fragilities. The most important confirmed issues are: packaged readme/token-helper files are excluded from builds but still opened by code, the ElevenLabs extension bridge can drop the newest bearer candidate, the bridge trust model is too weak for a localhost boundary, the new ElevenLabs bridge/browser-assist flows are not wired into the renderer UI, and CI/release can still publish partially validated releases.

## Symptoms
- Packaged Windows startup crash previously occurred because `../system/elevenlabs-extension-bridge` was missing from the app package.
- The repository recently contained transient Playwright artifacts and a tracked `logs/security/.security-key`.
- GitHub Actions warned that Node 20-based action runtimes were deprecated.
- Recent ElevenLabs bridge/browser-assist backend code was added, but the user-facing flow remained unclear.

## Investigation Log

### Phase 1 - Initial Assessment
**Hypothesis:** There may still be packaging/runtime path issues, optional-feature startup hazards, workflow/release weaknesses, or stale architecture/dependency issues not covered by the recent fixes.
**Findings:** The prior missing-module problem is fixed, but several adjacent systems changed recently and warranted a broader audit.
**Evidence:**
- Recent commits: `cac939c`, `d5100f2`
- Current branch clean except the investigation report file
**Conclusion:** Proceeded to broad context gathering.

### Phase 2 - Broad Context Gathering
**Hypothesis:** Remaining risks likely cluster around packaged resource resolution, ElevenLabs bridge/browser-assist lifecycle, UI integration, and CI/release robustness.
**Findings:** Context builder selected the main process lifecycle, path-resolution layer, ElevenLabs auth/bridge/browser-assist stack, renderer config UI, extension code, packaging config, and CI workflow.
**Evidence:** Context builder selection included `src/main.js`, `src/module/system/file-module.js`, `src/module/system/app-module.js`, `src/module/system/window-module.js`, `src/module/system/elevenlabs-extension-bridge.js`, `src/module/system/elevenlabs-browser-assist.js`, `src/module/ipc/tts-ipc.js`, `src/html/config.js`, `extension/elevenreader-bearer/background.js`, `package.json`, `.github/workflows/build.yml`, and `.github/workflows/autocheck.sh`.
**Conclusion:** The audit should focus on resource packaging, bridge correctness/security, UI completeness, and release safeguards.

### Verified Issue - Packaged readme/token-helper assets are excluded but still opened
**Hypothesis:** Some packaged help/readme flows are currently broken even though the main startup crash is fixed.
**Findings:** `package.json` explicitly excludes `src/data/text/readme` from `build.extraFiles`, but both the renderer and the global shortcut still open files from that directory.
**Evidence:**
- `package.json:52-58`
  ```json
  "extraFiles": [
    "src/data",
    "!src/data/img/*.png",
    "!src/data/text/readme",
  ```
- `src/html/config.js:554-558`
  ```javascript
  document.getElementById('a-open-elevenlabs-token-helper').onclick = async () => {
    const path = await ipcRenderer.invoke(IPC_CHANNELS.GET_ROOT_PATH, 'src', 'data', 'text', 'readme', 'elevenlabs-token-helper.html');
    await openPath(path);
  };
  ```
- `src/module/system/app-module.js:152-159`
  ```javascript
  globalShortcut.register('CommandOrControl+F9', () => {
    const readmePath = fileModule.getRootPath('src', 'data', 'text', 'readme', 'index.html');
    execFile('explorer', [readmePath], (error) => {
  ```
**Conclusion:** Confirmed packaging bug. Packaged builds will not contain these files via `extraFiles`, but code still opens them.

### Verified Issue - ElevenLabs bridge drops the latest bearer candidate under load
**Hypothesis:** The new extension bridge has a race that can ignore the most recent token while a prior validation is in progress.
**Findings:** `handleBearerImport()` updates the candidate and immediately calls `autoValidateAndHydrate(nextGeneration)`, but `autoValidateAndHydrate()` returns immediately when `autoValidateInFlight` is already true. There is no replay/queue of the latest generation after the in-flight validation finishes.
**Evidence:**
- `src/module/system/elevenlabs-extension-bridge.js:206-229`
  ```javascript
  const nextGeneration = (bridgeState.candidate?.generation || 0) + 1;
  ...
  setCandidateState(nextCandidate);
  ...
  void autoValidateAndHydrate(nextGeneration);
  ```
- `src/module/system/elevenlabs-extension-bridge.js:233-239`
  ```javascript
  async function autoValidateAndHydrate(expectedGeneration) {
    if (autoValidateInFlight) {
      return;
    }
  ```
**Conclusion:** Confirmed reliability bug.

### Verified Issue - Localhost bridge trust model is too weak
**Hypothesis:** The local ElevenLabs extension bridge trusts clients too loosely and exposes introspection data too broadly.
**Findings:** The bridge authenticates a websocket client by sending a nonce and accepting any client that echoes it back. It also force-replaces the existing client when a new websocket connects, and exposes `/health` with `Access-Control-Allow-Origin: *`.
**Evidence:**
- `src/module/system/elevenlabs-extension-bridge.js:305-311`
  ```javascript
  if (bridgeState.extension.ws) {
    try {
      bridgeState.extension.ws.close(1000, 'Replaced by new connection');
    } catch {
  ```
- `src/module/system/elevenlabs-extension-bridge.js:322-377`
  ```javascript
  const nonce = crypto.randomBytes(16).toString('hex');
  ...
  if (!authenticated) {
    if (message.type === 'hello' && message.nonce === nonce) {
      authenticated = true;
  ```
- `src/module/system/elevenlabs-extension-bridge.js:404-423`
  ```javascript
  function writeJson(response, statusCode, payload) {
    response.setHeader('Access-Control-Allow-Origin', '*');
  }
  ...
  if (request.method === 'GET' && request.url === '/health') {
    writeJson(response, 200, { success: true, state: getStatus() });
  ```
- Extension side connection target: `extension/elevenreader-bearer/background.js:3-8`
  ```javascript
  const BRIDGE_PORT = 39393;
  const BRIDGE_WS_URL = `ws://127.0.0.1:${BRIDGE_PORT}/ext`;
  ```
**Conclusion:** Confirmed security/reliability bug.

### Verified Issue - ElevenLabs bridge/browser-assist backend is not wired into the UI
**Hypothesis:** The backend shipped new IPC handlers, but the config UI did not add a way to use them.
**Findings:** Exact search found no `src/html/` references to `GET_AUTH_STATUS`, `BEGIN_BROWSER_ASSIST`, `CHECK_BROWSER_ASSIST_LOGIN`, `BEGIN_EXTENSION_BRIDGE_PAIRING`, or `CHECK_EXTENSION_BRIDGE_IMPORT`. The config UI remains manual-token oriented, and the HTML section inspected contains no bridge/browser-assist controls.
**Evidence:**
- Search across `src/html/` for those five IPC names returned **0 matches**.
- Backend handlers exist in `src/module/ipc/tts-ipc.js:205-319`.
- Manual-token centered UI in `src/html/config.js:549-558, 673-723, 819-845, 947-968, 1601-1642`.
- `src/html/config.html:650-699` shows manual ElevenLabs voice/model/tuning fields plus hidden bearer/app-check/device-id inputs, but no browser-assist/extension-bridge controls.
**Conclusion:** Confirmed integration gap / incomplete feature.

### Verified Issue - CI/release can publish partially validated releases
**Hypothesis:** The release workflow still allows shipping artifacts without meaningful validation and before all target platforms finish.
**Findings:** The CI workflow runs `npm ci` and then builds directly, without lint/test/smoke gates. It creates the release in the Windows job before the macOS build completes. The version gate script is also lightweight and lacks stricter shell safety.
**Evidence:**
- `package.json:6-12`
  ```json
  "lint": "eslint src/main.js ... src/html/js/language.js",
  "test": "for f in src/main.js ... src/html/js/language.js; do node --check \"$f\" || exit 1; done",
  ```
  These scripts omit recent critical files such as `src/module/system/elevenlabs-extension-bridge.js`, `src/module/system/elevenlabs-browser-assist.js`, `src/module/ipc/window-ipc.js`, and `extension/elevenreader-bearer/*`.
- `.github/workflows/build.yml:37-45`
  ```yaml
  - name: Install dependencies
    run: npm ci

  - name: Build Windows x64 installer
    run: npm run dist -- --win --x64
  ```
- `.github/workflows/build.yml:56-72`
  ```yaml
  - name: Create release
    id: create_release
    uses: comnoco/create-release-action@v2
  ```
- `.github/workflows/autocheck.sh:1-21` has no `set -euo pipefail` and uses unauthenticated `curl` to the GitHub releases API.
**Conclusion:** Confirmed release-process bug.

### Architectural Fragility - `process.cwd()` is still the runtime root for many assets
**Hypothesis:** Even if not every packaged run breaks today, the root-path design still makes future packaging/runtime bugs likely.
**Findings:** `getRootPathInternal()` caches `process.cwd()` and many packaged/runtime-critical paths still depend on `getRootPath(...)`.
**Evidence:**
- `src/module/system/file-module.js:60-64`
  ```javascript
  function getRootPathInternal() {
    if (_rootPath === null) {
      _rootPath = process.cwd();
    }
  ```
- `src/module/system/app-module.js:84-88`
  ```javascript
  const commonPhrasesPath = fileModule.getRootPath('src', 'data', 'text', 'cache', FILE_NAMES.COMMON_PHRASES);
  ```
- `src/module/system/screenshot-module.js:10-12`
  ```javascript
  const batFilePath = fileModule.getRootPath('src', 'data', 'screen-capture', 'screenCapture_1.3.2.bat');
  const batRootPath = fileModule.getRootPath('src', 'data', 'screen-capture');
  ```
- `src/module/system/sharlayan-module.js:67-74`
  ```javascript
  const sharlayanExePath = fileModule.getRootPath('src', 'data', readerName, readerName + '.exe');
  const dataSignaturesPath = fileModule.getRootPath('src', 'data', 'text', 'signatures.json');
  const rootSignaturesPath = fileModule.getRootPath('signatures.json');
  ```
- `src/module/system/app-check-helper.js:162-179`
  ```javascript
  dirs.add(fileModule.getRootPath());
  ...
  dirs.add(process.cwd());
  ```
- By contrast, packaged BrowserWindow loading uses `getAppPath(...)` rather than `getRootPath(...)`: `src/module/system/window-module.js:60-62, 80-81`.
**Conclusion:** High-confidence fragility, not yet a single universally confirmed runtime failure.

### Architectural Fragility - async quit path has no guard or timeout
**Hypothesis:** App shutdown may be vulnerable to hangs or re-entry under failure conditions.
**Findings:** `before-quit` uses `event.preventDefault()`, awaits several cleanup operations, and finally calls `app.exit(0)`, but there is no visible `isQuitting` guard or timeout.
**Evidence:**
- `src/main.js:56-84`
  ```javascript
  app.on('before-quit', async (event) => {
    event.preventDefault();
    ...
    await translateModule.cleanup();
    await globalCache.cleanup();
    await globalTTSAudioCache.cleanup();
    await elevenLabsExtensionBridge.shutdown();
    await textDetectModule.cleanup();
  ```
**Conclusion:** Plausible lifecycle bug / fragility, but not yet confirmed as a current production failure.

## Eliminated Hypotheses
- The previous missing-module startup crash is no longer the main issue; the file exists and Windows CI successfully built and released a new installer.
- BrowserWindow preload/html packaged loading is not the primary path bug; `src/module/system/window-module.js` correctly uses `fileModule.getAppPath(...)`.
- The old GitHub Actions action-runtime warning was addressed by moving to `actions/checkout@v5` and `actions/setup-node@v5`.

## Root Cause
There is no single remaining root cause. The codebase currently has a cluster of adjacent issues:
1. **Packaging contract mismatch** — assets under `src/data/text/readme` are excluded from packaged builds while code still opens them.
2. **Bridge correctness/security problems** — the ElevenLabs extension bridge has a dropped-candidate validation race, trusts websocket clients too loosely, allows client replacement, and exposes status over permissive localhost HTTP.
3. **Incomplete product integration** — the backend exposes new ElevenLabs browser-assist/bridge flows, but the renderer UI does not invoke them.
4. **Weak release safeguards** — the CI pipeline can create a release before all artifacts are validated and does not run sufficient pre-build checks.
5. **Path architecture fragility** — many runtime assets still depend on `process.cwd()` as the effective root.

## Recommendations
1. **Fix packaged readme/help assets first**
   - Either include `src/data/text/readme` in packaged resources or stop opening files from that excluded tree.
   - Files: `package.json`, `src/html/config.js`, `src/module/system/app-module.js`.
2. **Fix the bridge race and harden bridge trust**
   - Queue/replay the latest generation after in-flight validation instead of returning early.
   - Add real trust material (shared secret/pairing token), reject arbitrary replacement clients, and restrict/remove CORS-open `/health`.
   - File: `src/module/system/elevenlabs-extension-bridge.js`.
3. **Decide ship/no-ship for browser-assist and extension-bridge UI**
   - If shipping, add renderer controls/status wired to the new IPC handlers.
   - If not shipping, hide/remove the backend auto-start path until the UX exists.
   - Files: `src/html/config.js`, `src/html/config.html`, `src/module/ipc/tts-ipc.js`, `src/module/system/app-module.js`.
4. **Strengthen CI/release gates**
   - Expand lint/`node --check` coverage to runtime-critical files and extension files.
   - Run lint/test/smoke before `dist`.
   - Create/upload the release only after both platform builds succeed.
   - Files: `package.json`, `.github/workflows/build.yml`, `.github/workflows/autocheck.sh`.
5. **Refactor root-path handling**
   - Split bundled app resources, extra packaged resources, and user data into distinct resolvers instead of using `process.cwd()` as the implicit root.
   - File: `src/module/system/file-module.js`, then all `getRootPath(...)` consumers.
6. **Harden shutdown path**
   - Add an `isQuitting` guard and a cleanup timeout/fallback path.
   - File: `src/main.js`.

## Preventive Measures
- Add a packaged smoke test that asserts required files exist and can be opened in a packaged app.
- Add tests/checks specifically for newly added runtime-critical files before allowing release creation.
- Avoid shipping backend-only features without corresponding renderer/UI integration or explicit feature flags.
- Treat localhost bridges as security boundaries: require explicit trust material, origin checks where applicable, and avoid wide-open status endpoints.
- Separate path resolvers for app bundle, packaged extra resources, and user data to reduce future packaging regressions.
