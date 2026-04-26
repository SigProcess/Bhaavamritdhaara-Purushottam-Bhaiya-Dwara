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

// Phase 2 and Phase 3 will be added in subsequent tasks

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
