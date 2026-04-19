import sharp from 'sharp'
import path from 'path'
import { mkdir } from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'public', 'bhaiya-portrait.jpg')
const OUT = path.join(ROOT, 'public', 'icons')

const SIZES = [192, 512]
const BORDER_RATIO = 0.06
const MASKABLE_PADDING_RATIO = 0.2

async function createCircularIcon(size) {
  const border = Math.round(size * BORDER_RATIO)
  const inner = size - border * 2
  const radius = inner / 2

  const circularMask = Buffer.from(
    `<svg width="${inner}" height="${inner}">
      <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
    </svg>`
  )

  const cropped = await sharp(SOURCE)
    .resize(inner, inner, { fit: 'cover', position: 'centre' })
    .composite([{ input: circularMask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  const gradientRing = Buffer.from(
    `<svg width="${size}" height="${size}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#E8872B"/>
          <stop offset="100%" stop-color="#B83342"/>
        </linearGradient>
      </defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="url(#g)"/>
    </svg>`
  )

  return sharp(gradientRing)
    .composite([{ input: cropped, top: border, left: border }])
    .png()
    .toBuffer()
}

async function createMaskableIcon(size) {
  const padding = Math.round(size * MASKABLE_PADDING_RATIO)
  const innerSize = size - padding * 2
  const border = Math.round(innerSize * BORDER_RATIO)
  const photoSize = innerSize - border * 2
  const radius = photoSize / 2

  const circularMask = Buffer.from(
    `<svg width="${photoSize}" height="${photoSize}">
      <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
    </svg>`
  )

  const cropped = await sharp(SOURCE)
    .resize(photoSize, photoSize, { fit: 'cover', position: 'centre' })
    .composite([{ input: circularMask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  const gradientCircle = Buffer.from(
    `<svg width="${innerSize}" height="${innerSize}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#E8872B"/>
          <stop offset="100%" stop-color="#B83342"/>
        </linearGradient>
      </defs>
      <circle cx="${innerSize / 2}" cy="${innerSize / 2}" r="${innerSize / 2}" fill="url(#g)"/>
    </svg>`
  )

  const innerComposite = await sharp(gradientCircle)
    .composite([{ input: cropped, top: border, left: border }])
    .png()
    .toBuffer()

  const bg = Buffer.from(
    `<svg width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="#FAF6F0"/>
    </svg>`
  )

  return sharp(bg)
    .composite([{ input: innerComposite, top: padding, left: padding }])
    .png()
    .toBuffer()
}

async function main() {
  await mkdir(OUT, { recursive: true })

  for (const size of SIZES) {
    const icon = await createCircularIcon(size)
    await sharp(icon).toFile(path.join(OUT, `icon-${size}.png`))
    console.log(`Created icon-${size}.png`)

    const maskable = await createMaskableIcon(size)
    await sharp(maskable).toFile(path.join(OUT, `icon-maskable-${size}.png`))
    console.log(`Created icon-maskable-${size}.png`)
  }

  console.log('All icons generated.')
}

main().catch(console.error)
