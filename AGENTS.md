# Repository development rules

## Platform scope

- Focus development, UI changes, bug fixes, and verification on the web app and mobile PWA. This applies to work in `src/` and related data, scripts, and build configuration.
- Skip extension-specific updates, builds, packaging, and Chrome/Edge extension testing by default. Only work on the extension when the user explicitly requests it.
- Preserve existing extension support. Shared code changes may also benefit the extension, but do not add extension-only work or remove extension features as part of a web/PWA task.
- Android APK development is deferred. Do not add Capacitor, native Android projects, or APK build workflows unless the user explicitly requests that work.

## Default development and verification

- Use `npm run dev:web` for local testing and `npm run build:pages` for production build verification when relevant to the change.
- For UI changes, prioritize mobile browser/PWA layout and interactions, while preserving desktop web usability.
- Verify PWA loading, offline/cache behavior, or updates when the change affects those areas. Do not require an extension build for ordinary web/PWA work.

## Commit and push workflow

- Whenever the user asks to commit and push, first ask which changes/features they want included. Do not stage, commit, or push until the scope is confirmed.
- After the scope is confirmed, run `npm run build:pages` and test the changed flows in Playwright before pushing. Verify the actual updated behavior, not only that the page loads.
- If the build or Playwright test fails, stop before pushing and report the failure and relevant evidence to the user. Do not push a known-broken update.
- Stage only the confirmed scope; preserve unrelated working-tree changes.
