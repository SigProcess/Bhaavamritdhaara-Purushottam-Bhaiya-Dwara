import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

import { ReleaseValidationError } from './release-validator.mjs'

const executeFile = promisify(execFile)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const diff = (scope, reason, details = {}) => Object.freeze({ scope, reason, ...details })
const usageDescriptionPattern = /^NS[A-Za-z]+UsageDescription$/

const safeRelative = (root, path) => relative(root, path).split('\\').join('/')

const assertInside = (root, path) => {
  const resolvedRoot = resolve(root)
  const resolvedPath = resolve(path)
  const escaped = relative(resolvedRoot, resolvedPath)
  if (escaped.startsWith('..') || isAbsolute(escaped)) throw new Error('path escaped configured root')
  return resolvedPath
}

const collectFiles = async (root) => {
  const files = new Map()
  const visit = async (directory) => {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      throw new ReleaseValidationError([diff('packaged-assets', 'unreadable', { field: safeRelative(root, directory) || '.' })])
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) {
        const bytes = await readFile(path)
        files.set(safeRelative(root, path), Object.freeze({ sha256: sha256(bytes), byteLength: bytes.byteLength }))
      }
    }
  }
  await visit(root)
  return files
}

export const compareDirectoryTrees = async (expectedRoot, actualRoot, { allowedAdditional = [] } = {}) => {
  const [expected, actual] = await Promise.all([collectFiles(expectedRoot), collectFiles(actualRoot)])
  const diffs = []
  const allowed = new Set(allowedAdditional)
  for (const [path, metadata] of expected) {
    const candidate = actual.get(path)
    if (!candidate) diffs.push(diff('packaged-assets', 'missing', { id: path }))
    else if (metadata.sha256 !== candidate.sha256 || metadata.byteLength !== candidate.byteLength) {
      diffs.push(diff('packaged-assets', 'hash-mismatch', { id: path }))
    }
  }
  for (const path of actual.keys()) if (!expected.has(path) && !allowed.has(path)) diffs.push(diff('packaged-assets', 'additional', { id: path }))
  for (const path of allowed) if (!actual.has(path)) diffs.push(diff('packaged-assets', 'missing-generated', { id: path }))
  if (diffs.length > 0) throw new ReleaseValidationError(diffs)
  return Object.freeze({ fileCount: actual.size })
}

export const packagedAssetReader = ({ packagedRoot, remoteReader }) => async (asset) => {
  if (asset?.availability === 'remote') {
    if (!remoteReader) throw new Error('remote asset was not captured')
    return remoteReader(asset)
  }
  const relativePath = String(asset?.path ?? '').replace(/^\/+/, '')
  return readFile(assertInside(packagedRoot, join(packagedRoot, relativePath)))
}

const readPlist = async (path, scope = 'ios-config') => {
  try {
    const { stdout } = await executeFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path], { maxBuffer: 8 * 1024 * 1024 })
    return JSON.parse(stdout)
  } catch {
    throw new ReleaseValidationError([diff(scope, 'unreadable', { field: basename(path) })])
  }
}

const releaseBuildSettings = (source) => {
  const blocks = [...source.matchAll(/buildSettings\s*=\s*\{([\s\S]*?)\};\s*name\s*=\s*Release;/g)]
  const target = blocks.find(([, body]) => /\bPRODUCT_BUNDLE_IDENTIFIER\s*=/.test(body))?.[1]
  if (!target) return undefined
  const value = (name) => target.match(new RegExp(`\\b${name}\\s*=\\s*([^;]+);`))?.[1]?.trim().replace(/^"|"$/g, '')
  return Object.freeze({
    appIconSet: value('ASSETCATALOG_COMPILER_APPICON_NAME'),
    buildVersion: value('CURRENT_PROJECT_VERSION'),
    entitlementsPath: value('CODE_SIGN_ENTITLEMENTS'),
    minimumIOSVersion: value('IPHONEOS_DEPLOYMENT_TARGET'),
    releaseVersion: value('MARKETING_VERSION'),
    bundleId: value('PRODUCT_BUNDLE_IDENTIFIER'),
    deviceFamily: value('TARGETED_DEVICE_FAMILY'),
  })
}

const pngDimensions = (bytes) => {
  if (bytes.byteLength < 24 || bytes.subarray(1, 4).toString('ascii') !== 'PNG') return undefined
  return Object.freeze({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) })
}

const compareValue = (diffs, scope, field, expected, actual) => {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) diffs.push(diff(scope, actual === undefined ? 'missing' : 'mismatch', { field, expected, actual }))
}

