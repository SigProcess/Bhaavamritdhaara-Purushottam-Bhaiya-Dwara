import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Extracts Facebook post URLs and auto-populates CSV rows.
 * 
 * Usage:
 *   echo "https://www.facebook.com/.../posts/..." > facebook-urls.txt
 *   node scripts/extract-facebook-post-urls.js facebook-urls.txt
 * 
 * Generates new CSV rows with post_link and auto-incremented id.
 */

const rootDir = process.cwd()
const csvPath = path.join(rootDir, 'assets/facebook-posts/facebook-posts.csv')

function parsePostId(url) {
  // Match /posts/123456789 or /share?u=...&id=123
  const postMatch = url.match(/\/posts\/(\d+)/)
  if (postMatch) return postMatch[1]

  const shareMatch = url.match(/[?&]id=(\d+)/)
  if (shareMatch) return shareMatch[1]

  // Fallback: use timestamp or random
  return Math.floor(Date.now() / 1000).toString()
}

function normalizeUrl(url) {
  // Remove query params and fragments, keep just the share URL
  url = url.trim()
  if (!url.startsWith('http')) url = `https://facebook.com/${url}`
  return url.split('?')[0].split('#')[0]
}

function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    const next = line[i + 1]

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
      continue
    }

    current += ch
  }

  result.push(current)
  return result.map((v) => v.trim())
}

function parseCsv(rawCsv) {
  const lines = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    throw new Error('CSV must include header and at least one row.')
  }

  const headers = parseCsvLine(lines[0])
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    const row = {}
    headers.forEach((header, i) => {
      row[header] = cells[i] || ''
    })
    return row
  })

  return { headers, rows }
}

function toCsvLine(values) {
  return values
    .map((value) => {
      const str = String(value ?? '')
      if (/[,"\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    })
    .join(',')
}

async function main() {
  const inputFile = process.argv[2]
  if (!inputFile) {
    console.error('Usage: node scripts/extract-facebook-post-urls.js <urls-file>')
    console.error('  <urls-file>: Text file with one Facebook URL per line')
    process.exitCode = 1
    return
  }

  const inputPath = path.resolve(inputFile)
  const urls = (await fs.readFile(inputPath, 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))

  if (urls.length === 0) {
    console.log('No URLs found in input file.')
    return
  }

  const rawCsv = await fs.readFile(csvPath, 'utf8')
  const { headers, rows } = parseCsv(rawCsv)

  const existingLinks = new Set(rows.map((r) => r.post_link))
  let added = 0

  for (const url of urls) {
    const normalized = normalizeUrl(url)
    if (existingLinks.has(normalized)) {
      console.log(`[SKIP] Already exists: ${normalized}`)
      continue
    }

    const postId = parsePostId(normalized)
    const newRow = {}
    headers.forEach((header) => {
      if (header === 'id') newRow[header] = `fb-post-${postId}`
      else if (header === 'post_link') newRow[header] = normalized
      else if (header === 'title') newRow[header] = '(auto) '
      else if (header === 'visible') newRow[header] = 'FALSE'
      else newRow[header] = ''
    })

    rows.push(newRow)
    existingLinks.add(normalized)
    added++
    console.log(`[ADD] ${normalized}`)
  }

  const output = [
    toCsvLine(headers),
    ...rows.map((row) => toCsvLine(headers.map((header) => row[header] || ''))),
  ].join('\n') + '\n'

  await fs.writeFile(csvPath, output, 'utf8')
  console.log(`\nAdded ${added}/${urls.length} URLs to CSV.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
