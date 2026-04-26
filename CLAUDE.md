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

`PlaylistSections` is the main content area: it renders `CollectionCardButton` cards in a grid. Clicking a collection or playlist opens a fullscreen `YouTubeLightbox` overlay. Collections show a grid of sub-playlists; selecting one shows an embedded YouTube player with a scrollable video list below. Standalone playlists open directly to the player view.

### Static assets

Images and video are in `public/` (`bhaiya-portrait.jpg`, `bhaiya-altar.jpg`, `bg-video.mp4`, `favicon.svg`). Referenced via absolute paths (e.g., `/bhaiya-portrait.jpg`).

### Playlist video data

Video IDs and titles for all playlists are pre-fetched and stored in `src/data/playlistVideos.json`, keyed by YouTube playlist ID (the `list` query param). To refresh: `npm run fetch:playlists` (uses yt-dlp). Pass `--force` to re-fetch all. Run this after adding new playlists to `playlists.json`.

### Thumbnail convention

Thumbnails use `https://img.youtube.com/vi/{VIDEO_ID}/mqdefault.jpg`. When adding a new playlist, get the first video ID with: `yt-dlp --flat-playlist --print id --playlist-items 1 "PLAYLIST_URL"` and add the thumb URL to the JSON entry.
