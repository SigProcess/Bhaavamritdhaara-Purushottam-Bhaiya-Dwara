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
  // Remove stale lock file left by a previous crashed session
  const lockFile = path.join(userDataDir, 'SingletonLock')
  try { await fs.unlink(lockFile) } catch { /* doesn't exist */ }

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

function stripCommentId(url) {
  try {
    const u = new URL(url)
    u.searchParams.delete('comment_id')
    return u.toString()
  } catch {
    return url
  }
}

async function screenshotPost(page, postUrl, postIndex) {
  const postId = `fb-post-${String(postIndex).padStart(3, '0')}`
  const thumbPath = path.join(thumbsDir, `${postId}.jpg`)

  // Strip comment_id so we always land on the main post, not a specific comment
  const cleanUrl = stripCommentId(postUrl)
  const isPhotoUrl = cleanUrl.includes('/photo')

  await page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await randomDelay(3000, 5000)

  // Close any popups/overlays (login nag, cookie consent, etc.)
  // But NOT the close button on the photo viewer or post dialog — those dismiss the content
  for (const label of ['Decline optional cookies', 'Not now']) {
    try {
      const btn = page.locator(`[aria-label="${label}"]`).first()
      if (await btn.isVisible({ timeout: 800 })) {
        await btn.click()
        await randomDelay(300, 600)
      }
    } catch { /* no popup */ }
  }

  // Wait for meaningful content to appear (image or text)
  try {
    await page.locator('img[src*="scontent"], img[data-visualcompletion="media-vc-image"], [dir="auto"]').first().waitFor({ timeout: 10000 })
  } catch {
    console.log(`  [POST] ${postId} SKIPPED: page content did not load`)
    return null
  }

  // Take a viewport screenshot — Facebook layouts vary too much (photo viewer,
  // post dialog, feed post) to reliably target a specific element
  try {
    await page.screenshot({ path: thumbPath, type: 'jpeg', quality: 85 })
    console.log(`  [POST] ${postId} -> ${path.basename(thumbPath)}`)
  } catch (err) {
    console.log(`  [POST] ${postId} FAILED: ${err.message}`)
    return null
  }

  // Extract post title from text content
  let title = ''
  try {
    title = await page.locator('[role="dialog"] [dir="auto"], [role="main"] [dir="auto"]').first().evaluate((el) => el.textContent.trim())
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
      // Check for rate-limiting / CAPTCHA (only match actual block pages, not normal content)
      const isBlocked = await page.evaluate(() => {
        const url = window.location.href
        const title = document.title.toLowerCase()
        return url.includes('/checkpoint/') ||
          title.includes('security check') ||
          title.includes('please try again')
      })
      if (isBlocked) {
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
      const results = await screenshotAllPosts(page)
      console.log(`\nScreenshot phase complete. ${results.length} new posts captured.`)
      await updateDataFiles(results)
    }
  } finally {
    await context.close()
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exitCode = 1
})
