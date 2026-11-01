#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  CatalogGenerationError,
} from './lib/catalog-generator.mjs'
import {
  CatalogValidationError,
  createValidationSnapshot,
  validateReleaseCatalog,
} from './lib/catalog-validator.mjs'
import {
  captureRepositorySources,
  createAssetSnapshotReader,
  generatedAt,
  generateCatalogFromSnapshot,
  repositoryAssetReader,
  writeCatalogArtifacts,
} from './generate-catalog.mjs'
import {
  compareDirectoryTrees,
  packagedAssetReader,
  validateBuiltApp,
  validateIOSSourceConfiguration,
} from './lib/ios-release-validator.mjs'
import { ReleaseValidationError } from './lib/release-validator.mjs'
import { validateReleaseFiles } from './validate-release.mjs'

const executeFile = promisify(execFile)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_PATH = resolve(ROOT, 'config/release-validation.json')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const argumentValue = (name, fallback) => {
  const item = process.argv.find((value) => value.startsWith(`${name}=`))
  return item ? item.slice(name.length + 1) : fallback
}

const runCommand = async (scope, command, args, options = {}) => {
  try {
    return await executeFile(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...options.env },
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    throw new ReleaseValidationError([{ scope, reason: 'command-failed' }])
  }
}

const sourceDigests = (sourceFiles) => new Map(sourceFiles.map(({ sourceId, bytes }) => [sourceId, sha256(bytes)]))

const verifySourcesUnchanged = async (snapshot) => {
  const before = sourceDigests(snapshot.sourceFiles)
  let after
  try {
    after = sourceDigests((await captureRepositorySources(ROOT)).sourceFiles)
  } catch {
    throw new ReleaseValidationError([{ scope: 'source', reason: 'unreadable' }])
  }
  const diffs = []
  for (const [sourceId, digest] of before) {
    if (after.get(sourceId) !== digest) diffs.push({ scope: 'source', reason: 'changed-during-validation', id: sourceId })
  }
  if (diffs.length > 0) throw new ReleaseValidationError(diffs)
}

const fullXcodeAvailable = async () => {
  try {
    const { stdout: selected } = await executeFile('xcode-select', ['-p'])
    if (!selected.trim().includes('.app/Contents/Developer')) return false
    await executeFile('xcodebuild', ['-version'])
    return true
  } catch {
    return false
  }
}

const findText = async (root, needle) => {
  const visit = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (await visit(path)) return true
      } else if (/\.(?:js|html)$/.test(entry.name)) {
        const source = await readFile(path, 'utf8')
        if (source.includes(needle)) return true
      }
    }
    return false
  }
  return visit(root)
}

const runArchive = async ({ config, releaseVersion, buildVersion, temporaryRoot }) => {
  const archivePath = join(temporaryRoot, 'Bhaavamrit.xcarchive')
  const derivedData = join(temporaryRoot, 'DerivedData')
  await runCommand('archive', 'xcodebuild', [
    '-project', resolve(ROOT, config.iosRelease.project),
    '-scheme', config.iosRelease.scheme,
    '-configuration', 'Release',
    '-destination', 'generic/platform=iOS',
    '-derivedDataPath', derivedData,
    '-archivePath', archivePath,
    'CODE_SIGNING_ALLOWED=NO',
    'archive',
  ])
  const appPath = join(archivePath, 'Products/Applications/App.app')
  await validateBuiltApp({ appPath, config, releaseVersion, buildVersion })
  await compareDirectoryTrees(
    resolve(ROOT, 'ios/App/App/public'),
    join(appPath, 'public'),
  )
  return archivePath
}

export const assertArchiveRequirement = ({ archiveMode, hasXcode }) => {
  if (archiveMode === 'required' && !hasXcode) {
    throw new ReleaseValidationError([{ scope: 'archive', reason: 'full-xcode-required' }])
  }
}