const validatePlugins = async (root, expectedPlugins, diffs) => {
  let registration
  try {
    registration = await readFile(join(root, 'ios/App/App/BhaavamritBridgeViewController.swift'), 'utf8')
  } catch {
    diffs.push(diff('plugins', 'unreadable', { field: 'registration' }))
    return
  }
  for (const plugin of expectedPlugins) {
    const registrations = registration.match(new RegExp(`registerPluginInstance\\(${plugin}\\(\\)\\)`, 'g')) ?? []
    if (registrations.length !== 1) diffs.push(diff('plugins', registrations.length === 0 ? 'missing' : 'duplicate', { id: plugin }))
    try {
      const source = await readFile(join(root, `ios/App/App/${plugin}.swift`), 'utf8')
      if (!new RegExp(`(?:class|final class|public final class)\\s+${plugin}\\b`).test(source)) {
        diffs.push(diff('plugins', 'mismatch', { id: plugin, field: 'definition' }))
      }
    } catch {
      diffs.push(diff('plugins', 'unreadable', { id: plugin }))
    }
  }
}

const validateEntitlements = async (root, settings, allowedEntitlements, diffs) => {
  if (!settings.entitlementsPath) {
    if (allowedEntitlements.length > 0) diffs.push(diff('entitlements', 'missing', { field: 'CODE_SIGN_ENTITLEMENTS' }))
    return
  }
  let entitlements
  try {
    entitlements = await readPlist(resolve(root, 'ios/App', settings.entitlementsPath), 'entitlements')
  } catch (error) {
    if (error instanceof ReleaseValidationError) diffs.push(...error.diffs)
    else diffs.push(diff('entitlements', 'unreadable'))
    return
  }
  const actual = Object.keys(entitlements).sort()
  compareValue(diffs, 'entitlements', 'keys', [...allowedEntitlements].sort(), actual)
}

export const validateIOSSourceConfiguration = async ({ root, config, releaseVersion }) => {
  const diffs = []
  const ios = config?.iosRelease
  if (!ios || typeof ios !== 'object') throw new ReleaseValidationError([diff('release-config', 'incomplete', { field: 'iosRelease' })])
  const configDiffs = []
  for (const field of [
    'project', 'projectFile', 'scheme', 'infoPlist', 'appName', 'bundleId',
    'minimumIOSVersion', 'deviceFamily', 'appIconSet', 'appIconContents',
    'appIconFile', 'appIconSha256', 'privacyManifest',
  ]) {
    if (typeof ios[field] !== 'string' || ios[field].trim().length === 0) {
      configDiffs.push(diff('release-config', 'incomplete', { field: `iosRelease.${field}` }))
    }
  }
  for (const field of ['orientations', 'requiredPlugins', 'allowedEntitlements', 'capacitorGeneratedFiles']) {
    if (!Array.isArray(ios[field])) configDiffs.push(diff('release-config', 'incomplete', { field: `iosRelease.${field}` }))
  }
  if (!ios.usageDescriptions || typeof ios.usageDescriptions !== 'object' || Array.isArray(ios.usageDescriptions)) {
    configDiffs.push(diff('release-config', 'incomplete', { field: 'iosRelease.usageDescriptions' }))
  }
  if (configDiffs.length > 0) throw new ReleaseValidationError(configDiffs)

  let projectSource
  let info
  try {
    ;[projectSource, info] = await Promise.all([
      readFile(join(root, ios.projectFile), 'utf8'),
      readPlist(join(root, ios.infoPlist)),
    ])
  } catch (error) {
    if (error instanceof ReleaseValidationError) throw error
    throw new ReleaseValidationError([diff('ios-config', 'unreadable')])
  }
  const settings = releaseBuildSettings(projectSource)
  if (!settings) throw new ReleaseValidationError([diff('ios-config', 'incomplete', { field: 'Release build settings' })])

  compareValue(diffs, 'app-identity', 'CFBundleDisplayName', ios.appName, info.CFBundleDisplayName)
  compareValue(diffs, 'app-identity', 'PRODUCT_BUNDLE_IDENTIFIER', ios.bundleId, settings.bundleId)
  compareValue(diffs, 'release-version', 'MARKETING_VERSION', releaseVersion, settings.releaseVersion)
  if (!/^\d+(?:\.\d+)*$/.test(settings.buildVersion ?? '')) diffs.push(diff('build-version', 'invalid', { field: 'CURRENT_PROJECT_VERSION' }))
  compareValue(diffs, 'ios-config', 'IPHONEOS_DEPLOYMENT_TARGET', ios.minimumIOSVersion, settings.minimumIOSVersion)
  compareValue(diffs, 'ios-config', 'TARGETED_DEVICE_FAMILY', String(ios.deviceFamily), settings.deviceFamily)
  compareValue(diffs, 'ios-config', 'UISupportedInterfaceOrientations', ios.orientations, info.UISupportedInterfaceOrientations)
  compareValue(diffs, 'ios-config', 'ASSETCATALOG_COMPILER_APPICON_NAME', ios.appIconSet, settings.appIconSet)

  const usageDescriptions = Object.fromEntries(Object.entries(info).filter(([key]) => usageDescriptionPattern.test(key)))
  compareValue(diffs, 'usage-descriptions', 'Info.plist', ios.usageDescriptions, usageDescriptions)
  await validateEntitlements(root, settings, ios.allowedEntitlements, diffs)
  await validatePlugins(root, ios.requiredPlugins, diffs)

  try {
    const iconCatalog = JSON.parse(await readFile(join(root, ios.appIconContents), 'utf8'))
    const iconEntry = iconCatalog.images?.find((entry) => entry.filename === ios.appIconFile && entry.size === '1024x1024')
    if (!iconEntry) diffs.push(diff('app-icon', 'missing', { id: ios.appIconFile }))
    const iconBytes = await readFile(join(root, dirname(ios.appIconContents), ios.appIconFile))
    compareValue(diffs, 'app-icon', 'sha256', ios.appIconSha256, sha256(iconBytes))
    compareValue(diffs, 'app-icon', 'dimensions', { width: 1024, height: 1024 }, pngDimensions(iconBytes))
  } catch {
    diffs.push(diff('app-icon', 'unreadable'))
  }

  try {
    await readPlist(join(root, ios.privacyManifest), 'privacy-manifest')
    if (!projectSource.includes(`${basename(ios.privacyManifest)} in Resources`)) {
      diffs.push(diff('privacy-manifest', 'missing', { field: 'Xcode Resources' }))
    }
  } catch (error) {
    if (error instanceof ReleaseValidationError) diffs.push(...error.diffs)
    else diffs.push(diff('privacy-manifest', 'unreadable'))
  }

  let capacitorSource
  try {
    capacitorSource = await readFile(join(root, 'capacitor.config.ts'), 'utf8')
    if (!capacitorSource.includes(`appId: '${ios.bundleId}'`)) diffs.push(diff('capacitor-config', 'mismatch', { field: 'appId' }))
    if (!capacitorSource.includes(`appName: '${ios.appName}'`)) diffs.push(diff('capacitor-config', 'mismatch', { field: 'appName' }))
    if (!capacitorSource.includes("webDir: 'dist'")) diffs.push(diff('capacitor-config', 'mismatch', { field: 'webDir' }))
  } catch {
    diffs.push(diff('capacitor-config', 'unreadable'))
  }

  if (diffs.length > 0) throw new ReleaseValidationError(diffs)
  return Object.freeze({ ...settings, info })
}

