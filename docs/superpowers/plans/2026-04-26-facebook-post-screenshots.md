# Facebook Post Screenshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate screenshotting all posts and Purushottam Sharma's comment replies from facebook.com/purushottam.sharma.07 using Playwright, then display them on the website with an expandable detail view.

**Architecture:** A single Playwright script (`scripts/screenshot-facebook-posts.js`) with three phases (collect URLs → screenshot posts+comments → update data files). The existing CSV→JSON import pipeline is updated to support multiple comment screenshots per post. The website gets a new `FacebookPostExpanded` component for the inline detail view, reusing the `CollectionExpanded` pattern.

**Tech Stack:** Playwright (Chromium, persistent context), Node.js ESM scripts, React 18, CSS (no modules)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `scripts/screenshot-facebook-posts.js` | Playwright automation: collect URLs, screenshot posts + comments |
| Modify | `scripts/import-facebook-posts-from-csv.js` | Support `comment_screenshot_files` (pipe-delimited) → `commentScreenshots` array |
| Modify | `assets/facebook-posts/facebook-posts.csv` | Update header: `comments_screenshot_file` → `comment_screenshot_files` |
| Modify | `assets/facebook-posts/facebook-posts-template.csv` | Same header update |
| Modify | `package.json` | Add `playwright` devDependency + new npm scripts |
| Create | `src/components/FacebookPostExpanded.jsx` | Expanded detail view: post screenshot + comment screenshots + "Open on Facebook" link |
| Modify | `src/components/PlaylistSections.jsx` | Add expand/collapse state for Facebook cards, render `FacebookPostExpanded` |
| Modify | `src/components/Card.jsx` | Accept `onClick` prop to handle expand instead of always opening URL |
| Modify | `src/App.css` | Styles for expanded Facebook post view |

---

### Task 1: Install Playwright and Add npm Scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Playwright as a dev dependency**

```bash
cd "/Users/tasharma/Downloads/Bhaiya Website/Bhaavamritdhaara-Purushottam-Bhaiya-Dwara"
npm install --save-dev playwright
```

Expected: `playwright` added to `devDependencies` in `package.json`.

- [ ] **Step 2: Install Chromium browser binary**

```bash
cd "/Users/tasharma/Downloads/Bhaiya Website/Bhaavamritdhaara-Purushottam-Bhaiya-Dwara"
npx playwright install chromium
```

Expected: Chromium downloaded to Playwright's cache directory.

- [ ] **Step 3: Add npm scripts to package.json**

In `package.json`, add these scripts alongside the existing `facebook:*` scripts:

```json
"facebook:login": "node scripts/screenshot-facebook-posts.js --login-only",
"facebook:collect": "node scripts/screenshot-facebook-posts.js --collect",
"facebook:screenshot": "node scripts/screenshot-facebook-posts.js --screenshot",
"facebook:all": "node scripts/screenshot-facebook-posts.js --all"
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add Playwright dependency and Facebook screenshot npm scripts"
```

---

### Task 2: Create the Playwright Screenshot Script — Login & URL Collection (Phase 1)

**Files:**
- Create: `scripts/screenshot-facebook-posts.js`

- [ ] **Step 1: Create the script with CLI arg parsing, browser launch, and login flow**

Create `scripts/screenshot-facebook-posts.js`:

