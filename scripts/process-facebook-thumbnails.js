import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const rootDir = process.cwd()
const csvPath = path.join(rootDir, 'assets/facebook-posts/facebook-posts.csv')
const inputDir = path.join(rootDir, 'assets/facebook-posts/raw')
const outputDir = path.join(rootDir, 'public/facebook-posts/thumbs')

const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp']

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
    return []
  }

  const headers = parseCsvLine(lines[0])

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    const row = {}
    headers.forEach((header, i) => {
      row[header] = cells[i] || ''
    })
    return row
  })
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function findInputImageById(id) {
  for (const ext of allowedExtensions) {
    const candidate = path.join(inputDir, `${id}${ext}`)
    if (await fileExists(candidate)) {
      return candidate
    }
  }
  return null
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true })

  const rawCsv = await fs.readFile(csvPath, 'utf8')
  const rows = parseCsv(rawCsv)

  let generatedCount = 0
  const missing = []

  await Promise.all(
    rows.map(async (row) => {
      const thumbnailFile = row.thumbnail_file
      if (!thumbnailFile) {
        missing.push(`${row.id} (missing thumbnail_file in CSV)`)
        return
      }

      let inputImage = path.join(inputDir, thumbnailFile)
      const namedFileExists = await fileExists(inputImage)
      if (!namedFileExists) {
        // Backward-compatible fallback for old id-based files.
        const fallback = await findInputImageById(row.id)
        if (fallback) {
          inputImage = fallback
        } else {
          inputImage = ''
        }
      }

      if (!inputImage) {
        missing.push(`${row.id} (${thumbnailFile})`)
        return
      }

      const ext = path.extname(thumbnailFile).toLowerCase()
      const outputName = thumbnailFile
      const outputPath = path.join(outputDir, outputName)

      let pipeline = sharp(inputImage).resize(1200, 675, { fit: 'cover', position: 'center' })
      if (ext === '.jpg' || ext === '.jpeg') {
        pipeline = pipeline.jpeg({ quality: 82, mozjpeg: true })
      } else if (ext === '.png') {
        pipeline = pipeline.png({ compressionLevel: 9 })
      } else if (ext === '.webp') {
        pipeline = pipeline.webp({ quality: 82 })
      }

      await pipeline.toFile(outputPath)

      generatedCount += 1
    })
  )

  console.log(`Generated thumbnails: ${generatedCount}`)

  if (missing.length > 0) {
    console.log('Missing source images:')
    for (const item of missing) {
      console.log(`- ${item}`)
    }
    console.log(`Drop files in ${path.relative(rootDir, inputDir)} using the exact thumbnail_file names from CSV, then rerun.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
