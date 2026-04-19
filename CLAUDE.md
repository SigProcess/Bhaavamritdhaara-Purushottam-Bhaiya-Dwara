# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server**: `npm run dev` (Vite, serves at http://localhost:5173)
- **Build**: `npm run build` (outputs to `dist/`)
- **Preview build**: `npm run preview`

No test runner or linter is configured.

## Deployment

Deployed via Netlify. Push to `main` triggers a deploy. Config is in `netlify.toml`.

## Architecture

React 18 + Vite SPA. No router — single page. All styling is in one CSS file (`src/App.css`) using CSS variables. No CSS modules or preprocessors.

### Data flow

All playlist/collection data lives in `src/data/playlists.json`. The JSON has two top-level keys:
- `collections`: Array of collection objects, each containing a `playlists` array of sub-playlists
- `playlists`: Array of standalone playlists not in any collection

Each playlist has `id`, `title`, `url` (YouTube playlist link), and `thumb` (YouTube thumbnail URL derived from the first video in the playlist).

To add/reorganize playlists, edit the JSON only — no component changes needed.

### Component hierarchy

`App` → `Nav`, `Hero`, `PlaylistSections`, `Footer`

`PlaylistSections` is the main content area: it renders `CollectionCardButton` cards in a grid. Clicking a collection toggles `CollectionExpanded` which shows sub-playlists with thumbnails. Standalone playlists render as `Card` components below.

### Static assets

Images and video are in `public/` (`bhaiya-portrait.jpg`, `bhaiya-altar.jpg`, `bg-video.mp4`, `favicon.svg`). Referenced via absolute paths (e.g., `/bhaiya-portrait.jpg`).

### Thumbnail convention

Thumbnails use `https://img.youtube.com/vi/{VIDEO_ID}/mqdefault.jpg`. When adding a new playlist, get the first video ID with: `yt-dlp --flat-playlist --print id --playlist-items 1 "PLAYLIST_URL"` and add the thumb URL to the JSON entry.