```js
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

const PROFILE_URL = 'https://www.facebook.com/purushottam.sharma.07'
const AUTHOR_NAME = 'Purushottam Sharma'

const rootDir = process.cwd()
const collectedUrlsPath = path.join(rootDir, 'assets/facebook-posts/collected-urls.json')
const failedUrlsPath = path.join(rootDir, 'assets/facebook-posts/failed-urls.json')
const thumbsDir = path.join(rootDir, 'public/facebook-posts/thumbs')
const commentsDir = path.join(rootDir, 'public/facebook-posts/comments')
const csvPath = path.join(rootDir, 'assets/facebook-posts/facebook-posts.csv')
const jsonPath = path.join(rootDir, 'src/data/facebookLinks.json')
const userDataDir = path.join(os.homedir(), '.fb-playwright-session')

function randomDelay(minMs, maxMs) {
  return new Promise((resolve) =>
    setTimeout(resolve, minMs + Math.random() * (maxMs - minMs))
  )
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

async function launchBrowser() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  })
  return context
}

async function ensureLoggedIn(context) {
  const page = context.pages()[0] || await context.newPage()
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' })
  await randomDelay(2000, 3000)

  const loggedIn = await page.evaluate(() => {
    return document.querySelector('[aria-label="Facebook"]') !== null
      || document.querySelector('[role="banner"]') !== null
  })

  if (!loggedIn) {
    console.log('\n=== Facebook Login Required ===')
    console.log('Please log in to Facebook in the browser window.')
    console.log('After logging in successfully, press Enter here to continue...\n')
    await waitForEnter()
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' })
    await randomDelay(2000, 3000)
  }

  console.log('Logged in to Facebook.')
  return page
}

function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.once('data', () => resolve())
  })
}

async function collectPostUrls(page) {
  console.log(`\nNavigating to ${PROFILE_URL}...`)
  await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded' })
  await randomDelay(3000, 5000)

  const existing = await readJson(collectedUrlsPath)
  const knownUrls = new Set(existing.map((entry) => entry.postUrl))

  let previousCount = 0
  let noNewPostsRounds = 0
  const maxNoNewRounds = 5

  console.log('Scrolling to collect post URLs...')

  while (noNewPostsRounds < maxNoNewRounds) {
    const urls = await page.evaluate(() => {
      const links = []
      // Facebook post timestamps are links with href containing /posts/, /photos/, /photo/, /videos/, /permalink/
      const anchors = document.querySelectorAll('a[href]')
      for (const a of anchors) {
        const href = a.href
        if (
          href.includes('/posts/') ||
          href.includes('/photos/') ||
          href.includes('/photo') ||
          href.includes('/videos/') ||
          href.includes('/permalink.php')
        ) {
          // Clean URL: remove query params except fbid and set
          try {
            const u = new URL(href)
            if (u.hostname.includes('facebook.com')) {
              links.push(href)
            }
          } catch { /* skip malformed */ }
        }
      }
      return [...new Set(links)]
    })

    let newCount = 0
    for (const url of urls) {
      if (!knownUrls.has(url)) {
        knownUrls.add(url)
        existing.push({
          postUrl: url,
          scrapedAt: new Date().toISOString(),
          screenshotted: false,
        })
        newCount++
      }
    }

    console.log(`  Found ${urls.length} links on page, ${newCount} new. Total: ${existing.length}`)

    if (existing.length === previousCount) {
      noNewPostsRounds++
    } else {
      noNewPostsRounds = 0
      previousCount = existing.length
    }

    await writeJson(collectedUrlsPath, existing)

    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2))
    await randomDelay(1500, 3500)
  }

  console.log(`\nURL collection complete. Total unique URLs: ${existing.length}`)
  return existing
}

// ---- Phase 2 & 3 will be added in Task 3 ----

async function main() {
  const args = process.argv.slice(2)
  const mode = args[0] || '--all'

  await fs.mkdir(thumbsDir, { recursive: true })
  await fs.mkdir(commentsDir, { recursive: true })

  const context = await launchBrowser()

  try {
    const page = await ensureLoggedIn(context)

    if (mode === '--login-only') {
      console.log('Login verified. Session saved. Exiting.')
      return
    }

    if (mode === '--collect' || mode === '--all') {
      await collectPostUrls(page)
    }

    if (mode === '--screenshot' || mode === '--all') {
      console.log('\n[Phase 2 - Screenshots] Not yet implemented.')
    }
  } finally {
    await context.close()
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exitCode = 1
})
```

- [ ] **Step 2: Test the login flow**

```bash
cd "/Users/tasharma/Downloads/Bhaiya Website/Bhaavamritdhaara-Purushottam-Bhaiya-Dwara"
npm run facebook:login
```

Expected: Browser opens, either detects existing login or prompts you to log in. After login, prints "Logged in to Facebook. Login verified. Session saved. Exiting."

- [ ] **Step 3: Test URL collection**

```bash
npm run facebook:collect
```

Expected: Browser navigates to the profile, scrolls repeatedly, prints progress like "Found 43 links on page, 43 new. Total: 43". Eventually stops when no new posts are found. Creates/updates `assets/facebook-posts/collected-urls.json`.

- [ ] **Step 4: Commit**

