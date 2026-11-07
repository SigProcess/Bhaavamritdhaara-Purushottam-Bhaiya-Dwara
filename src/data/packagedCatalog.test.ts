import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { validateCatalog } from '../domain/catalog/catalog'

const catalogUrl = new URL('../../public/catalog.json', import.meta.url)

const packagedCatalog = async () => JSON.parse(await readFile(catalogUrl, 'utf8'))

describe('packaged catalog', () => {
  it('satisfies the catalog contract that the running app validates', async () => {
    const catalog = await packagedCatalog()
    expect(() => validateCatalog(catalog)).not.toThrow()
  })

  it('retains a provider video identifier for every shipped video', async () => {
    const catalog = await packagedCatalog()
    const videos = [...catalog.collectionPlaylists, ...catalog.standalonePlaylists]
      .flatMap((playlist: { videos?: ReadonlyArray<{ sourceVideoId?: unknown }> }) =>
        playlist.videos ?? [])

    expect(videos.length).toBeGreaterThan(0)
    expect(videos.filter(({ sourceVideoId }) =>
      typeof sourceVideoId !== 'string' || sourceVideoId.length === 0)).toEqual([])
  })
})
