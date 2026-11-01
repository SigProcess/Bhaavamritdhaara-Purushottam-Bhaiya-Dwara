import type {
  AssetRecord,
  Catalog,
  CatalogRepository,
  CatalogUpdateResult,
  RequestId,
} from '../../domain/contracts'
import { validateCatalog } from '../../domain/catalog'

export interface CatalogUpdateDescriptor {
  readonly schemaVersion: 1
  readonly sequence: number
  readonly catalogVersion: string
  readonly catalogUrl: string
  readonly catalogSha256: string
}

export interface StoredCatalogVersion {
  readonly sequence: number
  readonly catalogSha256: string
  readonly catalog: unknown
  readonly catalogBytes: Uint8Array
  readonly assets: Readonly<Record<string, Uint8Array>>
}

export interface CatalogStore {
  /** Active version first, followed by retained completed fallbacks. */
  readCompleted(): Promise<readonly StoredCatalogVersion[]>
  stage(version: StoredCatalogVersion): Promise<void>
  /** The only activation point. Implementations must switch versions atomically. */
  commit(sequence: number): Promise<void>
  discard(sequence: number): Promise<void>
  /** Never receives the active or immediately previous sequence. */
  prune(removableSequences: readonly number[]): Promise<void>
}

export interface CatalogRepositoryOptions {
  readonly packagedUrl?: string
  readonly packagedSequence?: number
  readonly descriptorUrl: string
  readonly allowedHosts: readonly string[]
  readonly store: CatalogStore
  readonly fetch?: typeof globalThis.fetch
  readonly createRequestId?: () => RequestId
}

export class CatalogRepositoryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'CatalogRepositoryError'
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const HASH_PATTERN = /^[a-f0-9]{64}$/

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

export const stableCatalogJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value))

export const catalogContentProjection = (catalog: Catalog) => ({
  collections: catalog.collections,
  collectionPlaylists: catalog.collectionPlaylists,
  standalonePlaylists: catalog.standalonePlaylists,
  bhajans: catalog.bhajans,
  books: catalog.books,
  assets: catalog.assets,
})

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function validateCatalogIntegrity(input: unknown): Promise<Catalog> {
  const catalog = validateCatalog(input)
  const actual = await sha256Hex(encoder.encode(stableCatalogJson(catalogContentProjection(catalog))))
  if (actual !== catalog.contentHash) {
    throw new CatalogRepositoryError('CATALOG_HASH_MISMATCH', 'Catalog content integrity check failed.')
  }
  return catalog
}

const parseJson = (bytes: Uint8Array): unknown => {
  try {
    return JSON.parse(decoder.decode(bytes))
  } catch {
    throw new CatalogRepositoryError('CATALOG_JSON_INVALID', 'Catalog data is not valid JSON.')
  }
}

const parseDescriptor = (input: unknown): CatalogUpdateDescriptor => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CatalogRepositoryError('CATALOG_DESCRIPTOR_INVALID', 'Catalog update descriptor is invalid.')
  }
  const value = input as Record<string, unknown>
  if (
    value.schemaVersion !== 1
    || !Number.isSafeInteger(value.sequence)
    || Number(value.sequence) <= 0
    || typeof value.catalogVersion !== 'string'
    || value.catalogVersion.length === 0
    || typeof value.catalogUrl !== 'string'
    || !HASH_PATTERN.test(String(value.catalogSha256))
  ) {
    throw new CatalogRepositoryError('CATALOG_DESCRIPTOR_INVALID', 'Catalog update descriptor is invalid.')
  }
  return value as unknown as CatalogUpdateDescriptor
}

const validateAllowedUrl = (
  value: string,
  allowedHosts: ReadonlySet<string>,
  base?: string,
): URL => {
  let url: URL
  try {
    url = base ? new URL(value, base) : new URL(value)
  } catch {
    throw new CatalogRepositoryError('CATALOG_HOST_INVALID', 'Catalog update URL is invalid.')
  }
  if (
    url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || !allowedHosts.has(url.host)
  ) {
    throw new CatalogRepositoryError('CATALOG_HOST_INVALID', 'Catalog update URL is not allowed.')
  }
  return url
}