```bash
git add scripts/screenshot-facebook-posts.js
git commit -m "feat: add Playwright script with login and URL collection phases"
```

---

### Task 3: Add Screenshot Phase (Phase 2) to the Playwright Script

**Files:**
- Modify: `scripts/screenshot-facebook-posts.js`

- [ ] **Step 1: Add the `screenshotPost` function after `collectPostUrls`**

Insert before the `// ---- Phase 2 & 3` comment, replacing it:

```js
async function screenshotPost(page, postUrl, postIndex) {
  const postId = `fb-post-${String(postIndex).padStart(3, '0')}`
  const thumbPath = path.join(thumbsDir, `${postId}.jpg`)

  await page.goto(postUrl, { waitUntil: 'domcontentloaded' })
  await randomDelay(2000, 4000)

  // Close any popups/overlays
  try {
    const closeBtn = page.locator('[aria-label="Close"]').first()
    if (await closeBtn.isVisible({ timeout: 1000 })) {
      await closeBtn.click()
      await randomDelay(500, 1000)
    }
  } catch { /* no popup */ }

  // Screenshot the main post content
  const postContent = page.locator('[role="article"]').first()
  try {
    await postContent.waitFor({ timeout: 8000 })
    await postContent.screenshot({ path: thumbPath, type: 'jpeg', quality: 85 })
    console.log(`  [POST] ${postId} -> ${path.basename(thumbPath)}`)
  } catch (err) {
    console.log(`  [POST] ${postId} FAILED: ${err.message}`)
    return null
  }

  // Extract post title from text content
  let title = ''
  try {
    title = await postContent.evaluate((el) => {
      const textEl = el.querySelector('[data-ad-comet-preview="message"]') ||
                     el.querySelector('[data-ad-preview="message"]') ||
                     el.querySelector('[dir="auto"]')
      return textEl ? textEl.textContent.trim() : ''
    })
  } catch { /* no text */ }
  title = (title || 'Post by Purushottam Sharma').slice(0, 80)

  // Extract post date
  let date = ''
  try {
    date = await page.evaluate(() => {
      const timeEl = document.querySelector('abbr[data-utime]')
      if (timeEl) {
        const ts = Number(timeEl.getAttribute('data-utime')) * 1000
        return new Date(ts).toISOString().split('T')[0]
      }
      const timeEl2 = document.querySelector('a[href*="/posts/"] span, a[href*="/photo"] span')
      return ''
    })
  } catch { /* no date */ }
  if (!date) {
    date = new Date().toISOString().split('T')[0]
  }

  // Find and screenshot Purushottam Sharma's comments
  const commentScreenshots = []

  try {
    // Scroll down to load comments
    await page.evaluate(() => window.scrollBy(0, window.innerHeight))
    await randomDelay(1500, 2500)

    // Expand "View more comments" links
    for (let i = 0; i < 10; i++) {
      const viewMore = page.locator('text=/View more comments|View all .* comments/i').first()
      if (await viewMore.isVisible({ timeout: 1000 })) {
        await viewMore.click()
        await randomDelay(1000, 2000)
      } else {
        break
      }
    }

    // Expand reply threads
    for (let i = 0; i < 20; i++) {
      const viewReplies = page.locator('text=/View .* repl/i').first()
      if (await viewReplies.isVisible({ timeout: 500 })) {
        await viewReplies.click()
        await randomDelay(800, 1500)
      } else {
        break
      }
    }

    // Find all comment blocks authored by Purushottam Sharma
    const commentLocators = page.locator('[role="article"]')
    const commentCount = await commentLocators.count()

    let commentIndex = 1
    for (let c = 0; c < commentCount; c++) {
      const comment = commentLocators.nth(c)
      const isAuthor = await comment.evaluate((el, authorName) => {
        const nameEl = el.querySelector('a[role="link"] span')
        return nameEl && nameEl.textContent.trim() === authorName
      }, AUTHOR_NAME)

      if (!isAuthor) continue

      // Check if this comment is a reply — look for parent comment
      const parentComment = await comment.evaluate((el) => {
        const prev = el.parentElement?.closest('[role="article"]')
        return prev ? true : false
      })

      const commentFile = `${postId}-comment-${commentIndex}.jpg`
      const commentPath = path.join(commentsDir, commentFile)

      if (parentComment) {
        // Screenshot the parent + this reply together via the containing element
        const container = comment.locator('xpath=ancestor::*[contains(@class, "x1y1aw1k")]').first()
        try {
          if (await container.isVisible({ timeout: 1000 })) {
            await container.screenshot({ path: commentPath, type: 'jpeg', quality: 85 })
          } else {
            await comment.screenshot({ path: commentPath, type: 'jpeg', quality: 85 })
          }
        } catch {
          await comment.screenshot({ path: commentPath, type: 'jpeg', quality: 85 })
        }
      } else {
        await comment.screenshot({ path: commentPath, type: 'jpeg', quality: 85 })
      }

      commentScreenshots.push(commentFile)
      console.log(`  [COMMENT] ${commentFile}`)
      commentIndex++
    }
  } catch (err) {
    console.log(`  [COMMENTS] Error scanning comments: ${err.message}`)
  }

  return {
    id: postId,
    title,
    url: postUrl,
    thumbFile: `${postId}.jpg`,
    commentFiles: commentScreenshots,
    date,
  }
}

async function screenshotAllPosts(page) {
  const entries = await readJson(collectedUrlsPath)
  const pending = entries.filter((e) => !e.screenshotted)
  const failed = await readJson(failedUrlsPath)
  const failedSet = new Set(failed.map((f) => f.postUrl))

  console.log(`\nScreenshotting ${pending.length} posts (${entries.length - pending.length} already done)...`)

  const results = []
  let postIndex = entries.filter((e) => e.screenshotted).length + 1

  for (const entry of pending) {
    if (failedSet.has(entry.postUrl)) {
      console.log(`  [SKIP] Previously failed: ${entry.postUrl}`)
      continue
    }

    console.log(`\n[${postIndex}/${entries.length}] ${entry.postUrl}`)

    try {
      // Check for rate-limiting / CAPTCHA
      const pageContent = await page.content()
      if (pageContent.includes('Please try again later') || pageContent.includes('checkpoint')) {
        console.log('\n=== Rate limit or CAPTCHA detected! ===')
        console.log('Pausing. Resolve in the browser, then press Enter to continue...\n')
        failed.push({ postUrl: entry.postUrl, reason: 'rate-limited', at: new Date().toISOString() })
        await writeJson(failedUrlsPath, failed)
        await waitForEnter()
      }

      const result = await screenshotPost(page, entry.postUrl, postIndex)
      if (result) {
        results.push(result)
        entry.screenshotted = true
        await writeJson(collectedUrlsPath, entries)
      }
    } catch (err) {
      console.log(`  [ERROR] ${err.message}`)
      failed.push({ postUrl: entry.postUrl, reason: err.message, at: new Date().toISOString() })
      await writeJson(failedUrlsPath, failed)
    }

    postIndex++
    await randomDelay(3000, 8000)
  }

  return results
}
```