export const validateBuiltApp = async ({ appPath, config, releaseVersion, buildVersion }) => {
  const diffs = []
  const ios = config.iosRelease
  const info = await readPlist(join(appPath, 'Info.plist'), 'archive')
  compareValue(diffs, 'archive', 'CFBundleDisplayName', ios.appName, info.CFBundleDisplayName)
  compareValue(diffs, 'archive', 'CFBundleIdentifier', ios.bundleId, info.CFBundleIdentifier)
  compareValue(diffs, 'archive', 'CFBundleShortVersionString', releaseVersion, info.CFBundleShortVersionString)
  compareValue(diffs, 'archive', 'CFBundleVersion', buildVersion, info.CFBundleVersion)
  compareValue(diffs, 'archive', 'UIDeviceFamily', [Number(ios.deviceFamily)], info.UIDeviceFamily)
  compareValue(diffs, 'archive', 'UISupportedInterfaceOrientations', ios.orientations, info.UISupportedInterfaceOrientations)
  const usageDescriptions = Object.fromEntries(Object.entries(info).filter(([key]) => usageDescriptionPattern.test(key)))
  compareValue(diffs, 'archive', 'usageDescriptions', ios.usageDescriptions, usageDescriptions)

  const managedEntitlements = new Set([
    'application-identifier', 'com.apple.developer.team-identifier',
    'get-task-allow', 'keychain-access-groups',
  ])
  try {
    const result = await executeFile('/usr/bin/codesign', ['-d', '--entitlements', ':-', appPath], { maxBuffer: 8 * 1024 * 1024 })
    const plist = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    const actualEntitlements = [...plist.matchAll(/<key>([^<]+)<\/key>/g)]
      .map((match) => match[1])
      .filter((key) => !managedEntitlements.has(key))
      .sort()
    compareValue(diffs, 'archive', 'entitlements', [...ios.allowedEntitlements].sort(), actualEntitlements)
  } catch {
    // Unsigned validation archives have no effective entitlements. Source settings
    // were already checked above; a configured capability still requires signing.
    if (ios.allowedEntitlements.length > 0) diffs.push(diff('archive', 'unreadable', { field: 'entitlements' }))
  }

  for (const required of ['Assets.car', basename(ios.privacyManifest), 'public/catalog.json']) {
    try { await stat(join(appPath, required)) } catch { diffs.push(diff('archive', 'missing', { id: required })) }
  }
  if (diffs.length > 0) throw new ReleaseValidationError(diffs)
  return Object.freeze({ appPath })
}