export const prepareIOSRelease = async ({ archiveMode = 'auto' } = {}) => {
  if (!['auto', 'required', 'skip'].includes(archiveMode)) {
    throw new ReleaseValidationError([{ scope: 'archive', reason: 'invalid-mode' }])
  }

  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'))
  const metadata = await validateReleaseFiles({ configPath: CONFIG_PATH })
  const iosSettings = await validateIOSSourceConfiguration({ root: ROOT, config, releaseVersion: metadata.releaseVersion })

  const startedAt = generatedAt()
  const sourceSnapshot = await captureRepositorySources(ROOT)
  const assetSnapshot = createAssetSnapshotReader(repositoryAssetReader(ROOT))
  const generated = await generateCatalogFromSnapshot({
    snapshot: sourceSnapshot,
    readAsset: assetSnapshot.capture,
    metadata: { generatedAt: startedAt },
  })
  const serializedSnapshot = await writeCatalogArtifacts({
    output: resolve(ROOT, 'public/catalog.json'),
    ...generated,
  })
  const validationSnapshot = createValidationSnapshot(serializedSnapshot)

  await runCommand('vite-build', resolve(ROOT, 'node_modules/.bin/vite'), ['build'], {
    env: { BHAAVAMRIT_RELEASE_VERSION: metadata.releaseVersion },
  })
  const distRoot = resolve(ROOT, 'dist')
  if (!await findText(distRoot, `releaseVersion:"${metadata.releaseVersion}"`)
    && !await findText(distRoot, `releaseVersion":"${metadata.releaseVersion}"`)) {
    throw new ReleaseValidationError([{ scope: 'vite-build', reason: 'missing', field: 'releaseVersion' }])
  }

  await runCommand('capacitor-sync', resolve(ROOT, 'node_modules/.bin/cap'), ['sync', 'ios'])
  const packagedRoot = resolve(ROOT, 'ios/App/App/public')
  const tree = await compareDirectoryTrees(distRoot, packagedRoot, {
    allowedAdditional: config.iosRelease.capacitorGeneratedFiles,
  })
  let packagedCatalog
  try {
    packagedCatalog = JSON.parse(await readFile(join(packagedRoot, 'catalog.json'), 'utf8'))
  } catch {
    throw new CatalogValidationError([{ scope: 'catalog', reason: 'unreadable', field: 'packaged' }])
  }
  await validateReleaseCatalog({
    snapshot: validationSnapshot,
    candidate: packagedCatalog,
    readAsset: packagedAssetReader({ packagedRoot, remoteReader: assetSnapshot.readCaptured }),
  })
  await verifySourcesUnchanged(sourceSnapshot)

  const hasXcode = await fullXcodeAvailable()
  let archiveStatus = 'skipped-command-line-tools'
  let archivePath
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'bhaavamrit-release-'))
  try {
    assertArchiveRequirement({ archiveMode, hasXcode })
    if (archiveMode !== 'skip' && hasXcode) {
      archivePath = await runArchive({
        config,
        releaseVersion: metadata.releaseVersion,
        buildVersion: iosSettings.buildVersion,
        temporaryRoot,
      })
      archiveStatus = 'validated'
    } else if (archiveMode === 'skip') {
      archiveStatus = 'skipped-explicitly'
    }

    return Object.freeze({
      archivePath,
      archiveStatus,
      catalogHash: generated.catalog.contentHash,
      packagedFileCount: tree.fileCount,
      releaseVersion: metadata.releaseVersion,
      buildVersion: iosSettings.buildVersion,
    })
  } finally {
    if (!archivePath) await rm(temporaryRoot, { recursive: true, force: true })
  }
}

const format = (item) => `[${item.scope}:${item.reason ?? item.code}] ${[item.id, item.field].filter(Boolean).join(':')}`.trim()

const run = async () => {
  const archiveMode = argumentValue('--archive', 'auto')
  const result = await prepareIOSRelease({ archiveMode })
  console.log(`iOS package validated for ${result.releaseVersion} (${result.catalogHash}); ${result.packagedFileCount} synced files.`)
  if (result.archiveStatus === 'validated') console.log(`Archive validated: ${relative(ROOT, result.archivePath)}`)
  else if (result.archiveStatus === 'skipped-command-line-tools') {
    console.log('Archive check skipped: full Xcode is unavailable (CommandLineTools-only environment). Re-run with --archive=required on an Xcode host before release.')
  } else console.log('Archive check skipped explicitly by --archive=skip; it remains required before release.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((error) => {
    if (error instanceof CatalogGenerationError) {
      for (const item of error.diagnostics) console.error(format(item))
    } else if (error instanceof CatalogValidationError || error instanceof ReleaseValidationError) {
      for (const item of error.diffs) console.error(format(item))
    } else {
      console.error('[release-pipeline:incomplete]')
    }
    process.exitCode = 1
  })
}
