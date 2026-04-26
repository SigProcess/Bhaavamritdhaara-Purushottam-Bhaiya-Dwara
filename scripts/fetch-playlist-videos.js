import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'

const rootDir = process.cwd()
const playlistsPath = path.join(rootDir, 'src/data/playlists.json')
const outputPath = path.join(rootDir, 'src/data/playlistVideos.json')

const force = process.argv.includes('--force')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function getPlaylistId(url) {
  try {
    return new URL(url).searchParams.get('list')
  } catch {
    return null
  }
}

function fetchWithYtDlp(playlistId) {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`
  return new Promise((resolve, reject) => {
    execFile(
      'yt-dlp',
      ['--flat-playlist', '--print', 'id', '--print', 'title', url],
      { timeout: 60000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message))
          return
        }
        const lines = stdout.trim().split('\n').filter(Boolean)
        const videos = []
        for (let i = 0; i < lines.length - 1; i += 2) {
          videos.push({ id: lines[i].trim(), title: lines[i + 1].trim() })
        }
        resolve(videos)
      }
    )
  })
}

async function main() {
  const playlists = await readJson(playlistsPath)
  if (!playlists) {
    console.error('Could not read playlists.json')
    process.exitCode = 1
    return
  }

  const allPlaylists = [
    ...playlists.collections.flatMap((c) => c.playlists),
    ...playlists.playlists,
  ]

  const uniqueIds = new Map()
  for (const p of allPlaylists) {
    const pid = getPlaylistId(p.url)
    if (pid && !uniqueIds.has(pid)) {
      uniqueIds.set(pid, p.title)
    }
  }

  console.log(`Found ${uniqueIds.size} unique playlists.`)

  const existing = (await readJson(outputPath)) || {}
  let fetched = 0
  let skipped = 0
  let failed = 0

  for (const [pid, title] of uniqueIds) {
    if (!force && existing[pid] && existing[pid].videos.length > 0) {
      skipped++
      continue
    }

    console.log(`[${fetched + skipped + failed + 1}/${uniqueIds.size}] ${title}`)

    try {
      const videos = await fetchWithYtDlp(pid)
      existing[pid] = {
        fetchedAt: new Date().toISOString(),
        videos,
      }
      console.log(`  -> ${videos.length} videos`)
      fetched++
    } catch (err) {
      console.log(`  -> ERROR: ${err.message}`)
      existing[pid] = {
        fetchedAt: new Date().toISOString(),
        videos: [],
        error: err.message,
      }
      failed++
    }

    await writeJson(outputPath, existing)
    await sleep(1000)
  }

  console.log(`\nDone. Fetched: ${fetched}, Skipped: ${skipped}, Failed: ${failed}`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exitCode = 1
})
