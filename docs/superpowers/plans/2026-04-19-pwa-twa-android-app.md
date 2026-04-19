# PWA + TWA Android App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Bhaavamritdhaara Vite React website into a PWA with offline caching and generate a TWA wrapper for Google Play Store distribution.

**Architecture:** Add `vite-plugin-pwa` to the existing Vite build to auto-generate a web manifest and Workbox service worker. Generate app icons from the existing portrait photo using `sharp`. Create the Android TWA wrapper using `@bubblewrap/cli` pointed at the deployed Netlify PWA.

**Tech Stack:** vite-plugin-pwa (Workbox), sharp, @bubblewrap/cli

**Spec:** `docs/superpowers/specs/2026-04-19-pwa-twa-android-app-design.md`

---

### Task 1: Install dependencies and configure vite-plugin-pwa

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Modify: `index.html`

- [ ] **Step 1: Install vite-plugin-pwa**

Run:
```bash
cd Bhaavamritdhaara-Purushottam-Bhaiya-Dwara
npm install -D vite-plugin-pwa
```

Expected: `vite-plugin-pwa` and its `workbox-*` peer dependencies added to `devDependencies` in `package.json`.

- [ ] **Step 2: Update vite.config.js with PWA plugin**

Replace the contents of `vite.config.js` with:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'bhaiya-portrait.jpg', 'bhaiya-altar.jpg'],
      manifest: {
        name: 'Bhaavamritdhaara — Purushottam Bhaiya Dwara',
        short_name: 'Bhaavamrit',
        description: 'Bhajans and Pravachans by Shri Purushottam Bhaiya',
        theme_color: '#2C1810',
        background_color: '#FAF6F0',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/img\.youtube\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'youtube-thumbnails',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
```

- [ ] **Step 3: Add theme-color meta tag to index.html**

In `index.html`, add inside `<head>` after the `<meta name="viewport" ...>` line:

```html
<meta name="theme-color" content="#2C1810" />
```

- [ ] **Step 4: Verify the build succeeds**

Run:
```bash
npm run build
```

Expected: Build succeeds. `dist/` contains `manifest.webmanifest` and `sw.js` (or `registerSW.js`). Verify:
```bash
ls dist/manifest.webmanifest dist/sw.js
```

- [ ] **Step 5: Commit**

```bash
git add vite.config.js index.html package.json package-lock.json
git commit -m "feat: add vite-plugin-pwa for PWA manifest and service worker"
```

---

### Task 2: Generate app icons from portrait photo

**Files:**
- Create: `scripts/generate-icons.js`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/icons/icon-maskable-192.png`
- Create: `public/icons/icon-maskable-512.png`
- Modify: `package.json` (add sharp)

- [ ] **Step 1: Install sharp**

Run:
```bash
npm install -D sharp
```

- [ ] **Step 2: Create the icon generation script**

Create `scripts/generate-icons.js`:

```js
import sharp from 'sharp'
import path from 'path'
import { mkdir } from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'public', 'bhaiya-portrait.jpg')
const OUT = path.join(ROOT, 'public', 'icons')

const SIZES = [192, 512]
const BORDER_RATIO = 0.06
const MASKABLE_PADDING_RATIO = 0.2

async function createCircularIcon(size) {
  const border = Math.round(size * BORDER_RATIO)
  const inner = size - border * 2
  const radius = inner / 2

  const circularMask = Buffer.from(
    `<svg width="${inner}" height="${inner}">
      <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
    </svg>`
  )

  const cropped = await sharp(SOURCE)
    .resize(inner, inner, { fit: 'cover', position: 'centre' })
    .composite([{ input: circularMask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  const gradientRing = Buffer.from(
    `<svg width="${size}" height="${size}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#E8872B"/>
          <stop offset="100%" stop-color="#B83342"/>
        </linearGradient>
      </defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#g)"/>
    </svg>`
  )

  return sharp(gradientRing)
    .composite([{ input: cropped, top: border, left: border }])
    .png()
    .toBuffer()
}

async function createMaskableIcon(size) {
  const padding = Math.round(size * MASKABLE_PADDING_RATIO)
  const innerSize = size - padding * 2
  const border = Math.round(innerSize * BORDER_RATIO)
  const photoSize = innerSize - border * 2
  const radius = photoSize / 2

  const circularMask = Buffer.from(
    `<svg width="${photoSize}" height="${photoSize}">
      <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
    </svg>`
  )

  const cropped = await sharp(SOURCE)
    .resize(photoSize, photoSize, { fit: 'cover', position: 'centre' })
    .composite([{ input: circularMask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  const gradientCircle = Buffer.from(
    `<svg width="${innerSize}" height="${innerSize}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#E8872B"/>
          <stop offset="100%" stop-color="#B83342"/>
        </linearGradient>
      </defs>
      <circle cx="${innerSize / 2}" cy="${innerSize / 2}" r="${innerSize / 2}" fill="url(#g)"/>
    </svg>`
  )

  const innerComposite = await sharp(gradientCircle)
    .composite([{ input: cropped, top: border, left: border }])
    .png()
    .toBuffer()

  const bg = Buffer.from(
    `<svg width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="#FAF6F0"/>
    </svg>`
  )

  return sharp(bg)
    .composite([{ input: innerComposite, top: padding, left: padding }])
    .png()
    .toBuffer()
}

async function main() {
  await mkdir(OUT, { recursive: true })

  for (const size of SIZES) {
    const icon = await createCircularIcon(size)
    await sharp(icon).toFile(path.join(OUT, `icon-${size}.png`))
    console.log(`Created icon-${size}.png`)

    const maskable = await createMaskableIcon(size)
    await sharp(maskable).toFile(path.join(OUT, `icon-maskable-${size}.png`))
    console.log(`Created icon-maskable-${size}.png`)
  }

  console.log('All icons generated.')
}

main().catch(console.error)
```

- [ ] **Step 3: Run the icon generation script**

Run:
```bash
node scripts/generate-icons.js
```

Expected output:
```
Created icon-192.png
Created icon-maskable-192.png
Created icon-512.png
Created icon-maskable-512.png
All icons generated.
```

Verify files exist:
```bash
ls -la public/icons/
```

Expected: 4 PNG files in `public/icons/`.

- [ ] **Step 4: Verify build still works with icons**

Run:
```bash
npm run build
```

Expected: Build succeeds. Icons are copied into `dist/icons/`.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-icons.js public/icons/ package.json package-lock.json
git commit -m "feat: add icon generation script and PWA icons"
```

---

### Task 3: Add Digital Asset Links placeholder and update .gitignore

**Files:**
- Create: `public/.well-known/assetlinks.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create the assetlinks.json file**

Create `public/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.bhaavamrit.app",
    "sha256_cert_fingerprints": ["__REPLACE_WITH_SHA256_FROM_KEYSTORE__"]
  }
}]
```

Note: The `sha256_cert_fingerprints` value must be replaced with the actual SHA-256 fingerprint after running `bubblewrap init` and generating the signing keystore.

- [ ] **Step 2: Configure Netlify to serve .well-known with correct headers**

Create `public/_headers`:

```
/.well-known/*
  Content-Type: application/json
  Access-Control-Allow-Origin: *
```

- [ ] **Step 3: Update .gitignore**

Append to `.gitignore`:

```
android/
```

- [ ] **Step 4: Verify build includes .well-known**

Run:
```bash
npm run build && ls dist/.well-known/assetlinks.json
```

Expected: File exists in `dist/.well-known/`.

- [ ] **Step 5: Commit**

```bash
git add public/.well-known/assetlinks.json public/_headers .gitignore
git commit -m "feat: add Digital Asset Links placeholder and Netlify headers"
```

---

### Task 4: Deploy PWA to Netlify and verify

**Files:** None changed — deployment verification.

- [ ] **Step 1: Push all changes to trigger Netlify deploy**

```bash
git push origin main
```

- [ ] **Step 2: Wait for Netlify deploy to complete**

Check deploy status at the Netlify dashboard or run:
```bash
# If you have netlify CLI installed:
netlify status
```

- [ ] **Step 3: Verify manifest is served correctly**

Open `https://<your-netlify-domain>/manifest.webmanifest` in a browser. Confirm it contains the correct `name`, `short_name`, `icons`, `theme_color`, and `background_color`.

- [ ] **Step 4: Verify service worker registers**

Open `https://<your-netlify-domain>` in Chrome. Open DevTools → Application tab → Service Workers. Confirm a service worker is registered and active.

- [ ] **Step 5: Run Lighthouse PWA audit**

In Chrome DevTools → Lighthouse → check "Progressive Web App" → Generate report.

Expected: PWA badge should pass. Key checks:
- Has a web app manifest
- Registers a service worker
- Responds with 200 when offline (after first load)
- Has appropriate icons

---

### Task 5: Generate TWA with Bubblewrap (interactive — requires user input)

**Files:**
- Create: `android/` directory (gitignored)

This task is interactive and requires the user to answer Bubblewrap's prompts.

- [ ] **Step 1: Install Bubblewrap CLI**

```bash
npm install -g @bubblewrap/cli
```

Bubblewrap requires JDK 11+ and Android SDK. If not installed, Bubblewrap will prompt to download them automatically on first run.

- [ ] **Step 2: Initialize the TWA project**

From the project root, run:

```bash
mkdir android && cd android
bubblewrap init --manifest https://<your-netlify-domain>/manifest.webmanifest
```

When prompted, provide:
- **Package name**: `com.bhaavamrit.app`
- **App name**: `Bhaavamrit`
- **Launcher name**: `Bhaavamrit`
- **Theme color**: `#2C1810`
- **Background color**: `#FAF6F0`
- **Start URL**: `/`
- **Icon/Splash**: Accept defaults (reads from manifest)
- **Signing key**: Let Bubblewrap generate a new one. **Save the keystore password securely — you need it for every future update.**

- [ ] **Step 3: Note the SHA-256 fingerprint**

After keystore generation, Bubblewrap prints the SHA-256 fingerprint. Copy it.

Run (if you need to retrieve it again):
```bash
keytool -list -v -keystore android/app/signing-key.jks
```

- [ ] **Step 4: Update assetlinks.json with the real fingerprint**

Edit `public/.well-known/assetlinks.json` and replace `__REPLACE_WITH_SHA256_FROM_KEYSTORE__` with the actual SHA-256 fingerprint from step 3.

Then rebuild and deploy:
```bash
cd .. # back to project root
npm run build
git add public/.well-known/assetlinks.json
git commit -m "feat: add signing key SHA-256 to assetlinks.json"
git push origin main
```

- [ ] **Step 5: Build the TWA**

```bash
cd android
bubblewrap build
```

Expected output: `app-release-bundle.aab` and `app-release-signed.apk` in the `android/` directory.

- [ ] **Step 6: Test the APK on a device or emulator**

Install on a connected Android device:
```bash
adb install app-release-signed.apk
```

Or drag the APK into an Android emulator. Verify:
- App launches without browser chrome
- Status bar shows Dark Earth (#2C1810) color
- Splash screen shows ivory background with the portrait icon
- Site loads and is navigable
- Collections expand and playlist links open YouTube

---

### Task 6: Publish to Google Play Store (manual — user action)

This task is performed by the user in the Google Play Console.

- [ ] **Step 1: Create a Google Play Developer account**

Go to https://play.google.com/console/ and pay the $25 one-time registration fee.

- [ ] **Step 2: Create a new app**

In the Play Console, create a new app:
- App name: **Bhaavamrit**
- Default language: English
- App type: App
- Free/Paid: Free

- [ ] **Step 3: Upload the AAB**

Go to Release → Production → Create new release → Upload `app-release-bundle.aab` from `android/`.

- [ ] **Step 4: Complete the store listing**

Fill in required fields:
- Short description: "Bhajans and Pravachans by Shri Purushottam Bhaiya"
- Full description: "Bhaavamritdhaara — a collection of sacred devotional offerings streaming the nectar of divine emotion. Browse curated collections of bhajans, pravachans, lekh, and vani vishleshan by Shri Purushottam Bhaiya."
- Screenshots: Take screenshots from the app on an emulator/device
- App icon: Upload `public/icons/icon-512.png`
- Category: Entertainment or Education
- Content rating: Complete the questionnaire

- [ ] **Step 5: Submit for review**

Submit the app for Google's review. Typical review takes 1-7 days for first submission.
