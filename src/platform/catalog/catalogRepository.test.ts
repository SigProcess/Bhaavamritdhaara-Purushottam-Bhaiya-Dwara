import { describe, expect, it, vi } from 'vitest'

import type { Catalog, CatalogVersionId, RequestId } from '../../domain/contracts'
import { createCatalogFixture } from '../../test-support/fixtures/catalogs'
import {
  catalogContentProjection,
  createCatalogRepository,
  sha256Hex,
  stableCatalogJson,
  type CatalogStore,
  type StoredCatalogVersion,
} from './catalogRepository'

const encoder = new TextEncoder()

class MemoryCatalogStore implements CatalogStore {
  completed = new Map<number, StoredCatalogVersion>()
  staged = new Map<number, StoredCatalogVersion>()
  activeSequence?: number
  commits: number[] = []
  pruned: number[] = []

  async readCompleted() {
    return [...this.completed.values()].sort((left, right) => {
      if (left.sequence === this.activeSequence) return -1
      if (right.sequence === this.activeSequence) return 1
      return right.sequence - left.sequence
    })
  }

  async stage(version: StoredCatalogVersion) {
    this.staged.set(version.sequence, structuredClone(version))
  }

  async commit(sequence: number) {
    const version = this.staged.get(sequence)
    if (!version) throw new Error('missing stage')
    this.completed.set(sequence, version)
    this.staged.delete(sequence)
    this.activeSequence = sequence
    this.commits.push(sequence)
  }

  async discard(sequence: number) {
    this.staged.delete(sequence)
  }

  async prune(sequences: readonly number[]) {
    this.pruned.push(...sequences)
    for (const sequence of sequences) {
      if (sequence !== this.activeSequence) this.completed.delete(sequence)
    }
  }
}

const assetBytes = (catalog: Catalog): Record<string, Uint8Array> =>
  Object.fromEntries(catalog.assets.map((asset) => [
    asset.id,
    asset.mediaType === 'application/pdf'
      ? encoder.encode(`%PDF-${asset.id}`)
      : encoder.encode(`image-${asset.id}`),
  ]))

async function validCatalog(version: string): Promise<{
  catalog: Catalog
  bytes: Uint8Array
  assets: Record<string, Uint8Array>
}> {
  const source: any = createCatalogFixture({
    catalogVersion: version as CatalogVersionId,
  })
  const bytesById = assetBytes(source)
  source.assets = source.assets.map((asset: Catalog['assets'][number]) => ({
    ...asset,
    path: `assets/${asset.id}${asset.mediaType === 'application/pdf' ? '.pdf' : '.jpg'}`,
    availability: 'packaged',
    byteLength: bytesById[asset.id].byteLength,
    sha256: '',
  }))
  for (const asset of source.assets) asset.sha256 = await sha256Hex(bytesById[asset.id])
  source.contentHash = await sha256Hex(encoder.encode(stableCatalogJson(catalogContentProjection(source))))
  const bytes = encoder.encode(JSON.stringify(source))
  return { catalog: source, bytes, assets: bytesById }
}

const response = (bytes: Uint8Array, status = 200) =>
  new Response(Uint8Array.from(bytes).buffer, { status })

const jsonResponse = (value: unknown) =>
  response(encoder.encode(JSON.stringify(value)))

async function updateFixture(sequence = 2, version = 'fixture-2') {
  const candidate = await validCatalog(version)
  const descriptor = {
    schemaVersion: 1,
    sequence,
    catalogVersion: version,
    catalogUrl: `https://updates.test/catalogs/${sequence}/catalog.json`,
    catalogSha256: await sha256Hex(candidate.bytes),
  }
  return { candidate, descriptor }
}

function transportFor(
  packaged: Catalog,
  descriptor: unknown,
  candidate?: Awaited<ReturnType<typeof validCatalog>>,
) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url === '/catalog.json') return jsonResponse(packaged)
    if (url === 'https://updates.test/catalog-version.json') return jsonResponse(descriptor)
    if (url.includes('/catalog.json') && candidate) return response(candidate.bytes)
    if (candidate) {
      const asset = candidate.catalog.assets.find(({ path }) => url.endsWith(path))
      if (asset) return response(candidate.assets[asset.id])
    }
    return response(encoder.encode('not found'), 404)
  }) as typeof fetch
}

