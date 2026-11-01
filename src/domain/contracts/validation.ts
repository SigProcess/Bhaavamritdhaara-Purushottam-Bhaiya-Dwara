import type { CatalogEnvelope } from './catalog'

export interface SourceDigest {
  readonly sourceId: string
  readonly sha256: string
  readonly byteLength: number
}

export interface ValidationSnapshot {
  readonly snapshotId: string
  readonly startedAt: string
  readonly sourceRevision: string
  readonly catalog: CatalogEnvelope
  /** Source order is retained for deterministic validation diagnostics. */
  readonly sourceFiles: readonly SourceDigest[]
}

export type CatalogDiffScope =
  | 'catalog'
  | 'collection'
  | 'playlist'
  | 'video'
  | 'bhajan'
  | 'book'
  | 'asset'

export type CatalogDiffReason =
  | 'missing'
  | 'additional'
  | 'order'
  | 'membership'
  | 'metadata'
  | 'unreadable'
  | 'hash-mismatch'

export interface CatalogDiff {
  readonly scope: CatalogDiffScope
  readonly id?: string
  readonly field?: string
  readonly expected?: unknown
  readonly actual?: unknown
  readonly reason: CatalogDiffReason
}

export interface CatalogComparisonResult {
  readonly matches: boolean
  readonly diffs: readonly CatalogDiff[]
}
