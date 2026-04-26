import fs from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const csvPath = path.join(rootDir, 'assets/facebook-posts/facebook-posts.csv')
const rawDir = path.join(rootDir, 'assets/facebook-posts/raw')
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])

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

async function listRawImages() {
  const files = await fs.readdir(rawDir)
  return files
    .filter((file) => allowedExtensions.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
}

async function existsInRaw(fileName) {
  if (!fileName) return false
  try {
    await fs.access(path.join(rawDir, fileName))
    return true
  } catch {
    return false
  }
}

function findIdBasedMatch(fileNames, id) {
  const prefix = `${id}.`.toLowerCase()
  return fileNames.find((name) => name.toLowerCase().startsWith(prefix)) || null
}

async function main() {
  const rawCsv = await fs.readFile(csvPath, 'utf8')
  const { headers, rows } = parseCsv(rawCsv)
  const rawFiles = await listRawImages()

  const used = new Set()
  for (const row of rows) {
    if (row.thumbnail_file && (await existsInRaw(row.thumbnail_file))) {
      used.add(row.thumbnail_file)
    }
  }

  const updates = []

  for (const row of rows) {
    const hasValidCurrent = row.thumbnail_file && (await existsInRaw(row.thumbnail_file))
    if (hasValidCurrent) continue

    const idMatch = findIdBasedMatch(rawFiles, row.id || '')
    if (idMatch && !used.has(idMatch)) {
      row.thumbnail_file = idMatch
      used.add(idMatch)
      updates.push(`${row.id} -> ${idMatch} (id match)`)
    }
  }

  const unassignedFiles = rawFiles.filter((file) => !used.has(file))
  for (const row of rows) {
    const hasValidCurrent = row.thumbnail_file && (await existsInRaw(row.thumbnail_file))
    if (hasValidCurrent) continue

    const next = unassignedFiles.shift()
    if (!next) break

    row.thumbnail_file = next
    used.add(next)
    updates.push(`${row.id} -> ${next} (auto-assigned)`)
  }

  const output = [
    toCsvLine(headers),
    ...rows.map((row) => toCsvLine(headers.map((header) => row[header] || ''))),
  ].join('\n') + '\n'

  await fs.writeFile(csvPath, output, 'utf8')

  if (updates.length === 0) {
    console.log('No CSV thumbnail filename updates were needed.')
    return
  }

  console.log('Updated CSV thumbnail_file values:')
  updates.forEach((msg) => console.log(`- ${msg}`))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