- [ ] **Step 2: Update the `main` function to call Phase 2**

Replace the `--screenshot` / `--all` block in `main()`:

```js
    if (mode === '--screenshot' || mode === '--all') {
      const results = await screenshotAllPosts(page)
      console.log(`\nScreenshot phase complete. ${results.length} new posts captured.`)
    }
```

- [ ] **Step 3: Test with a small batch**

Manually edit `assets/facebook-posts/collected-urls.json` to keep only 2-3 URLs, then run:

```bash
npm run facebook:screenshot
```

Expected: Browser visits each post URL, screenshots appear in `public/facebook-posts/thumbs/` and `public/facebook-posts/comments/`. Console shows progress per post.

- [ ] **Step 4: Commit**

```bash
git add scripts/screenshot-facebook-posts.js
git commit -m "feat: add post and comment screenshot phase to Playwright script"
```

---

### Task 4: Add Data Update Phase (Phase 3) to the Playwright Script

**Files:**
- Modify: `scripts/screenshot-facebook-posts.js`

- [ ] **Step 1: Add the `updateDataFiles` function after `screenshotAllPosts`**

```js
function toCsvLine(values) {
  return values
    .map((value) => {
      const str = String(value ?? '')
      if (/[,"\n|]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    })
    .join(',')
}

async function updateDataFiles(results) {
  if (results.length === 0) {
    console.log('\nNo new results to write.')
    return
  }

  const csvHeaders = [
    'id', 'title', 'post_link', 'thumbnail_file',
    'comment_screenshot_files', 'category', 'tags', 'date', 'visible', 'sort_order',
  ]

  // Read existing CSV rows (if any)
  let existingRows = []
  try {
    const raw = await fs.readFile(csvPath, 'utf8')
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length > 1) {
      const headers = lines[0].split(',').map((h) => h.trim())
      existingRows = lines.slice(1).map((line) => {
        const cells = line.split(',').map((c) => c.trim())
        const row = {}
        headers.forEach((h, i) => { row[h] = cells[i] || '' })
        return row
      })
    }
  } catch { /* no existing CSV */ }

  const existingIds = new Set(existingRows.map((r) => r.id))

  for (const result of results) {
    if (existingIds.has(result.id)) continue

    existingRows.push({
      id: result.id,
      title: result.title,
      post_link: result.url,
      thumbnail_file: result.thumbFile,
      comment_screenshot_files: result.commentFiles.join('|'),
      category: '',
      tags: '',
      date: result.date,
      visible: 'yes',
      sort_order: String(existingRows.length + 1),
    })
  }

  const csvOutput = [
    toCsvLine(csvHeaders),
    ...existingRows.map((row) => toCsvLine(csvHeaders.map((h) => row[h] || ''))),
  ].join('\n') + '\n'

  await fs.writeFile(csvPath, csvOutput, 'utf8')
  console.log(`CSV updated: ${existingRows.length} total rows.`)

  // Generate JSON
  const jsonEntries = existingRows.map((row) => ({
    id: row.id,
    title: row.title,
    url: row.post_link,
    thumb: row.thumbnail_file ? `/facebook-posts/thumbs/${row.thumbnail_file}` : '',
    commentScreenshots: (row.comment_screenshot_files || '')
      .split('|')
      .filter(Boolean)
      .map((f) => `/facebook-posts/comments/${f}`),
    category: row.category || '',
    tags: (row.tags || '').split('|').map((t) => t.trim()).filter(Boolean),
    date: row.date,
    visible: ['yes', 'true', '1', 'y'].includes((row.visible || '').toLowerCase()),
    sortOrder: Number.parseInt(row.sort_order, 10) || 9999,
  }))

  jsonEntries.sort((a, b) => a.sortOrder - b.sortOrder)
  await writeJson(jsonPath, jsonEntries)
  console.log(`JSON updated: ${jsonEntries.length} entries.`)
}
```

