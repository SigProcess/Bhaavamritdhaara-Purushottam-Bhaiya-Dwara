#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  ReleaseValidationError,
  validateNativePrivacyInventory,
  validateReleaseVersion,
} from './lib/release-validator.mjs'

const executeFile = promisify(execFile)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_CONFIG = resolve(ROOT, 'config/release-validation.json')
const PACKAGE_SWIFT = resolve(ROOT, 'ios/App/CapApp-SPM/Package.swift')
const XCODE_PROJECT = resolve(ROOT, 'ios/App/App.xcodeproj')
const XCODE_PROJECT_FILE = resolve(XCODE_PROJECT, 'project.pbxproj')
const PACKAGE_LOCK = resolve(ROOT, 'package-lock.json')

const unreadable = (scope, field) => new ReleaseValidationError([{ scope, reason: 'unreadable', field }])

const readJson = async (path, scope) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw unreadable(scope, relative(ROOT, path))
  }
}

const readPrivacyManifest = async (path) => {
  try {
    const { stdout } = await executeFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path], { maxBuffer: 1024 * 1024 })
    return JSON.parse(stdout)
  } catch {
    throw unreadable('native-privacy', relative(ROOT, path))
  }
}

const marketingVersionFromProject = async () => {
  try {
    const source = await readFile(XCODE_PROJECT_FILE, 'utf8')
    const releaseBlocks = [...source.matchAll(/buildSettings\s*=\s*\{([\s\S]*?)\};\s*name\s*=\s*Release;/g)]
    const versions = releaseBlocks
      .map(([, settings]) => settings.match(/\bMARKETING_VERSION\s*=\s*([^;]+);/)?.[1]?.trim())
      .filter(Boolean)
    if (versions.length !== 1) throw new Error('ambiguous MARKETING_VERSION')
    return versions[0]
  } catch {
    throw unreadable('release-version', 'MARKETING_VERSION')
  }
}

const resolveMarketingVersion = async () => {
  try {
    const { stdout } = await executeFile('xcodebuild', [
      '-project', XCODE_PROJECT,
      '-target', 'App',
      '-configuration', 'Release',
      '-showBuildSettings',
    ], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 })
    const match = stdout.match(/^\s*MARKETING_VERSION\s*=\s*(.+?)\s*$/m)
    if (!match) throw new Error('missing MARKETING_VERSION')
    return match[1]
  } catch {
    // Command Line Tools installations cannot run xcodebuild. The checked-in target
    // setting remains independently verifiable until a full Xcode archive is available.
    return marketingVersionFromProject()
  }
}

const discoverSwiftProducts = (source) => {
  const packageMatch = source.match(/\.package\(url:\s*"[^"]*\/([^/" ]+)\.git",\s*exact:\s*"([^"]+)"\)/)
  if (!packageMatch) throw unreadable('native-sdk', 'Package.swift dependency')
  const [, swiftPackage, version] = packageMatch
  return [...source.matchAll(/\.product\(name:\s*"([^"]+)",\s*package:\s*"([^"]+)"\)/g)]
    .map((match) => ({ product: match[1], swiftPackage: match[2], version }))
}

const installedNpmVersion = (lockfile, packageName) => lockfile.packages?.[`node_modules/${packageName}`]?.version

const discoverNativePrivacy = async (declaration) => {
  let packageSource
  let projectSource
  try {
    ;[packageSource, projectSource] = await Promise.all([
      readFile(PACKAGE_SWIFT, 'utf8'),
      readFile(XCODE_PROJECT_FILE, 'utf8'),
    ])
  } catch {
    throw unreadable('native-sdk', 'iOS project')
  }
  if (!projectSource.includes('PrivacyInfo.xcprivacy in Resources')) {
    throw new ReleaseValidationError([{ scope: 'native-privacy', reason: 'missing', field: 'Xcode Resources' }])
  }

  const packageLock = await readJson(PACKAGE_LOCK, 'native-sdk')
  const declaredByKey = new Map(declaration.sdks.map((sdk) => [`${sdk.swiftPackage}:${sdk.product}`, sdk]))
  const products = discoverSwiftProducts(packageSource)
  const sdks = await Promise.all(products.map(async (product) => {
    const declared = declaredByKey.get(`${product.swiftPackage}:${product.product}`)
    const manifestPath = declared?.manifestPath ?? ''
    const npmPackage = declared?.npmPackage ?? ''
    return {
      ...product,
      npmPackage,
      npmVersion: installedNpmVersion(packageLock, npmPackage),
      manifestPath,
      privacyManifest: manifestPath ? await readPrivacyManifest(resolve(ROOT, manifestPath)) : undefined,
    }
  }))

  return {
    appManifest: {
      path: declaration.appManifest.path,
      declaration: await readPrivacyManifest(resolve(ROOT, declaration.appManifest.path)),
    },
    sdks,
  }
}

export const validateReleaseFiles = async ({ configPath = DEFAULT_CONFIG, releaseVersion } = {}) => {
  const config = await readJson(configPath, 'release-config')
  const proposedVersion = releaseVersion ?? await resolveMarketingVersion()
  validateReleaseVersion(proposedVersion, config.previouslyDistributedReleaseIds)
  const discoveredPrivacy = await discoverNativePrivacy(config.nativePrivacy)
  validateNativePrivacyInventory(config.nativePrivacy, discoveredPrivacy)
  return Object.freeze({ releaseVersion: proposedVersion })
}

const formatDiff = (item) => {
  const location = [item.scope, item.id, item.field].filter(Boolean).join(':')
  return `[${item.reason}] ${location}`
}

const run = async () => {
  const result = await validateReleaseFiles()
  console.log(`Release metadata validated for version ${result.releaseVersion}.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((error) => {
    if (error instanceof ReleaseValidationError) {
      for (const item of error.diffs) console.error(formatDiff(item))
    } else {
      console.error('Release validation could not complete.')
    }
    process.exitCode = 1
  })
}
