# Bhaavamritdhaara — Purushottam Bhaiya Dwara

Sacred devotional music — Anand Pranami bhajan playlist collection.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Adding playlists

Edit `src/data/playlists.json` and add a new entry:

```json
{
  "id": 5,
  "title": "Anand Pranami 9",
  "num": "IX",
  "url": "https://www.youtube.com/watch?v=...",
  "colors": ["#2D5A27", "#4A7A3E", "#1A3A14"]
}
```

No code changes needed — the grid renders from this file.

## Deployment

Deployed via Netlify. Push to `main` to trigger a deploy.

Build command: `npm run build`
Publish directory: `dist/`