- [ ] **Step 2: Wire Phase 3 into `main()`**

After the screenshot phase in `main()`, add:

```js
    if (mode === '--screenshot' || mode === '--all') {
      const results = await screenshotAllPosts(page)
      console.log(`\nScreenshot phase complete. ${results.length} new posts captured.`)
      await updateDataFiles(results)
    }
```

- [ ] **Step 3: Test the full pipeline end-to-end**

```bash
npm run facebook:all
```

Expected: Login → URL collection → screenshots → CSV and JSON updated. Check `src/data/facebookLinks.json` has entries with `commentScreenshots` arrays.

- [ ] **Step 4: Commit**

```bash
git add scripts/screenshot-facebook-posts.js
git commit -m "feat: add data file update phase to Playwright screenshot script"
```

---

### Task 5: Update the Existing CSV Import Script for Multi-Comment Support

**Files:**
- Modify: `scripts/import-facebook-posts-from-csv.js`
- Modify: `assets/facebook-posts/facebook-posts.csv` (header change)
- Modify: `assets/facebook-posts/facebook-posts-template.csv` (header change)

- [ ] **Step 1: Update CSV header in both CSV files**

In both `assets/facebook-posts/facebook-posts.csv` and `assets/facebook-posts/facebook-posts-template.csv`, change the header from:

```
id,title,post_link,thumbnail_file,comments_screenshot_file,category,tags,date,visible,sort_order
```

to:

```
id,title,post_link,thumbnail_file,comment_screenshot_files,category,tags,date,visible,sort_order
```

And update the data rows: for `fb-post-1`, change `fb-post-1-comments.jpg` → `fb-post-1-comments.jpg` (same value, just new column name). For `fb-post-2`, change `fb-post-2-comments.jpg` → `fb-post-2-comments.jpg`.