const readResponse = async (response: Response): Promise<Uint8Array> => {
  if (!response.ok) {
    throw new CatalogRepositoryError('CATALOG_HTTP_FAILED', 'Catalog update request failed.')
  }
  return new Uint8Array(await response.arrayBuffer())
}

const verifyAsset = async (asset: AssetRecord, bytes: Uint8Array): Promise<void> => {
  if (bytes.byteLength !== asset.byteLength || await sha256Hex(bytes) !== asset.sha256) {
    throw new CatalogRepositoryError('CATALOG_ASSET_INVALID', 'Catalog asset integrity check failed.')
  }
  if (asset.mediaType === 'application/pdf' && decoder.decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw new CatalogRepositoryError('CATALOG_ASSET_INVALID', 'Catalog document is not a valid PDF.')
  }
}

const defaultRequestId = (): RequestId =>
  `catalog-update-${Date.now()}-${Math.random().toString(36).slice(2)}` as RequestId

/**
 * Creates a repository whose store owns the atomic activation boundary. Remote
 * data remains invisible until the catalog and every referenced asset verify.
 */
export function createCatalogRepository(options: CatalogRepositoryOptions): CatalogRepository {
  const fetcher = options.fetch ?? globalThis.fetch
  const packagedUrl = options.packagedUrl ?? '/catalog.json'
  const packagedSequence = options.packagedSequence ?? 0
  const allowedHosts = new Set(options.allowedHosts)
  const descriptorUrl = validateAllowedUrl(options.descriptorUrl, allowedHosts).href
  const createRequestId = options.createRequestId ?? defaultRequestId

  let packaged: Catalog | undefined
  let active: { sequence: number; catalog: Catalog } | undefined
  let highestSeenSequence = packagedSequence
  let updateInFlight: Promise<CatalogUpdateResult> | undefined

  const current = async (): Promise<{ sequence: number; catalog: Catalog }> => {
    if (!packaged) await repository.loadPackaged()
    if (!active) await repository.loadLastKnownGood()
    return active ?? { sequence: packagedSequence, catalog: packaged as Catalog }
  }

  const loadStored = async (stored: StoredCatalogVersion): Promise<Catalog> => {
    if (!HASH_PATTERN.test(stored.catalogSha256) || await sha256Hex(stored.catalogBytes) !== stored.catalogSha256) {
      throw new CatalogRepositoryError('CATALOG_STORED_INVALID', 'Stored catalog integrity check failed.')
    }
    const catalog = await validateCatalogIntegrity(parseJson(stored.catalogBytes))
    const storedCatalog = validateCatalog(stored.catalog)
    if (
      storedCatalog.catalogVersion !== catalog.catalogVersion
      || storedCatalog.contentHash !== catalog.contentHash
    ) {
      throw new CatalogRepositoryError('CATALOG_STORED_INVALID', 'Stored catalog records disagree.')
    }
    for (const asset of catalog.assets) {
      const bytes = stored.assets[asset.id]
      if (!bytes) throw new CatalogRepositoryError('CATALOG_ASSET_INVALID', 'Stored catalog asset is missing.')
      await verifyAsset(asset, bytes)
    }
    return catalog
  }

  const repository: CatalogRepository = {
    async loadPackaged(): Promise<Catalog> {
      try {
        const response = await fetcher(packagedUrl, { cache: 'no-store' })
        packaged = await validateCatalogIntegrity(parseJson(await readResponse(response)))
        return packaged
      } catch (error) {
        throw new CatalogRepositoryError(
          'CATALOG_PACKAGED_INVALID',
          error instanceof Error ? error.message : 'Packaged catalog could not be loaded.',
        )
      }
    },

    async loadLastKnownGood(): Promise<Catalog | null> {
      const allCompleted = [...await options.store.readCompleted()]
      highestSeenSequence = Math.max(
        highestSeenSequence,
        ...allCompleted.map(({ sequence }) => sequence),
      )
      const completed = allCompleted
        .filter(({ sequence }) => sequence > packagedSequence)
        .sort((left, right) => right.sequence - left.sequence)
      for (const stored of completed) {
        try {
          const catalog = await loadStored(stored)
          active = { sequence: stored.sequence, catalog }
          return catalog
        } catch {
          // A corrupt active record must not prevent trying the retained fallback.
        }
      }
      active = undefined
      return null
    },

    async checkForUpdate(signal: AbortSignal): Promise<CatalogUpdateResult> {
      if (updateInFlight) return updateInFlight
      updateInFlight = (async () => {
        let stagedSequence: number | undefined
        try {
          const baseline = await current()
          const descriptorResponse = await fetcher(descriptorUrl, {
            cache: 'no-store',
            redirect: 'error',
            signal,
          })
          const descriptor = parseDescriptor(parseJson(await readResponse(descriptorResponse)))
          const catalogUrl = validateAllowedUrl(descriptor.catalogUrl, allowedHosts).href

          if (descriptor.sequence <= highestSeenSequence) {
            return { status: 'up-to-date', catalog: baseline.catalog }
          }

          const catalogResponse = await fetcher(catalogUrl, {
            cache: 'no-store',
            redirect: 'error',
            signal,
          })
          const catalogBytes = await readResponse(catalogResponse)
          if (await sha256Hex(catalogBytes) !== descriptor.catalogSha256) {
            throw new CatalogRepositoryError('CATALOG_HASH_MISMATCH', 'Downloaded catalog integrity check failed.')
          }
          const catalog = await validateCatalogIntegrity(parseJson(catalogBytes))
          if (catalog.catalogVersion !== descriptor.catalogVersion) {
            throw new CatalogRepositoryError('CATALOG_VERSION_INVALID', 'Catalog version does not match its descriptor.')
          }

          const assets: Record<string, Uint8Array> = {}
          for (const asset of catalog.assets) {
            const assetUrl = validateAllowedUrl(asset.path, allowedHosts, catalogUrl).href
            const response = await fetcher(assetUrl, {
              cache: 'no-store',
              redirect: 'error',
              signal,
            })
            const bytes = await readResponse(response)
            await verifyAsset(asset, bytes)
            assets[asset.id] = bytes
          }

          stagedSequence = descriptor.sequence
          await options.store.stage({
            sequence: descriptor.sequence,
            catalogSha256: descriptor.catalogSha256,
            catalog,
            catalogBytes,
            assets,
          })
          await options.store.commit(descriptor.sequence)
          highestSeenSequence = descriptor.sequence
          active = { sequence: descriptor.sequence, catalog }

          try {
            const retained = [...await options.store.readCompleted()]
              .sort((left, right) => right.sequence - left.sequence)
            const protectedSequences = new Set(retained.slice(0, 2).map(({ sequence }) => sequence))
            await options.store.prune(
              retained
                .map(({ sequence }) => sequence)
                .filter((sequence) => !protectedSequences.has(sequence)),
            )
          } catch {
            // Activation already succeeded. Pruning is best-effort and must not
            // turn a committed update into a reported failure.
          }
          return { status: 'updated', catalog }
        } catch (error) {
          if (stagedSequence !== undefined) {
            try {
              await options.store.discard(stagedSequence)
            } catch {
              // Activation never occurred, so a best-effort staging cleanup is safe.
            }
          }
          const networkFailure =
            signal.aborted
            || (error instanceof DOMException && error.name === 'AbortError')
            || error instanceof TypeError
          return {
            status: 'failed',
            requestId: createRequestId(),
            errorCode: networkFailure ? 'CATALOG_UPDATE_OFFLINE' : 'CATALOG_UPDATE_INVALID',
          }
        } finally {
          updateInFlight = undefined
        }
      })()
      return updateInFlight
    },
  }

  return repository
}
