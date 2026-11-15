# govorilka: working notes

Portfolio case 3 (wave 1 of the fl.ru / Kwork backlog, Kwork «Доработать логопедическое приложение для детей»). It is our own build of such an app, not the client's prototype: a web UI in `web/` plus a native Android shell in `app/`.

## Commands
- `npm test`: Node tests for phrases, matching, the training loop and the store. Must stay green.
- `npm run serve`: http://localhost:8095/?demo. `?demo` simulates the child; without it the browser's Web Speech API is used.
- `npm run screenshots`: docs/screenshots/web-*.png, using headless Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`.
- The Android build exists only in CI (`.github/workflows/ci.yml`). This Windows box has no JDK/SDK on purpose (see family-messenger-android/CLAUDE.md), so never install them here.
  - Jobs: web tests → `./gradlew testDebugUnitTest assembleRelease` → the emulator smoke test (`scripts/emulator-smoke.sh`, API 34).
  - The emulator screenshots are the `emulator-shots` artifact. The android-*.png in docs come from it.
  - A tag `v*` publishes Govorilka.apk to Releases.

## Rules that matter
- Speech on Android goes ONLY through the native bridge (`GovorilkaNative.call` → `window.__govorilka.done`). The Web Speech API does not work in WebView, and getUserMedia would prompt for the mic again.
- Stress marks: `+` before the vowel in `phrases.js`; `accented()` turns them into U+0301 for TTS. The tests require one stress per multi-syllable word.
- `cycle.js` must stay platform-free, with everything injected, so it can be tested in Node.
- Recognition: on Android 12+ the on-device recognizer goes first. Errors 12–15 make `Listener` fall back to the regular recognizer once. Codes are mapped in `RecognitionErrors` (JVM-tested).
- The emulator image has no Russian recognition pack, so the smoke test shows the «не установлен» message after listening. On a phone with the Google app it recognizes.
- WebView a11y tree: uiautomator needs a few dumps before Chromium exposes nodes (see `dump()` in the smoke script).
- No emoji glyphs for controls: Android draws ⏸ as an emoji square and lacks ❚. Play/pause icons are CSS (`.ico`).
- Signing: `signing/govorilka.p12` (password `govorilka`) is committed on purpose. It is a sideload app, and one key lets each update install over the last one. This is not a Play upload key.