- [ ] **Step 2: Update the import script to handle pipe-delimited comment files**

In `scripts/import-facebook-posts-from-csv.js`, update the `requiredHeaders` array — replace `'comments_screenshot_file'` with `'comment_screenshot_files'`:

```js
const requiredHeaders = [
  'id',
  'title',
  'post_link',
  'thumbnail_file',
  'comment_screenshot_files',
  'category',
  'tags',
  'date',
  'visible',
  'sort_order',
]
```

Then update the mapping inside `main()`. Replace the section that reads `commentFile` and builds `commentPath`:

```js
      const commentFiles = (row.comment_screenshot_files || '')
        .split('|')
        .map((f) => f.trim())
        .filter(Boolean)

      const commentScreenshots = commentFiles.map((f) => `/facebook-posts/comments/${f}`)

      for (const f of commentFiles) {
        const fullPath = path.join(commentsDir, f)
        if (!(await fileExists(fullPath))) {
          warnings.push(`Missing comment screenshot: ${f}`)
        }
      }
```

And change the return object to use `commentScreenshots` (array) instead of `commentScreenshot` (string):

```js
      return {
        id: row.id,
        title: row.title,
        url: row.post_link,
        thumb: thumbPath,
        commentScreenshots,
        category: row.category || 'Uncategorized',
        tags: parseTags(row.tags),
        date: row.date,
        visible: parseVisible(row.visible),
        sortOrder: Number.isNaN(sortOrder) ? 9999 : sortOrder,
      }
```

- [ ] **Step 3: Test the import script**

```bash
npm run facebook:import
```

Expected: No errors. Check `src/data/facebookLinks.json` — entries should now have `commentScreenshots: [...]` arrays instead of `commentScreenshot: "..."` strings.

- [ ] **Step 4: Commit**

```bash
git add scripts/import-facebook-posts-from-csv.js assets/facebook-posts/facebook-posts.csv assets/facebook-posts/facebook-posts-template.csv
git commit -m "feat: update CSV import to support multiple comment screenshots per post"
```

---

### Task 6: Update Card Component to Support Click Override

**Files:**
- Modify: `src/components/Card.jsx`

- [ ] **Step 1: Add an `onClick` prop to Card**

Currently `Card` always calls `window.open(playlist.url, '_blank')` on click. For Facebook cards we need to expand inline instead. Update `Card.jsx`:

```jsx
function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  )
}

export default function Card({ playlist, index, ctaLabel = 'Play', onClick }) {
  const handleClick = () => {
    if (onClick) {
      onClick()
    } else {
      window.open(playlist.url, '_blank')
    }
  }

  return (
    <div
      className="playlist-card"
      style={{ animationDelay: `${0.05 + index * 0.06}s` }}
      onClick={handleClick}
    >
      {playlist.thumb && (
        <div className="playlist-card-thumb">
          <img src={playlist.thumb} alt={playlist.title} loading="lazy" />
          <div className="playlist-card-play-overlay">
            <PlayIcon />
          </div>
        </div>
      )}
      <div className="playlist-card-info">
        <div className="playlist-card-title">{playlist.title}</div>
        <button className="playlist-card-btn">
          <PlayIcon />
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify existing playlist cards still work**

```bash
npm run dev
```

Open the site, click a playlist card — it should still open the YouTube URL in a new tab (no `onClick` prop passed = default behavior preserved).

- [ ] **Step 3: Commit**

```bash
git add src/components/Card.jsx
git commit -m "feat: add onClick prop to Card for custom click handling"
```

---

### Task 7: Create FacebookPostExpanded Component

**Files:**
- Create: `src/components/FacebookPostExpanded.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/FacebookPostExpanded.jsx`:

```jsx
function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

