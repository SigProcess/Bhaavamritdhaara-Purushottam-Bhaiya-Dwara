import { describe, expect, it, vi } from 'vitest'

import {
  formatReadinessReport,
  readinessExitCode,
  verifyReleaseReadiness,
} from '../../../scripts/verify-release-readiness.mjs'

const coreScripts = {
  typecheck: 'tsc --noEmit',
  'test:unit': 'vitest run',
  'test:property': 'vitest run',
  'test:component': 'vitest run',
}

const successfulIOSResult = {
  archiveStatus: 'validated',
  catalogHash: 'abc123',
  packagedFileCount: 42,
  releaseVersion: '1.0.0',
  buildVersion: '1',
}

describe('release readiness orchestration', () => {
  it('runs each deterministic script and the expensive iOS pipeline exactly once', async () => {
    const runScript = vi.fn().mockResolvedValue({ status: 'passed', reason: '' })
    const runIOSRelease = vi.fn().mockResolvedValue(successfulIOSResult)

    const records = await verifyReleaseReadiness({
      packageScripts: { ...coreScripts, 'test:browser': 'playwright test' },
      propertyTestsPresent: vi.fn().mockResolvedValue(true),
      runScript,
      runIOSRelease,
    })

    expect(runScript.mock.calls.map(([script]) => script)).toEqual([
      'typecheck',
      'test:unit',
      'test:property',
      'test:component',
      'test:browser',
    ])
    expect(runIOSRelease).toHaveBeenCalledOnce()
    expect(runIOSRelease).toHaveBeenCalledWith({ archiveMode: 'auto' })
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'deterministic-app', scope: 'ios-package', status: 'passed' }),
      expect.objectContaining({ group: 'full-xcode', scope: 'archive', status: 'passed' }),
      expect.objectContaining({ group: 'external-service', status: 'not-requested' }),
    ]))
    expect(readinessExitCode(records)).toBe(0)
  })

  it('treats absent optional suites separately while preserving the full-Xcode blocker', async () => {
    const records = await verifyReleaseReadiness({
      packageScripts: coreScripts,
      propertyTestsPresent: vi.fn().mockResolvedValue(false),
      runScript: vi.fn().mockResolvedValue({ status: 'passed', reason: '' }),
      runIOSRelease: vi.fn().mockResolvedValue({
        ...successfulIOSResult,
        archiveStatus: 'skipped-command-line-tools',
      }),
    })

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ group: 'deterministic-app', scope: 'property', status: 'not-applicable' }),
      expect.objectContaining({ group: 'deterministic-app', scope: 'browser', status: 'not-applicable' }),
      expect.objectContaining({ group: 'full-xcode', scope: 'archive', status: 'blocked' }),
    ]))
    expect(readinessExitCode(records)).toBe(1)

    const report = formatReadinessReport(records)
    expect(report).toContain('Deterministic app checks:')
    expect(report).toContain('Checks requiring full Xcode:')
    expect(report).toContain('External-service checks:')
  })

  it('does not fail readiness when only plan-marked optional suites are absent', async () => {
    const records = await verifyReleaseReadiness({
      packageScripts: coreScripts,
      propertyTestsPresent: vi.fn().mockResolvedValue(false),
      runScript: vi.fn().mockResolvedValue({ status: 'passed', reason: '' }),
      runIOSRelease: vi.fn().mockResolvedValue(successfulIOSResult),
    })

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'property', status: 'not-applicable' }),
      expect.objectContaining({ scope: 'browser', status: 'not-applicable' }),
      expect.objectContaining({ scope: 'archive', status: 'passed' }),
    ]))
    expect(readinessExitCode(records)).toBe(0)
  })

  it('runs external checks only when explicitly requested and keeps their result scoped', async () => {
    const runScript = vi.fn(async (script: string) => script === 'test:external'
      ? { status: 'failed', reason: 'controlled fixture unavailable' }
      : { status: 'passed', reason: '' })

    const records = await verifyReleaseReadiness({
      externalRequested: true,
      packageScripts: {
        ...coreScripts,
        'test:browser': 'playwright test',
        'test:external': 'node scripts/check-external.mjs',
      },
      propertyTestsPresent: vi.fn().mockResolvedValue(true),
      runScript,
      runIOSRelease: vi.fn().mockResolvedValue(successfulIOSResult),
    })

    expect(records).toContainEqual(expect.objectContaining({
      group: 'external-service',
      scope: 'external-service',
      status: 'failed',
      reason: 'controlled fixture unavailable',
    }))
    expect(readinessExitCode(records)).toBe(0)
    expect(readinessExitCode(records, { externalRequested: true })).toBe(1)
  })
})
