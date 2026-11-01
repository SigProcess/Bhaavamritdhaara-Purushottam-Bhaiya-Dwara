/** A stable, serialized identifier. IDs remain stable when records are reordered. */
export type StableId<Kind extends string> = string & {
  readonly __stableIdKind: Kind
}

export type CollectionId = StableId<'collection'>
export type PlaylistId = StableId<'playlist'>
export type VideoId = StableId<'video'>
export type BhajanId = StableId<'bhajan'>
export type BookId = StableId<'book'>
export type AssetId = StableId<'asset'>
export type CatalogVersionId = StableId<'catalog-version'>
export type DocumentId = BhajanId | BookId

/**
 * A catalog-owned asset reference. Platform bridges accept this identifier rather
 * than accepting an arbitrary path or URL from application code.
 */
export interface AssetRef {
  readonly assetId: AssetId
}

export type AssetAvailability = 'packaged' | 'remote'

export interface AssetRecord {
  readonly id: AssetId
  readonly path: string
  readonly sha256: string
  readonly byteLength: number
  readonly mediaType: string
  readonly availability: AssetAvailability
}

export interface VideoRecord {
  readonly id: VideoId
  /** Provider-owned video identifier retained separately from the stable catalog ID. */
  readonly sourceVideoId: string
  readonly title: string
  readonly thumbnail: AssetRef
}

export interface PlaylistRecord {
  readonly id: PlaylistId
  readonly title: string
  readonly thumbnail: AssetRef
  readonly youtubePlaylistId?: string
  readonly collectionId?: CollectionId
  /** Canonical display order. Consumers must not sort this array. */
  readonly videos?: readonly VideoRecord[]
}

export interface CollectionRecord {
  readonly id: CollectionId
  readonly title: string
  readonly thumbnail: AssetRef
  /** Canonical playlist membership and display order. */
  readonly playlistIds: readonly PlaylistId[]
}

export interface BhajanRecord {
  readonly id: BhajanId
  readonly hindiTitle: string
  readonly englishTitle: string
  readonly meaning?: string
  readonly document: AssetRef
}

export interface BookRecord {
  readonly id: BookId
  readonly title: string
  readonly subtitle?: string
  readonly author?: string
  readonly pageCount: number
  readonly cover: AssetRef
  readonly document: AssetRef
}

export interface CatalogEnvelope {
  readonly schemaVersion: 1
  readonly catalogVersion: CatalogVersionId
  readonly generatedAt: string
  readonly sourceRevision: string
  readonly contentHash: string
  /** Canonical collection display order. */
  readonly collections: readonly CollectionRecord[]
  /** Canonical collection-owned playlist records in source order. */
  readonly collectionPlaylists: readonly PlaylistRecord[]
  /** Canonical standalone-playlist display order. */
  readonly standalonePlaylists: readonly PlaylistRecord[]
  /** Canonical distinct-bhajan display order. */
  readonly bhajans: readonly BhajanRecord[]
  /** Canonical book display order. */
  readonly books: readonly BookRecord[]
  /** Deterministic manifest order emitted by the catalog generator. */
  readonly assets: readonly AssetRecord[]
}

export type Catalog = CatalogEnvelope
