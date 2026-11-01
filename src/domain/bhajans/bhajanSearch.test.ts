import { describe, expect, it } from 'vitest'
import type {
  AssetId,
  BhajanId,
  BhajanRecord,
} from '../contracts'
import {
  BHAJAN_QUERY_MAX_CODE_POINTS,
  bhajanMatchesQuery,
  countUnicodeCodePoints,
  distinctBhajans,
  normalizeBhajanQuery,
  resolveBhajanResults,
} from './bhajanSearch'

function bhajan(
  id: string,
  hindiTitle: string,
  englishTitle: string,
): BhajanRecord {
  return {
    id: id as BhajanId,
    hindiTitle,
    englishTitle,
    document: { assetId: `asset-${id}` as AssetId },
  }
}

const catalog = [
  bhajan('one', 'प्रेम की धारा', 'Stream of Love'),
  bhajan('two', 'राम नाम', 'Naam of Ram'),
  bhajan('three', 'गुरु वंदना', 'Guru Vandana'),
  bhajan('four', 'मन मंदिर', 'Temple of the Heart'),
  bhajan('five', 'प्रभु मेरे', 'My Lord'),
  bhajan('six', 'शरण तुम्हारी', 'In Your Refuge'),
] as const

describe('bhajan search', () => {
  it('trims Unicode whitespace and counts code points instead of UTF-16 units', () => {
    expect(normalizeBhajanQuery('\u00a0\u2003राम😀\ufeff')).toBe('राम😀')
    expect(countUnicodeCodePoints('राम😀')).toBe(4)
  })

  it('keeps the first record for each ID in canonical order', () => {
    const duplicateWithChangedMetadata = {
      ...catalog[0],
      englishTitle: 'Changed duplicate',
    }

    expect(distinctBhajans([
      catalog[1],
      catalog[0],
      duplicateWithChangedMetadata,
      catalog[2],
    ])).toEqual([catalog[1], catalog[0], catalog[2]])
  })

  it('returns the first five distinct records and total count initially', () => {
    const result = resolveBhajanResults(
      [...catalog, { ...catalog[0] }],
      '\u2003\ufeff',
    )

    expect(result).toMatchObject({
      kind: 'initial',
      query: '',
      resultCount: 6,
      totalCount: 6,
      didExecuteSearch: false,
    })
    expect(result.items).toEqual(catalog.slice(0, 5))
  })

  it('returns every distinct record when the complete list is requested', () => {
    const result = resolveBhajanResults(
      [...catalog, { ...catalog[1] }],
      '',
      true,
    )

    expect(result.kind).toBe('all-results')
    expect(result.items).toEqual(catalog)
    expect(result.resultCount).toBe(6)
    expect(result.didExecuteSearch).toBe(false)
  })

  it('matches Hindi and English titles by case-insensitive contiguous substring', () => {
    expect(bhajanMatchesQuery(catalog[0], 'रेम की')).toBe(true)
    expect(bhajanMatchesQuery(catalog[0], 'STREAM OF')).toBe(true)
    expect(bhajanMatchesQuery(catalog[0], 'stream love')).toBe(false)

    const englishResult = resolveBhajanResults(catalog, '  gUrU  ')
    expect(englishResult).toMatchObject({
      kind: 'matched',
      query: 'gUrU',
      resultCount: 1,
      didExecuteSearch: true,
    })
    expect(englishResult.items).toEqual([catalog[2]])
  })

  it('preserves canonical order and removes duplicate matching records', () => {
    const result = resolveBhajanResults(
      [catalog[5], catalog[1], { ...catalog[5] }, catalog[0]],
      'र',
    )

    expect(result.kind).toBe('matched')
    expect(result.items).toEqual([catalog[5], catalog[1], catalog[0]])
    expect(result.resultCount).toBe(3)
  })

  it('returns a distinct zero-results state for a valid unmatched query', () => {
    const result = resolveBhajanResults(catalog, 'अस्तित्वहीन')

    expect(result).toMatchObject({
      kind: 'zero-results',
      query: 'अस्तित्वहीन',
      items: [],
      resultCount: 0,
      totalCount: 6,
      didExecuteSearch: true,
    })
  })

  it('accepts 200 code points and rejects 201 without executing search', () => {
    const accepted = resolveBhajanResults(
      [bhajan('limit', '', 'A'.repeat(BHAJAN_QUERY_MAX_CODE_POINTS))],
      'a'.repeat(BHAJAN_QUERY_MAX_CODE_POINTS),
    )
    const rejected = resolveBhajanResults(
      catalog,
      `\u2003${'😀'.repeat(BHAJAN_QUERY_MAX_CODE_POINTS + 1)}\u00a0`,
    )

    expect(accepted.kind).toBe('matched')
    expect(rejected).toMatchObject({
      kind: 'overlength',
      resultCount: 0,
      totalCount: 6,
      didExecuteSearch: false,
      characterCount: 201,
      maximumCharacterCount: 200,
    })
    expect(rejected.items).toEqual([])
    if (rejected.kind === 'overlength') {
      expect(rejected.validationMessage).toContain('200')
    }
  })
})
