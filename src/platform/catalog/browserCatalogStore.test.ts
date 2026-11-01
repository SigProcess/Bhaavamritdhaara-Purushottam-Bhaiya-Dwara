import { describe, expect, it } from 'vitest'
import { createBrowserCatalogStore } from './browserCatalogStore'
import type { StoredCatalogVersion } from './catalogRepository'

const version = (sequence: number): StoredCatalogVersion => ({
  sequence,
  catalogSha256: 'a'.repeat(64),
  catalog: {},
  catalogBytes: new Uint8Array(),
  assets: {},
})

describe('createBrowserCatalogStore fallback', () => {
  it('preserves atomic stage/commit ordering when IndexedDB is unavailable', async () => {
    const store = createBrowserCatalogStore(undefined)
    await store.stage(version(1))
    await expect(store.readCompleted()).resolves.toEqual([])
    await store.commit(1)
    await store.stage(version(2))
    await store.commit(2)

    await expect(store.readCompleted()).resolves.toEqual([version(2), version(1)])
    await store.prune([1, 2])
    await expect(store.readCompleted()).resolves.toEqual([version(2)])
  })
})
