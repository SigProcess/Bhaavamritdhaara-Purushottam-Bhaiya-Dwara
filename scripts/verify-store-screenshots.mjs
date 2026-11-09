#!/usr/bin/env node
/**
 * Verifies App Store screenshot PNGs against Apple's published specification by reading the PNG
 * container directly, so the check does not depend on sips, ImageMagick, or any other tool being
 * installed.
 *
 * Apple, App Store Connect Help -> Reference -> Screenshot specifications, confirmed 2026-11-09:
 *   - an iPhone-only app must supply at least one screenshot for
 *     "iPhone with Dynamic Island (medium display)", accepted portrait sizes
 *     1179 x 2556 or 1206 x 2622 pixels;
 *   - up to 10 screenshots per device size;
 *   - "Images can't include alpha channels or transparencies."
 * Content was rephrased for compliance with licensing restrictions.
 *
 * Usage: node scripts/verify-store-screenshots.mjs <file-or-directory> [...]
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ACCEPTED_PORTRAIT_SIZES = Object.freeze([
  Object.freeze({ width: 1179, height: 2556 }),
  Object.freeze({ width: 1206, height: 2622 }),
])
const MAX_SCREENSHOTS_PER_SIZE = 10
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const COLOUR_TYPE_NAMES = Object.freeze({
  0: 'grayscale',
  2: 'truecolour',
  3: 'indexed',
  4: 'grayscale+alpha',
  6: 'truecolour+alpha',
})

/** Parses IHDR plus a tRNS scan. Alpha can arrive either as a channel or as a transparency chunk. */
export const inspectPng = (bytes) => {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { ok: false, reason: 'not-a-png' }
  }
  if (bytes.subarray(12, 16).toString('latin1') !== 'IHDR') {
    return { ok: false, reason: 'missing-ihdr' }
  }
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  const bitDepth = bytes[24]
  const colourType = bytes[25]

  let hasTransparencyChunk = false
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString('latin1')
    if (type === 'tRNS') hasTransparencyChunk = true
    if (type === 'IEND') break
    offset += 12 + length
  }

  const hasAlphaChannel = colourType === 4 || colourType === 6
  return {
    ok: true,
    width,
    height,
    bitDepth,
    colourType,
    colourTypeName: COLOUR_TYPE_NAMES[colourType] ?? `unknown(${colourType})`,
    hasAlphaChannel,
    hasTransparencyChunk,
    hasAlpha: hasAlphaChannel || hasTransparencyChunk,
  }
}

export const evaluate = (info) => {
  const problems = []
  if (!info.ok) return [`unreadable PNG (${info.reason})`]
  const sizeAccepted = ACCEPTED_PORTRAIT_SIZES.some(
    (size) => size.width === info.width && size.height === info.height,
  )
  if (!sizeAccepted) {
    const accepted = ACCEPTED_PORTRAIT_SIZES.map((size) => `${size.width}x${size.height}`).join(' or ')
    problems.push(`size ${info.width}x${info.height} is not an accepted iPhone Dynamic Island (medium display) portrait size (${accepted})`)
  }
  if (info.hasAlphaChannel) problems.push(`colour type ${info.colourType} (${info.colourTypeName}) carries an alpha channel`)
  if (info.hasTransparencyChunk) problems.push('tRNS transparency chunk present')
  return problems
}

const collect = async (target) => {
  const info = await stat(target)
  if (info.isFile()) return [target]
  const entries = await readdir(target, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.png')
    .map((entry) => join(target, entry.name))
    .sort()
}

const run = async () => {
  const targets = process.argv.slice(2)
  if (targets.length === 0) {
    console.error('Usage: node scripts/verify-store-screenshots.mjs <file-or-directory> [...]')
    process.exitCode = 1
    return
  }

  const files = []
  for (const target of targets) files.push(...await collect(resolve(target)))
  if (files.length === 0) {
    console.error('No PNG files found.')
    process.exitCode = 1
    return
  }

  let failures = 0
  console.log('App Store screenshot verification')
  console.log('')
  for (const file of files) {
    const info = inspectPng(await readFile(file))
    const problems = evaluate(info)
    const dimensions = info.ok ? `${info.width}x${info.height}` : 'unreadable'
    const alpha = info.ok ? (info.hasAlpha ? 'YES' : 'no') : '?'
    const depth = info.ok ? `${info.bitDepth}-bit ${info.colourTypeName}` : '-'
    console.log(`  [${problems.length === 0 ? 'pass' : 'FAIL'}] ${basename(file)}  ${dimensions}  alpha=${alpha}  ${depth}`)
    for (const problem of problems) {
      failures += 1
      console.log(`         - ${problem}`)
    }
  }

  console.log('')
  console.log(`  ${files.length} PNG(s) checked, ${failures} problem(s).`)
  if (files.length > MAX_SCREENSHOTS_PER_SIZE) {
    console.log(`  NOTE: App Store Connect accepts at most ${MAX_SCREENSHOTS_PER_SIZE} screenshots per device size.`)
  }
  process.exitCode = failures === 0 ? 0 : 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await run()
}