export default function FacebookPostExpanded({ post, onClose }) {
  const commentScreenshots = post.commentScreenshots || []

  return (
    <div className="fb-expanded-wrap">
      <div className="fb-expanded">
        <div className="fb-expanded-header">
          <div className="fb-expanded-title">{post.title}</div>
          <button className="fb-expanded-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="fb-expanded-post-img">
          <img src={post.thumb} alt={post.title} loading="lazy" />
        </div>

        {commentScreenshots.length > 0 && (
          <div className="fb-expanded-comments">
            <div className="fb-expanded-comments-label">Replies by Purushottam Bhaiya</div>
            {commentScreenshots.map((src, i) => (
              <img
                key={i}
                className="fb-expanded-comment-img"
                src={src}
                alt={`Comment ${i + 1}`}
                loading="lazy"
              />
            ))}
          </div>
        )}

        <a
          className="fb-expanded-link"
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLinkIcon />
          Open on Facebook
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FacebookPostExpanded.jsx
git commit -m "feat: add FacebookPostExpanded component for inline detail view"
```

---

### Task 8: Add Styles for FacebookPostExpanded

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Add CSS after the `.facebook-filter` block (before `/* === BHAJANS PAGE === */`)**

```css
/* === FACEBOOK POST EXPANDED === */
.fb-expanded-wrap{
  animation:slideUp 0.35s ease both;
  margin-top:16px;
  margin-bottom:1rem;
}
.fb-expanded{
  background:#BF7A42;
  border-radius:14px;
  border:1px solid rgba(232,135,43,0.25);
  padding:20px;
  box-shadow:inset 0 1px 3px rgba(61,23,8,0.06);
}
.fb-expanded-header{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
  margin-bottom:16px;
}
.fb-expanded-title{
  font-family:'Playfair Display',serif;
  font-size:1.1rem;
  font-weight:600;
  color:var(--earth);
  line-height:1.35;
}
.fb-expanded-close{
  flex-shrink:0;
  width:30px;height:30px;
  border-radius:50%;
  border:1px solid rgba(61,23,8,0.15);
  background:rgba(255,255,255,0.2);
  color:var(--earth);
  font-size:0.9rem;
  cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  transition:all 0.2s ease;
}
.fb-expanded-close:hover{
  background:rgba(184,51,66,0.1);
  border-color:rgba(184,51,66,0.3);
}
.fb-expanded-post-img{
  border-radius:10px;
  overflow:hidden;
  margin-bottom:16px;
}
.fb-expanded-post-img img{
  width:100%;
  display:block;
  border-radius:10px;
}
.fb-expanded-comments{
  margin-bottom:16px;
}
.fb-expanded-comments-label{
  font-size:0.75rem;
  letter-spacing:0.08em;
  text-transform:uppercase;
  color:var(--text-muted);
  margin-bottom:10px;
}
.fb-expanded-comment-img{
  width:100%;
  display:block;
  border-radius:8px;
  margin-bottom:8px;
  border:1px solid rgba(61,23,8,0.08);
}
.fb-expanded-link{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:10px 18px;
  border-radius:10px;
  background:linear-gradient(135deg,rgba(232,135,43,0.12),rgba(184,51,66,0.08));
  color:var(--earth);
  text-decoration:none;
  font-family:'Lora',serif;
  font-size:0.9rem;
  letter-spacing:0.03em;
  transition:all 0.2s ease;
}
.fb-expanded-link:hover{
  background:linear-gradient(135deg,rgba(232,135,43,0.22),rgba(184,51,66,0.14));
}
@media(max-width:640px){
  .fb-expanded{
    padding:14px;
  }
}
```

- [ ] **Step 2: Verify styles load**

```bash
npm run dev
```

No visual change yet (no expanded cards), but the site should load without CSS errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: add styles for Facebook post expanded view"
```

---

### Task 9: Wire Up Expand/Collapse in PlaylistSections

**Files:**
- Modify: `src/components/PlaylistSections.jsx`

- [ ] **Step 1: Add expand state and render FacebookPostExpanded**

Replace the full contents of `src/components/PlaylistSections.jsx`:

```jsx
import { useState } from 'react'
import data from '../data/playlists.json'
import facebookLinks from '../data/facebookLinks.json'
import { CollectionCardButton, CollectionExpanded } from './CollectionCard'
import Card from './Card'
import FacebookPostExpanded from './FacebookPostExpanded'

export default function PlaylistSections() {
  const [expandedId, setExpandedId] = useState(null)
  const [expandedFbId, setExpandedFbId] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedTag, setSelectedTag] = useState('All')

  const handleToggle = (id) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const handleFbToggle = (id) => {
    setExpandedFbId(expandedFbId === id ? null : id)
  }

  const expandedCollection = data.collections.find((c) => c.id === expandedId)
  const visibleFacebookLinks = facebookLinks.filter((link) => link.visible !== false)

  const categories = [
    'All',
    ...new Set(visibleFacebookLinks.map((link) => link.category).filter(Boolean)),
  ]

  const tags = [
    'All',
    ...new Set(
      visibleFacebookLinks.flatMap((link) =>
        Array.isArray(link.tags)
          ? link.tags
          : String(link.tags || '')
              .split(/[|,]/)
              .map((tag) => tag.trim())
              .filter(Boolean)
      )
    ),
  ]

  const filteredFacebookLinks = visibleFacebookLinks.filter((link) => {
    const categoryOk = selectedCategory === 'All' || link.category === selectedCategory
    const linkTags = Array.isArray(link.tags)
      ? link.tags
      : String(link.tags || '')
          .split(/[|,]/)
          .map((tag) => tag.trim())
          .filter(Boolean)
    const tagOk = selectedTag === 'All' || linkTags.includes(selectedTag)
    return categoryOk && tagOk
  })

  const expandedFbPost = filteredFacebookLinks.find((link) => link.id === expandedFbId)

  return (
    <div className="sections-container">
      <div className="section-heading">Collections</div>
      <div className="section-subheading">Curated series of bhajans and pravachans</div>
      <div className="collections-grid">
        {data.collections.map((col, i) => (
          <CollectionCardButton
            key={col.id}
            collection={col}
            isExpanded={expandedId === col.id}
            onToggle={() => handleToggle(col.id)}
            index={i}
          />
        ))}
      </div>
      {expandedCollection && (
        <CollectionExpanded
          key={expandedCollection.id}
          collection={expandedCollection}
        />
      )}

      {data.playlists.length > 0 && (
        <div className="playlists-section">
          <div className="section-heading">More Playlists</div>
          <div className="section-subheading">Individual devotional playlists</div>
          <div className="playlists-grid">
            {data.playlists.map((p, i) => (
              <Card key={p.id} playlist={p} index={i} />
            ))}
          </div>
        </div>
      )}

      {visibleFacebookLinks.length > 0 && (
        <div className="playlists-section">
          <div className="section-heading">Facebook Updates</div>
          <div className="section-subheading">Posts and replies by Purushottam Bhaiya</div>
          <div className="facebook-filters">
            <label className="facebook-filter">
              <span>Category</span>
              <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="facebook-filter">
              <span>Tag</span>
              <select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)}>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="playlists-grid">
            {filteredFacebookLinks.map((link, i) => (
              <Card
                key={link.id}
                playlist={link}
                index={i}
                ctaLabel="View"
                onClick={() => handleFbToggle(link.id)}
              />
            ))}
          </div>
          {expandedFbPost && (
            <FacebookPostExpanded
              key={expandedFbPost.id}
              post={expandedFbPost}
              onClose={() => setExpandedFbId(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Test the expand/collapse behavior**

```bash
npm run dev
```

Open the site. In the "Facebook Updates" section, click a card. It should expand below the grid showing the post screenshot, comment screenshots (if any), and an "Open on Facebook" link. Click the X button or the same card again to collapse.

- [ ] **Step 3: Commit**

```bash
git add src/components/PlaylistSections.jsx
git commit -m "feat: wire up Facebook post expand/collapse with inline detail view"
```

---

### Task 10: End-to-End Verification

- [ ] **Step 1: Run a full pipeline test with real data**

```bash
cd "/Users/tasharma/Downloads/Bhaiya Website/Bhaavamritdhaara-Purushottam-Bhaiya-Dwara"
npm run facebook:all
```

Expected: Browser opens → logs in (or reuses session) → scrolls profile collecting all URLs → visits each post and screenshots it → finds Purushottam Sharma's comments and screenshots them → updates CSV and JSON.

- [ ] **Step 2: Verify the website displays the new data**

```bash
npm run dev
```

Open the site. The "Facebook Updates" section should show cards with real thumbnails. Click one — the expanded view should show the post screenshot and any comment screenshots. "Open on Facebook" should open the original post.

- [ ] **Step 3: Test on mobile viewport**

In the browser dev tools, toggle mobile view (375px width). Verify the expanded view and filters are usable on a small screen.

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 5: Final commit with all remaining changes**

```bash
git add -A
git commit -m "feat: complete Facebook post screenshot pipeline and expanded view"
```
