import type { BhajanId, BhajanRecord } from '../contracts'

export const BHAJAN_QUERY_MAX_CODE_POINTS = 200
export const BHAJAN_INITIAL_RESULT_LIMIT = 5
export const BHAJAN_QUERY_LIMIT_MESSAGE =
  'Search is limited to 200 Unicode characters.'

export interface BhajanResultStateBase {
  readonly query: string
  readonly items: readonly BhajanRecord[]
  readonly resultCount: number
  readonly totalCount: number
  readonly didExecuteSearch: boolean
}

export interface InitialBhajanResultState extends BhajanResultStateBase {
  readonly kind: 'initial'
  readonly query: ''
  readonly didExecuteSearch: false
}

export interface AllBhajanResultState extends BhajanResultStateBase {
  readonly kind: 'all-results'
  readonly query: ''
  readonly didExecuteSearch: false
}

export interface MatchedBhajanResultState extends BhajanResultStateBase {
  readonly kind: 'matched'
  readonly didExecuteSearch: true
}

export interface ZeroBhajanResultState extends BhajanResultStateBase {
  readonly kind: 'zero-results'
  readonly items: readonly []
  readonly resultCount: 0
  readonly didExecuteSearch: true
}

export interface OverlengthBhajanResultState extends BhajanResultStateBase {
  readonly kind: 'overlength'
  readonly items: readonly []
  readonly resultCount: 0
  readonly didExecuteSearch: false
  readonly characterCount: number
  readonly maximumCharacterCount: typeof BHAJAN_QUERY_MAX_CODE_POINTS
  readonly validationMessage: typeof BHAJAN_QUERY_LIMIT_MESSAGE
}

export type BhajanResultState =
  | InitialBhajanResultState
  | AllBhajanResultState
  | MatchedBhajanResultState
  | ZeroBhajanResultState
  | OverlengthBhajanResultState

/** Removes leading and trailing ECMAScript Unicode WhiteSpace characters. */
export function normalizeBhajanQuery(rawQuery: string): string {
  return rawQuery.trim()
}

/** Counts Unicode code points rather than UTF-16 code units. */
export function countUnicodeCodePoints(value: string): number {
  return Array.from(value).length
}

/** Keeps the first record for each stable document ID in canonical order. */
export function distinctBhajans(
  bhajans: readonly BhajanRecord[],
): readonly BhajanRecord[] {
  const seen = new Set<BhajanId>()
  const distinct: BhajanRecord[] = []

  for (const bhajan of bhajans) {
    if (seen.has(bhajan.id)) continue
    seen.add(bhajan.id)
    distinct.push(bhajan)
  }

  return distinct
}

/**
 * Uses locale-independent Unicode default case conversion, then performs a
 * contiguous substring comparison without sorting or rewriting source data.
 */
export function bhajanMatchesQuery(
  bhajan: BhajanRecord,
  normalizedQuery: string,
): boolean {
  const foldedQuery = normalizedQuery.toLowerCase()

  return (
    bhajan.hindiTitle.toLowerCase().includes(foldedQuery) ||
    bhajan.englishTitle.toLowerCase().includes(foldedQuery)
  )
}

/**
 * Resolves every Bhajan Finder list state from canonical records. Overlength
 * input returns before matching, so invalid input never executes a search.
 */
export function resolveBhajanResults(
  bhajans: readonly BhajanRecord[],
  rawQuery: string,
  showAll = false,
): BhajanResultState {
  const query = normalizeBhajanQuery(rawQuery)
  const characterCount = countUnicodeCodePoints(query)
  const distinct = distinctBhajans(bhajans)
  const totalCount = distinct.length

  if (characterCount > BHAJAN_QUERY_MAX_CODE_POINTS) {
    return {
      kind: 'overlength',
      query,
      items: [],
      resultCount: 0,
      totalCount,
      didExecuteSearch: false,
      characterCount,
      maximumCharacterCount: BHAJAN_QUERY_MAX_CODE_POINTS,
      validationMessage: BHAJAN_QUERY_LIMIT_MESSAGE,
    }
  }

  if (characterCount === 0) {
    const items = showAll
      ? distinct
      : distinct.slice(0, BHAJAN_INITIAL_RESULT_LIMIT)

    return {
      kind: showAll ? 'all-results' : 'initial',
      query: '',
      items,
      resultCount: totalCount,
      totalCount,
      didExecuteSearch: false,
    }
  }

  const items = distinct.filter((bhajan) =>
    bhajanMatchesQuery(bhajan, query),
  )

  if (items.length === 0) {
    return {
      kind: 'zero-results',
      query,
      items: [],
      resultCount: 0,
      totalCount,
      didExecuteSearch: true,
    }
  }

  return {
    kind: 'matched',
    query,
    items,
    resultCount: items.length,
    totalCount,
    didExecuteSearch: true,
  }
}
