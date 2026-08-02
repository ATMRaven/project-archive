# Project & Workspace Rules

## Browser Automation & Chromium Binary Path
- **Global Chromium Executable**: `C:\Users\acer nitro\.gemini\tools\chromium\chrome.exe`
- **Environment Variables**: `PUPPETEER_EXECUTABLE_PATH` and `CHROME_PATH` are configured globally to point to `C:\Users\acer nitro\.gemini\tools\chromium\chrome.exe`.
- **Mandatory Rule**: For all web automation, Puppeteer, Playwright, or browser testing tasks, ALWAYS use the standalone Chromium binary located at `C:\Users\acer nitro\.gemini\tools\chromium\chrome.exe`.
- **Constraint**: DO NOT use Google Chrome or ask/prompt the user to install any external browser. Always rely on this standalone global Chromium installation.

## Verification Rule
- **Mandatory Verification**: NEVER claim a UI task or bug fix is completed without taking a fresh screenshot or visually inspecting the result in the browser first. Carefully inspect the visual output of the browser screenshot to verify that the fix actually worked before reporting back to the user.

## Project Architecture & Deployment Rules

### 1. Stack & Repositories
- **Project Name**: Selected Work / Project Archive
- **Web Host**: Cloudflare Workers (`https://project-archive.atmr.workers.dev`)
- **Backend API**: Hono Framework with Cloudflare D1 Database (`project-archive-db`) in `src/index.js`
- **Mobile Native Shell**: Capacitor Android App in `android/`
- **Signing Keystore**: Committed static keystore `android/app/debug.keystore` (ensures all builds share the exact same signature so in-place Android updates work seamlessly without package conflicts).
- **GitHub Repository**: `https://github.com/ATMRaven/project-archive`

### 2. Mobile In-App Update System & GitHub Release Permalinks
- **GitHub Latest Release Permalink**:
  `https://github.com/ATMRaven/project-archive/releases/latest/download/project-archive.apk`
  *GitHub automatically updates `releases/latest` to redirect to the newest compiled APK asset every time a new GitHub Release is created by CI/CD.*
- **Version Endpoint**: `/api/version` in `src/index.js` supplies `latestVersion`, `releaseNotes`, and `apkUrl`.
- **Capacitor Scope Control**: `isCapacitorNativeApp()` in `script.js` ensures update modals ONLY prompt users inside the native Capacitor Android/iOS app shell (not on normal web browser visits).
- **Version Bump Protocol**: When releasing a new APK version (e.g. `v1.3.0`):
  1. Set `latestVersion` in `src/index.js` (e.g. `"1.3.0"`).
  2. Set `APP_VERSION` in `script.js` to match (`"1.3.0"`).
  3. Set `versionName` in `android/app/build.gradle` (e.g. `"1.3.0"`) and increment `versionCode`.
  4. Run `npm run deploy` to update Cloudflare Workers and sync `www/`.
  5. Commit and `git push origin main` so GitHub Actions workflow (`android-build.yml`) builds `project-archive.apk` and publishes the GitHub Release.

### 3. Build & Deployment Commands
- `npm run build`: Syncs HTML/CSS/JS assets into `www/` for Capacitor & Workers.
- `npm run deploy`: Builds `www/` and deploys Worker API + static assets to Cloudflare Workers (`project-archive.atmr.workers.dev`).
- `npx cap sync android`: Copies `www/` assets into Android native project (`android/app/src/main/assets/public`).
- `git push origin main`: Triggers `.github/workflows/android-build.yml` to compile the Android debug APK and publish a GitHub Release with asset `project-archive.apk`.
