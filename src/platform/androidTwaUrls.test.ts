import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const manifestUrl = new URL('../../android/twa-manifest.json', import.meta.url)
const stringsUrl = new URL(
  '../../android/app/src/main/res/values/strings.xml',
  import.meta.url,
)

describe('Android TWA URL compatibility', () => {
  it('retains the deployed origin, launch scope, icons, and web manifest URLs', async () => {
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))
    expect(manifest).toMatchObject({
      host: 'purushottambhaiya.netlify.app',
      startUrl: '/',
      fullScopeUrl: 'https://purushottambhaiya.netlify.app/',
      iconUrl: 'https://purushottambhaiya.netlify.app/icons/icon-512.png',
      maskableIconUrl:
        'https://purushottambhaiya.netlify.app/icons/icon-maskable-512.png',
      webManifestUrl:
        'https://purushottambhaiya.netlify.app/manifest.webmanifest',
    })
    expect(await readFile(stringsUrl, 'utf8')).toContain(
      '\\"site\\": \\"https://purushottambhaiya.netlify.app\\"',
    )
  })
})
