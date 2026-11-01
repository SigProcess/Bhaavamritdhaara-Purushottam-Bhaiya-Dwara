import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  compareDirectoryTrees,
  validateIOSSourceConfiguration,
} from '../../../scripts/lib/ios-release-validator.mjs'
import { ReleaseValidationError } from '../../../scripts/lib/release-validator.mjs'
import { assertArchiveRequirement } from '../../../scripts/prepare-ios-release.mjs'

const compareTrees = compareDirectoryTrees as (
  expectedRoot: string,
  actualRoot: string,
  options?: { allowedAdditional?: string[] },
) => Promise<{ fileCount: number }>

const temporaryRoots: string[] = []

const createRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'bhaavamrit-release-fixture-'))
  temporaryRoots.push(root)
  return root
}

const writeFixture = async (root: string, path: string, value: string) => {
  const destination = join(root, path)
  await mkdir(join(destination, '..'), { recursive: true })
  await writeFile(destination, value)
}

const captureFailure = async (operation: () => unknown | Promise<unknown>) => {
  try {
    await operation()
  } catch (error) {
    return error
  }
  throw new Error('Expected release validation to block the fixture')
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('iOS release sync-tree fixtures', () => {
  it('accepts a clean synchronized tree', async () => {
    const root = await createRoot()
    const expected = join(root, 'dist')
    const actual = join(root, 'packaged')
    await writeFixture(expected, 'index.html', 'same')
    await writeFixture(expected, 'assets/app.js', 'bundle')
    await writeFixture(actual, 'index.html', 'same')
    await writeFixture(actual, 'assets/app.js', 'bundle')
    await writeFixture(actual, 'capacitor.js', 'generated')

    await expect(compareTrees(expected, actual, {
      allowedAdditional: ['capacitor.js'],
    })).resolves.toEqual({ fileCount: 3 })
  })

  it.each([
    ['missing packaged file', async (expected: string, actual: string) => {
      await writeFixture(expected, 'assets/app.js', 'bundle')
      await mkdir(actual, { recursive: true })
    }, { scope: 'packaged-assets', reason: 'missing', id: 'assets/app.js' }],
    ['additional packaged file', async (expected: string, actual: string) => {
      await mkdir(expected, { recursive: true })
      await writeFixture(actual, 'private.txt', 'extra')
    }, { scope: 'packaged-assets', reason: 'additional', id: 'private.txt' }],
    ['changed packaged file', async (expected: string, actual: string) => {
      await writeFixture(expected, 'index.html', 'expected')
      await writeFixture(actual, 'index.html', 'changed')
    }, { scope: 'packaged-assets', reason: 'hash-mismatch', id: 'index.html' }],
  ])('blocks %s and reports only a relative asset scope', async (_name, arrange, expectedDiff) => {
    const root = await createRoot()
    const expected = join(root, 'dist')
    const actual = join(root, 'packaged')
    await arrange(expected, actual)

    const error = await captureFailure(() => compareTrees(expected, actual))

    expect(error).toBeInstanceOf(ReleaseValidationError)
    expect(error).toMatchObject({ diffs: expect.arrayContaining([expect.objectContaining(expectedDiff)]) })
    expect(JSON.stringify(error)).not.toContain(root)
  })

  it('blocks a missing required generated file with a safe generated-file ID', async () => {
    const root = await createRoot()
    const expected = join(root, 'dist')
    const actual = join(root, 'packaged')
    await writeFixture(expected, 'index.html', 'same')
    await writeFixture(actual, 'index.html', 'same')

    const error = await captureFailure(() => compareTrees(expected, actual, {
      allowedAdditional: ['capacitor.js'],
    }))

    expect(error).toMatchObject({
      diffs: expect.arrayContaining([
        expect.objectContaining({ scope: 'packaged-assets', reason: 'missing-generated', id: 'capacitor.js' }),
      ]),
    })
    expect(JSON.stringify(error)).not.toContain(root)
  })

  it('blocks an unreadable sync tree without exposing its root', async () => {
    const root = await createRoot()
    const expected = join(root, 'dist')
    const unreadable = join(root, 'private-library', 'packaged')
    await mkdir(expected, { recursive: true })

    const error = await captureFailure(() => compareTrees(expected, unreadable))

    expect(error).toMatchObject({
      diffs: [expect.objectContaining({ scope: 'packaged-assets', reason: 'unreadable', field: '.' })],
    })
    expect(JSON.stringify(error)).not.toContain(root)
    expect(JSON.stringify(error)).not.toContain('private-library')
  })
})

describe('iOS release configuration fixture', () => {
  it('blocks incomplete configuration with safe field scopes before filesystem access', async () => {
    const privateRoot = '/private/release-worktree'
    const error = await captureFailure(() => validateIOSSourceConfiguration({
      root: privateRoot,
      config: { iosRelease: { project: '' } },
      releaseVersion: '1.0.0',
    }))

    expect(error).toBeInstanceOf(ReleaseValidationError)
    expect(error).toMatchObject({
      diffs: expect.arrayContaining([
        expect.objectContaining({ scope: 'release-config', reason: 'incomplete', field: 'iosRelease.project' }),
        expect.objectContaining({ scope: 'release-config', reason: 'incomplete', field: 'iosRelease.projectFile' }),
      ]),
    })
    expect(JSON.stringify(error)).not.toContain(privateRoot)
  })
})

describe('archive-required policy fixture', () => {
  it('blocks required archives when full Xcode is unavailable', () => {
    expect(() => assertArchiveRequirement({ archiveMode: 'required', hasXcode: false })).toThrowError(
      expect.objectContaining({
        diffs: [expect.objectContaining({ scope: 'archive', reason: 'full-xcode-required' })],
      }),
    )
  })

  it.each([
    ['required', true],
    ['auto', false],
    ['auto', true],
    ['skip', false],
  ])('allows archive mode %s when host availability is %s', (archiveMode, hasXcode) => {
    expect(() => assertArchiveRequirement({ archiveMode, hasXcode })).not.toThrow()
  })
})
