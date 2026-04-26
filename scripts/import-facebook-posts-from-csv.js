import fs from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const csvPath = path.join(rootDir, 'assets/facebook-posts/facebook-posts.csv')
const outputJsonPath = path.join(rootDir, 'src/data/facebookLinks.json')
const thumbsDir = path.join(rootDir, 'public/facebook-posts/thumbs')
const commentsDir = path.join(rootDir, 'public/facebook-posts/comments')

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
  return result.map((value) => value.trim())
}

function parseCsv(rawCsv) {
  const lines = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    throw new Error('CSV must include a header and at least one data row.')
  }

  const headers = parseCsvLine(lines[0])

  for (const col of requiredHeaders) {
    if (!headers.includes(col)) {
      throw new Error(`Missing required column: ${col}`)
    }
  }

  return lines.slice(1).map((line, idx) => {
    const cells = parseCsvLine(line)
    if (cells.length !== headers.length) {
      throw new Error(`Row ${idx + 2} has ${cells.length} columns; expected ${headers.length}.`)
    }

    const row = {}
    headers.forEach((header, i) => {
      row[header] = cells[i]
    })
    return row
  })
}

function parseVisible(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return ['yes', 'true', '1', 'y'].includes(normalized)
}

function parseTags(value) {
  return String(value || '')
    .split(/[|,]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function main() {
  const rawCsv = await fs.readFile(csvPath, 'utf8')
  const rows = parseCsv(rawCsv)

  const warnings = []

  const links = await Promise.all(
    rows.map(async (row) => {
      const sortOrder = Number.parseInt(row.sort_order, 10)
      const thumbFile = row.thumbnail_file

      const thumbPath = thumbFile ? `/facebook-posts/thumbs/${thumbFile}` : ''

      if (thumbFile) {
        const fullThumbPath = path.join(thumbsDir, thumbFile)
        if (!(await fileExists(fullThumbPath))) {
          warnings.push(`Missing thumbnail: ${thumbFile}`)
        }
      }

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
    })
  )

  links.sort((a, b) => a.sortOrder - b.sortOrder)

  await fs.writeFile(outputJsonPath, `${JSON.stringify(links, null, 2)}\n`, 'utf8')

  console.log(`Imported rows: ${links.length}`)
  if (warnings.length > 0) {
    console.log('Warnings:')
    warnings.forEach((msg) => console.log(`- ${msg}`))
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