const makeRepository = (
  store: MemoryCatalogStore,
  fetcher: typeof fetch,
  packagedSequence = 1,
) => createCatalogRepository({
  descriptorUrl: 'https://updates.test/catalog-version.json',
  allowedHosts: ['updates.test'],
  packagedSequence,
  store,
  fetch: fetcher,
  createRequestId: () => 'catalog-request' as RequestId,
})

const storedVersion = async (
  sequence: number,
  value: Awaited<ReturnType<typeof validCatalog>>,
): Promise<StoredCatalogVersion> => ({
  sequence,
  catalogSha256: await sha256Hex(value.bytes),
  catalog: value.catalog,
  catalogBytes: value.bytes,
  assets: value.assets,
})

describe('catalog repository', () => {
  it('loads and freezes a packaged catalog only after schema and content-hash validation', async () => {
    const packaged = await validCatalog('packaged')
    const repository = makeRepository(
      new MemoryCatalogStore(),
      transportFor(packaged.catalog, {}),
    )

    const loaded = await repository.loadPackaged()

    expect(loaded).toEqual(packaged.catalog)
    expect(Object.isFrozen(loaded)).toBe(true)
    expect(Object.isFrozen(loaded.assets)).toBe(true)
  })

  it('rejects a packaged catalog whose declared content hash is stale', async () => {
    const packaged = await validCatalog('packaged')
    ;(packaged.catalog as unknown as { contentHash: string }).contentHash = '0'.repeat(64)
    const repository = makeRepository(
      new MemoryCatalogStore(),
      transportFor(packaged.catalog, {}),
    )

    await expect(repository.loadPackaged()).rejects.toMatchObject({
      code: 'CATALOG_PACKAGED_INVALID',
    })
  })

  it('stages every verified asset before atomically activating an update', async () => {
    const packaged = await validCatalog('packaged')
    const { candidate, descriptor } = await updateFixture()
    const store = new MemoryCatalogStore()
    const repository = makeRepository(store, transportFor(packaged.catalog, descriptor, candidate))
    await repository.loadPackaged()

    const result = await repository.checkForUpdate(new AbortController().signal)

    expect(result).toMatchObject({ status: 'updated', catalog: { catalogVersion: 'fixture-2' } })
    expect(store.commits).toEqual([2])
    expect(store.activeSequence).toBe(2)
    expect(store.staged.size).toBe(0)
    expect(store.completed.get(2)?.assets).toHaveProperty('asset-book-pdf')
  })

  it('keeps the current catalog active when a staged asset fails integrity validation', async () => {
    const packaged = await validCatalog('packaged')
    const { candidate, descriptor } = await updateFixture()
    candidate.assets[candidate.catalog.assets[0].id] = encoder.encode('tampered')
    const store = new MemoryCatalogStore()
    const repository = makeRepository(store, transportFor(packaged.catalog, descriptor, candidate))
    await repository.loadPackaged()

    const result = await repository.checkForUpdate(new AbortController().signal)

    expect(result).toEqual({
      status: 'failed',
      requestId: 'catalog-request',
      errorCode: 'CATALOG_UPDATE_INVALID',
    })
    expect(store.commits).toEqual([])
    expect(store.activeSequence).toBeUndefined()
    expect(store.staged.size).toBe(0)
  })

  it('rejects descriptor, catalog, and asset URLs outside the exact HTTPS host allowlist', async () => {
    const packaged = await validCatalog('packaged')
    const { candidate, descriptor } = await updateFixture()
    const store = new MemoryCatalogStore()
    const repository = makeRepository(store, transportFor(packaged.catalog, {
      ...descriptor,
      catalogUrl: 'https://evil.test/catalog.json',
    }, candidate))
    await repository.loadPackaged()

    await expect(repository.checkForUpdate(new AbortController().signal)).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'CATALOG_UPDATE_INVALID',
    })
    expect(store.commits).toEqual([])
  })

  it('rejects replayed or non-monotonic versions without downloading their catalog', async () => {
    const packaged = await validCatalog('packaged')
    const { candidate, descriptor } = await updateFixture(1, 'same-sequence')
    const fetcher = transportFor(packaged.catalog, descriptor, candidate)
    const repository = makeRepository(new MemoryCatalogStore(), fetcher)
    await repository.loadPackaged()

    const result = await repository.checkForUpdate(new AbortController().signal)

    expect(result).toMatchObject({ status: 'up-to-date', catalog: { catalogVersion: 'packaged' } })
    expect(vi.mocked(fetcher).mock.calls.some(([url]) => String(url).includes('/catalogs/'))).toBe(false)
  })

  it('falls back from a corrupt active record to the retained completed version', async () => {
    const packaged = await validCatalog('packaged')
    const retained = await validCatalog('retained')
    const corrupt = await validCatalog('corrupt')
    corrupt.assets[corrupt.catalog.assets[0].id] = encoder.encode('corrupt')
    const store = new MemoryCatalogStore()
    store.completed.set(2, await storedVersion(2, retained))
    store.completed.set(3, await storedVersion(3, corrupt))
    store.activeSequence = 3
    const repository = makeRepository(store, transportFor(packaged.catalog, {}))

    const loaded = await repository.loadLastKnownGood()

    expect(loaded?.catalogVersion).toBe('retained')
  })

  it('retains the active and previous completed versions while pruning older versions', async () => {
    const packaged = await validCatalog('packaged')
    const older = await validCatalog('older')
    const previous = await validCatalog('previous')
    const { candidate, descriptor } = await updateFixture(4, 'newest')
    const store = new MemoryCatalogStore()
    store.completed.set(2, await storedVersion(2, older))
    store.completed.set(3, await storedVersion(3, previous))
    store.activeSequence = 3
    const repository = makeRepository(store, transportFor(packaged.catalog, descriptor, candidate))
    await repository.loadPackaged()
    await repository.loadLastKnownGood()

    await repository.checkForUpdate(new AbortController().signal)

    expect(store.pruned).toEqual([2])
    expect([...store.completed.keys()].sort()).toEqual([3, 4])
  })

  it.each([
    ['descriptor schema', (descriptor: Record<string, unknown>) => { descriptor.schemaVersion = 2 }],
    ['catalog response hash', (descriptor: Record<string, unknown>) => { descriptor.catalogSha256 = '0'.repeat(64) }],
    ['catalog version', (descriptor: Record<string, unknown>) => { descriptor.catalogVersion = 'different-version' }],
  ])('rejects an invalid %s before activation', async (_label, mutate) => {
    const packaged = await validCatalog('packaged')
    const { candidate, descriptor } = await updateFixture()
    mutate(descriptor as unknown as Record<string, unknown>)
    const store = new MemoryCatalogStore()
    const repository = makeRepository(store, transportFor(packaged.catalog, descriptor, candidate))
    await repository.loadPackaged()

    await expect(repository.checkForUpdate(new AbortController().signal)).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'CATALOG_UPDATE_INVALID',
    })
    expect(store.commits).toEqual([])
  })

  it('discards staging and retains the prior active catalog when commit fails', async () => {
    const packaged = await validCatalog('packaged')
    const previous = await validCatalog('previous')
    const { candidate, descriptor } = await updateFixture(3, 'candidate')
    const store = new MemoryCatalogStore()
    store.completed.set(2, await storedVersion(2, previous))
    store.activeSequence = 2
    store.commit = async () => { throw new Error('commit failed') }
    const repository = makeRepository(store, transportFor(packaged.catalog, descriptor, candidate))
    await repository.loadPackaged()
    await repository.loadLastKnownGood()

    const result = await repository.checkForUpdate(new AbortController().signal)

    expect(result).toMatchObject({ status: 'failed', errorCode: 'CATALOG_UPDATE_INVALID' })
    expect(store.activeSequence).toBe(2)
    expect(store.completed.get(2)?.catalog).toMatchObject({ catalogVersion: 'previous' })
    expect(store.staged.size).toBe(0)
  })

  it('coalesces concurrent update checks into one staged activation', async () => {
    const packaged = await validCatalog('packaged')
    const { candidate, descriptor } = await updateFixture()
    const store = new MemoryCatalogStore()
    const fetcher = transportFor(packaged.catalog, descriptor, candidate)
    const repository = makeRepository(store, fetcher)
    await repository.loadPackaged()
    const signal = new AbortController().signal

    const [first, second] = await Promise.all([
      repository.checkForUpdate(signal),
      repository.checkForUpdate(signal),
    ])

    expect(first).toEqual(second)
    expect(store.commits).toEqual([2])
    expect(vi.mocked(fetcher).mock.calls.filter(([url]) => String(url).endsWith('catalog-version.json'))).toHaveLength(1)
  })
})
