# Facebook Post Screenshots — Design Spec

## Overview

Automate screenshotting of all posts from the Facebook profile `https://www.facebook.com/purushottam.sharma.07`, capturing each post's content and Purushottam Sharma's comment replies (with parent context). Display them on the website with an expandable detail view.

## Script Architecture

A single script `scripts/screenshot-facebook-posts.js` using Playwright, running in three phases.

### Phase 1 — Collect Post URLs

- Launches Chromium with a persistent user data directory (`~/.fb-playwright-session`) for session reuse.
- First run: opens Facebook login page and pauses for manual login + 2FA. Session is saved permanently.
- Navigates to `https://www.facebook.com/purushottam.sharma.07`.
- Scrolls the feed repeatedly until no new posts load (end of profile).
- Extracts the permalink from each post's timestamp link.
- Saves all URLs to `assets/facebook-posts/collected-urls.json` with deduplication.
- Scope: all posts on the profile, no date limit.

### Phase 2 — Screenshot Each Post

- Iterates over collected URLs, skipping already-screenshotted ones.
- For each post URL:
  - Navigates to the post's permalink page.
  - Waits for content to load.
  - Screenshots the post content area → `public/facebook-posts/thumbs/fb-post-{n}.jpg`.
  - Scans comments for ones authored by "Purushottam Sharma".
  - For each of his comments: if it's a reply, expands the parent comment, then screenshots the parent + his reply together → `public/facebook-posts/comments/fb-post-{n}-comment-{m}.jpg`.
  - Rate-limits with random delays (3–8 seconds between posts, 1–3 seconds between scrolls).

### Phase 3 — Update Data Files

- Updates `assets/facebook-posts/facebook-posts.csv` with new rows.
- Regenerates `src/data/facebookLinks.json` from the CSV.

Each phase is resumable — rerunning skips completed work.

## File & Naming Convention

### Directory Layout

```
public/facebook-posts/
  thumbs/
    fb-post-001.jpg
    fb-post-002.jpg
  comments/
    fb-post-001-comment-1.jpg
    fb-post-001-comment-2.jpg
    fb-post-002-comment-1.jpg

assets/facebook-posts/
  collected-urls.json
  facebook-posts.csv
```

### collected-urls.json

```json
[
  {
    "postUrl": "https://www.facebook.com/.../posts/123456",
    "scrapedAt": "2026-04-26T10:00:00Z",
    "screenshotted": true
  }
]
```

### facebookLinks.json Schema

The `commentScreenshot` field (string) is replaced by `commentScreenshots` (array):

```json
{
  "id": "fb-post-001",
  "title": "Post by Purushottam Sharma",
  "url": "https://www.facebook.com/.../posts/123456",
  "thumb": "/facebook-posts/thumbs/fb-post-001.jpg",
  "commentScreenshots": [
    "/facebook-posts/comments/fb-post-001-comment-1.jpg",
    "/facebook-posts/comments/fb-post-001-comment-2.jpg"
  ],
  "category": "",
  "tags": [],
  "date": "2026-04-25",
  "visible": true,
  "sortOrder": 1
}
```

- Posts numbered sequentially in reverse chronological order (newest = 001).
- `title` auto-filled from first line of post text, truncated to 80 characters.
- `category` and `tags` start empty — filled in manually via CSV later.

## Anti-Detection & Resilience

### Anti-Detection

- Persistent browser context with real login session (not fresh headless).
- Runs in headed mode (visible browser window) to avoid headless detection.
- Random delays: 3–8 seconds between posts, 1–3 seconds between scrolls.
- Realistic viewport (1280×900).
- No automation flags — persistent context avoids `navigator.webdriver`.

### Resilience

- **Resumable:** `collected-urls.json` tracks which URLs have been screenshotted.
- **Rate limit detection:** CAPTCHA or "try again later" pages cause a pause; URL logged to `failed-urls.json`.
- **Crash recovery:** All state on disk; a crash loses at most the current post.
- **Per-post try/catch:** One broken post does not stop the run.

### Performance Expectations

- URL collection: ~5–15 minutes (full feed scroll).
- Screenshot phase: ~10–20 seconds per post; 500 posts ≈ 1.5–3 hours.
- Can stop and resume anytime.

## Website Display

### Card Grid (Collapsed)

The existing "Facebook Updates" section in `PlaylistSections.jsx` renders cards in a grid. Each card shows the post thumbnail, title, and an "Open" button. Category/tag filter dropdowns already in place.

### Expanded View

Clicking a card expands it inline (same pattern as `CollectionExpanded`):

1. Full-size post screenshot at the top.
2. All comment screenshots stacked vertically below (each showing Purushottam Sharma's reply with the parent question).
3. "Open on Facebook" link button at the bottom (opens original URL in new tab).
4. Click card again or X button to collapse.

No new routes or pages. Expand/collapse state managed identically to `expandedId` for collections.

## CSV Schema Update

The existing CSV header `comments_screenshot_file` (singular) changes to `comment_screenshot_files` (pipe-delimited list):

```
id,title,post_link,thumbnail_file,comment_screenshot_files,category,tags,date,visible,sort_order
fb-post-001,...,fb-post-001.jpg,fb-post-001-comment-1.jpg|fb-post-001-comment-2.jpg,...
```

The import script splits on `|` to produce the `commentScreenshots` array in JSON.

## Dependencies

- `playwright` (npm dev dependency)
- Chromium browser (installed via `npx playwright install chromium`)

## npm Scripts

```json
"facebook:login": "node scripts/screenshot-facebook-posts.js --login-only",
"facebook:collect": "node scripts/screenshot-facebook-posts.js --collect",
"facebook:screenshot": "node scripts/screenshot-facebook-posts.js --screenshot",
"facebook:all": "node scripts/screenshot-facebook-posts.js --all"
```
