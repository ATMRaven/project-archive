# Selected Work — Project Archive & Native Mobile App

> A curated, running archive of projects, tools, and experiments — built as a fast web application on Cloudflare Workers and a native Android app via Ionic Capacitor.

[![Live Demo](https://img.shields.io/badge/Live_Web_App-Cloudflare_Workers-orange.svg)](https://project-archive.atmr.workers.dev)
[![GitHub Release](https://img.shields.io/badge/Download_Android_APK-v1.2.0-blue.svg)](https://github.com/ATMRaven/project-archive/releases/latest/download/project-archive.apk)

---

## 🌟 Key Features

- **Curated Archive Showcase**: Displays active projects, tools, web apps, and games with category filters, dynamic search, and custom sorting.
- **In-App Mobile Auto-Update System**: Native Capacitor Android app automatically checks for new releases on launch. Users can update directly with a single tap **without deleting or uninstalling the app**.
- **Admin Session Control**:
  - Secure admin login modal.
  - Hidden admin actions (`+ Add project`, `Reorder Categories`, `🤖 AI Assistant`, `🗑️ Trash Bin`).
  - Mobile UI ensures admin controls stay completely hidden until authenticated.
- **Automated CI/CD Build Pipeline**: Every push to `main` triggers GitHub Actions to compile the Android APK with a static signing key and publish a GitHub Release.
- **Cloudflare D1 Database & Hono Backend**: Fast serverless API powering project querying, sorting, soft deletion, and AI agent execution.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML5, Modern CSS (Glassmorphism, Dark/Light Themes), Vanilla JavaScript (ES Modules)
- **Native Mobile Shell**: [Ionic Capacitor 7](https://capacitorjs.com/) (Android)
- **Backend API**: [Hono Framework](https://hono.dev/) on [Cloudflare Workers](https://workers.cloudflare.com/)
- **Database**: [Cloudflare D1 Database](https://developers.cloudflare.com/d1/) (`project-archive-db`)
- **CI/CD Build & Releases**: GitHub Actions (`.github/workflows/android-build.yml`)

---

## 🚀 Native Mobile App & In-App Updates

The mobile app includes a seamless **In-App Auto-Update Manager**:

1. **Version Checking**: On launch inside the native app shell (`isCapacitorNativeApp()`), the app fetches `/api/version` from Cloudflare Workers.
2. **In-Place Updates**: If a newer version is available, an **Update Available** modal prompts the user with release notes and an **⚡ Update Now** action button.
3. **Static Signing Key**: The build pipeline uses a committed keystore (`android/app/debug.keystore`), ensuring all APK builds share the exact same signature. Android updates the app in-place without package conflict errors.
4. **Direct Download Link**: The latest APK binary is always available at:
   ```
   https://github.com/ATMRaven/project-archive/releases/latest/download/project-archive.apk
   ```

---

## 🛠️ Development & Deployment Workflow

### Prerequisites
- Node.js 20+
- npm 10+
- Wrangler CLI (`npm install -g wrangler`)

### Commands

| Command | Action |
|---|---|
| `npm run build` | Bundles web assets from root into `www/` for Capacitor & Workers |
| `npm run dev` | Builds `www/` and starts local Wrangler development server (`http://localhost:8787`) |
| `npm run deploy` | Builds `www/` and deploys Hono API + static web assets live to Cloudflare Workers |
| `npx cap sync android` | Copies latest `www/` assets into the Android native app project (`android/`) |
| `git push origin main` | Triggers GitHub Actions to compile the Android APK and publish a new GitHub Release |

---

## 📜 Version Bump Protocol

When releasing a new update (e.g. `v1.3.0`):

1. **Update Backend Version**: In `src/index.js`, update `latestVersion: "1.3.0"` and add release notes.
2. **Update Frontend Version**: In `script.js`, set `const APP_VERSION = "1.3.0";`.
3. **Update Android Version**: In `android/app/build.gradle`, set `versionName "1.3.0"` and increment `versionCode`.
4. **Deploy Serverless API**: Run `npm run deploy`.
5. **Publish GitHub Release**: Push to Git (`git push origin main`). GitHub Actions will automatically compile `project-archive.apk` and publish the release!

---

## 📄 License

Handcrafted with ❤️ by A.T.M.R.
