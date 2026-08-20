import sharp from 'sharp'
import path from 'path'
import { mkdir } from 'fs/promises'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'public', 'app-icon.jpg')
const OUT = path.join(ROOT, 'public', 'icons')
const ANDROID_RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

const SIZES = [192, 512]
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 }

// Android launcher/splash assets, kept at the sizes bubblewrap generated.
const LAUNCHER_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const MASKABLE_SIZES = { mdpi: 82, hdpi: 123, xhdpi: 164, xxhdpi: 246, xxxhdpi: 328 }
const SPLASH_SIZES = { mdpi: 300, hdpi: 450, xhdpi: 600, xxhdpi: 900, xxxhdpi: 1200 }

// The source image is already framed (rounded card with a circular portrait
// inside) and its content sits within the maskable safe zone, so it only needs
// resizing and flattening onto an opaque background.
function render(size) {
  return sharp(SOURCE)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .flatten({ background: BACKGROUND })
    .png()
    .toBuffer()
}

async function main() {
  await mkdir(OUT, { recursive: true })

  for (const size of SIZES) {
    const icon = await render(size)
    await sharp(icon).toFile(path.join(OUT, `icon-${size}.png`))
    await sharp(icon).toFile(path.join(OUT, `icon-maskable-${size}.png`))
    console.log(`Created icon-${size}.png and icon-maskable-${size}.png`)
  }

  for (const [density, size] of Object.entries(LAUNCHER_SIZES)) {
    const icon = await render(size)
    await sharp(icon).toFile(path.join(ANDROID_RES, `mipmap-${density}`, 'ic_launcher.png'))
    console.log(`Created mipmap-${density}/ic_launcher.png`)
  }

  for (const [density, size] of Object.entries(MASKABLE_SIZES)) {
    const icon = await render(size)
    await sharp(icon).toFile(path.join(ANDROID_RES, `mipmap-${density}`, 'ic_maskable.png'))
    console.log(`Created mipmap-${density}/ic_maskable.png`)
  }

  for (const [density, size] of Object.entries(SPLASH_SIZES)) {
    const icon = await render(size)
    await sharp(icon).toFile(path.join(ANDROID_RES, `drawable-${density}`, 'splash.png'))
    console.log(`Created drawable-${density}/splash.png`)
  }

  console.log('All icons generated.')
}

main().catch(console.error)
