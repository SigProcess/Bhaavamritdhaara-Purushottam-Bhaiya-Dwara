import { describe, expect, it } from 'vitest'

import {
  ReleaseValidationError,
  compareNativePrivacyInventory,
  comparePrivacyInventory,
  compareReleaseVersion,
  validatePrivacyInventory,
  validateReleaseVersion,
} from '../../../scripts/lib/release-validator.mjs'
import { privacyInventory } from '../privacy/privacyInventory'

const clone = <T>(value: T): T => structuredClone(value)

const emptyManifest = {
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
  NSPrivacyCollectedDataTypes: [],
  NSPrivacyAccessedAPITypes: [],
}

const nativeInventory = {
  appManifest: {
    path: 'ios/App/App/PrivacyInfo.xcprivacy',
    declaration: emptyManifest,
  },
  sdks: [{
    swiftPackage: 'capacitor-swift-pm',
    product: 'Capacitor',
    version: '8.6.0',
    npmPackage: '@capacitor/ios',
    npmVersion: '8.6.0',
    manifestPath: 'Capacitor/PrivacyInfo.xcprivacy',
    privacyManifest: emptyManifest,
  }],
}

describe('release version validation', () => {
  it('accepts a nonempty bounded identifier that has not been distributed', () => {
    expect(compareReleaseVersion(' 1.1 ', ['1.0'])).toEqual({ matches: true, diffs: [] })
  })

  it.each([
    ['', 'empty'],
    [' '.repeat(3), 'empty'],
    ['x'.repeat(65), 'too-long'],
    ['1.0', 'previously-distributed'],
  ])('rejects invalid release identifier %j', (candidate, reason) => {
    const prior = reason === 'previously-distributed' ? ['1.0'] : []
    const result = compareReleaseVersion(candidate, prior)
    expect(result.matches).toBe(false)
    expect(result.diffs).toEqual(expect.arrayContaining([expect.objectContaining({ reason })]))
    expect(() => validateReleaseVersion(candidate, prior)).toThrow(ReleaseValidationError)
  })

  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(compareReleaseVersion('🙏'.repeat(64), []).matches).toBe(true)
    expect(compareReleaseVersion('🙏'.repeat(65), []).matches).toBe(false)
  })
})

describe('privacy notice inventory validation', () => {
  it('accepts the maintained inventory used by the in-app notice', () => {
    expect(comparePrivacyInventory(privacyInventory)).toEqual({ matches: true, diffs: [] })
    expect(validatePrivacyInventory(privacyInventory).matches).toBe(true)
  })

  it('blocks a service without a notice mapping', () => {
    const candidate: any = clone(privacyInventory)
    candidate.services.push({ id: 'unmapped', name: 'Unmapped', control: 'third-party', description: 'Missing activity.' })
    expect(comparePrivacyInventory(candidate).diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'privacy-service', reason: 'missing-notice-mapping', id: 'unmapped' }),
    ]))
  })

  it.each(['dataCategory', 'purpose', 'recipients', 'retentionRule'])('blocks an activity without %s', (field) => {
    const candidate: any = clone(privacyInventory)
    candidate.activities[0][field] = '   '
    expect(comparePrivacyInventory(candidate).diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'privacy-activity', reason: 'incomplete', field }),
    ]))
  })

  it('blocks duplicate service/category notice mappings and unknown references', () => {
    const candidate: any = clone(privacyInventory)
    candidate.activities.push({
      ...candidate.activities[0],
      id: 'duplicate-mapping',
      citationIds: ['missing-citation'],
    })
    const result = comparePrivacyInventory(candidate)
    expect(result.diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'duplicate-notice-mapping' }),
      expect.objectContaining({ reason: 'unknown-citation', citationId: 'missing-citation' }),
    ]))
  })
})

describe('native privacy inventory validation', () => {
  it('accepts matching SDK inventory and manifests regardless of manifest array order', () => {
    const discovered: any = clone(nativeInventory)
    expect(compareNativePrivacyInventory(nativeInventory, discovered)).toEqual({ matches: true, diffs: [] })
  })

  it('blocks undeclared, missing, version-mismatched, and manifest-mismatched SDK state', () => {
    const discovered: any = clone(nativeInventory)
    discovered.appManifest.declaration.NSPrivacyTracking = true
    discovered.sdks[0].version = '8.7.0'
    discovered.sdks.push({ ...discovered.sdks[0], product: 'Undeclared' })
    const result = compareNativePrivacyInventory(nativeInventory, discovered)
    expect(result.diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'native-privacy', reason: 'manifest-mismatch' }),
      expect.objectContaining({ scope: 'native-sdk', reason: 'metadata', field: 'version' }),
      expect.objectContaining({ scope: 'native-sdk', reason: 'additional' }),
    ]))
  })
})
