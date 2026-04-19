# PWA + TWA Android App Design

Convert the Bhaavamritdhaara website into a TWA-ready PWA for Google Play Store distribution.

## Decisions

- **App name (short)**: Bhaavamrit
- **App name (full)**: Bhaavamritdhaara — Purushottam Bhaiya Dwara
- **App icon**: Bhaiya's portrait photo, circular crop with saffron-to-crimson gradient border
- **Theme color**: #2C1810 (Dark Earth)
- **Background/splash color**: #FAF6F0 (Ivory)
- **Offline behavior**: Cached version of the site (browse playlists offline, YouTube links fail gracefully)
- **Approach**: vite-plugin-pwa (Workbox) + Bubblewrap CLI
- **Push notifications**: Out of scope — separate future effort with Firebase

## 1. PWA Configuration (vite-plugin-pwa)

Install `vite-plugin-pwa` as a dev dependency. Update `vite.config.js`:

```js
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/img\.youtube\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'youtube-thumbnails',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
```

Add `<meta name="theme-color" content="#2C1810">` to `index.html`.

The plugin generates `manifest.webmanifest` and the Workbox service worker automatically at build time.

## 2. Icon Generation

A Node script (`scripts/generate-icons.js`) uses `sharp` to process `public/bhaiya-portrait.jpg`:

- Crop to square (center), resize, composite onto circular mask with saffron-to-crimson gradient border
- Output 4 files to `public/icons/`:
  - `icon-192.png` — 192x192, circular crop with gradient border
  - `icon-512.png` — 512x512, same
  - `icon-maskable-192.png` — 192x192 with 20% padding (Android safe zone)
  - `icon-maskable-512.png` — 512x512 with 20% padding
- Install `sharp` as a dev dependency
- Run once: `node scripts/generate-icons.js`
- Icons committed to repo. Re-run only if the source photo changes.

## 3. TWA Generation (Bubblewrap)

After the PWA is deployed to Netlify:

- Install Bubblewrap CLI: `npm install -g @bubblewrap/cli`
- Run `bubblewrap init --manifest https://<netlify-domain>/manifest.webmanifest`
- Configuration:
  - Package name: `com.bhaavamrit.app`
  - Display mode: standalone
  - Theme/status bar color: #2C1810
  - Splash background: #FAF6F0
  - Splash icon: icon-512.png
- Output: `android/` directory at project root (gitignored)

### Digital Asset Links

Create `public/.well-known/assetlinks.json` with the SHA-256 fingerprint from the signing keystore. This file proves the TWA owns the domain. Format:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.bhaavamrit.app",
    "sha256_cert_fingerprints": ["<SHA-256 from keystore>"]
  }
}]
```

The fingerprint is generated when Bubblewrap creates the signing key.

### Build & Publish

1. `bubblewrap build` → produces APK and AAB
2. Sign with keystore (Bubblewrap handles this)
3. Upload signed AAB to Google Play Console
4. Google Play Developer account required ($25 one-time fee — user will create)

## 4. Project Structure (new/changed files)

```
scripts/
  generate-icons.js           # NEW — icon generation script
public/
  icons/
    icon-192.png              # NEW — generated
    icon-512.png              # NEW — generated
    icon-maskable-192.png     # NEW — generated
    icon-maskable-512.png     # NEW — generated
  .well-known/
    assetlinks.json           # NEW — TWA domain verification
index.html                    # MODIFIED — add theme-color meta tag
vite.config.js                # MODIFIED — add VitePWA plugin
package.json                  # MODIFIED — add sharp, vite-plugin-pwa
android/                      # NEW — Bubblewrap output (gitignored)
```

## 5. Update Flow After Publishing

- **Content/design changes**: Push to git → Netlify deploys → app shows new content automatically (service worker auto-updates)
- **App wrapper changes** (new icon, name, package config): Rebuild with Bubblewrap, re-sign, upload new AAB to Play Console
- **No dual-codebase maintenance** — the website IS the app

## Out of Scope

- Push notifications (Firebase Cloud Messaging) — future effort
- iOS/App Store distribution — not covered
- Analytics — not covered
