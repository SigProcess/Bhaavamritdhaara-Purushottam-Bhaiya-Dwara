#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { prepareIOSRelease } from './prepare-ios-release.mjs'

const executeFile = promisify(execFile)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE_PATH = resolve(ROOT, 'package.json')
const ORDER = Object.freeze([
  'typecheck',
  'unit',
  'property',
  'component',
  'browser',
  'ios-package',
  'archive',
  'external-service',
])

const record = (group, scope, status, reason = '') => Object.freeze({ group, scope, status, reason })

const compactReason = (error) => {
  if (Array.isArray(error?.diffs) && error.diffs.length > 0) {
    return error.diffs
      .map((item) => [item.scope, item.reason ?? item.code, item.id ?? item.field].filter(Boolean).join(':'))
      .join(',')
  }
  if (Array.isArray(error?.diagnostics) && error.diagnostics.length > 0) {
    return error.diagnostics
      .map((item) => [item.scope, item.reason ?? item.code, item.id ?? item.field].filter(Boolean).join(':'))
      .join(',')
  }
  const output = error?.stderr || error?.stdout || error?.message
  const lines = String(output ?? 'command-failed').split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  const testSummary = lines.filter((line) => /^(Test Files|Tests)\s/.test(line))
  if (testSummary.length > 0) return testSummary.join('; ')
  const typeErrors = lines.filter((line) => /error TS\d+:/.test(line))
  if (typeErrors.length > 0) return `${typeErrors[0]}${typeErrors.length > 1 ? ` (+${typeErrors.length - 1} more)` : ''}`
  const failure = lines.find((line) => /^(Error|TypeError|FAIL\s|\[.+:.+\])/.test(line))
  return failure || lines.at(-1) || 'command-failed'
}

const hasPropertyTests = async (directory = resolve(ROOT, 'src')) => {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      if (await hasPropertyTests(path)) return true
    } else if (/\.property\.test\.(?:ts|tsx)$/.test(entry.name)) return true
  }
  return false
}

const runNpmScript = async (script) => {
  try {
    await executeFile('npm', ['run', script], {
      cwd: ROOT,
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    })
    return { status: 'passed', reason: '' }
  } catch (error) {
    return { status: 'failed', reason: compactReason(error) }
  }
}

export const formatReadinessReport = (records) => {
  const groups = [
    ['deterministic-app', 'Deterministic app checks'],
    ['full-xcode', 'Checks requiring full Xcode'],
    ['external-service', 'External-service checks'],
  ]
  const lines = ['Release readiness report']
  for (const [group, heading] of groups) {
    lines.push('', `${heading}:`)
    for (const item of records.filter((candidate) => candidate.group === group)) {
      lines.push(`  [${item.status}] ${item.scope}${item.reason ? ` - ${item.reason}` : ''}`)
    }
  }
  return lines.join('\n')
}

export const readinessExitCode = (records, { externalRequested = false } = {}) => {
  const requiredFailure = records.some((item) =>
    item.group !== 'external-service' && !['passed', 'not-applicable'].includes(item.status))
  const externalFailure = externalRequested && records.some((item) =>
    item.group === 'external-service' && item.status !== 'passed')
  return requiredFailure || externalFailure ? 1 : 0
}

/**
 * @param {{
 *   externalRequested?: boolean,
 *   packageScripts?: Record<string, string>,
 *   runScript?: (script: string) => Promise<{ status: string, reason: string }>,
 *   propertyTestsPresent?: () => Promise<boolean>,
 *   runIOSRelease?: (options: { archiveMode: string }) => Promise<any>
 * }} [options]
 */
export const verifyReleaseReadiness = async (options = {}) => {
  const {
    externalRequested = false,
    packageScripts,
    runScript = runNpmScript,
    propertyTestsPresent = hasPropertyTests,
    runIOSRelease = prepareIOSRelease,
  } = options
  const scripts = packageScripts ?? JSON.parse(await readFile(PACKAGE_PATH, 'utf8')).scripts ?? {}
  const results = []

  for (const [scope, script] of [
    ['typecheck', 'typecheck'],
    ['unit', 'test:unit'],
  ]) {
    if (!scripts[script]) results.push(record('deterministic-app', scope, 'not-configured', `missing npm script ${script}`))
    else {
      const result = await runScript(script)
      results.push(record('deterministic-app', scope, result.status, result.reason))
    }
  }

  if (!scripts['test:property']) {
    results.push(record('deterministic-app', 'property', 'not-applicable', 'optional property suite is not configured'))
  } else if (!await propertyTestsPresent()) {
    results.push(record('deterministic-app', 'property', 'not-applicable', 'no optional property test files found'))
  } else {
    const result = await runScript('test:property')
    results.push(record('deterministic-app', 'property', result.status, result.reason))
  }

  if (!scripts['test:component']) {
    results.push(record('deterministic-app', 'component', 'not-configured', 'missing npm script test:component'))
  } else {
    const result = await runScript('test:component')
    results.push(record('deterministic-app', 'component', result.status, result.reason))
  }

  if (!scripts['test:browser']) {
    results.push(record('deterministic-app', 'browser', 'not-applicable', 'optional browser suite is not configured'))
  } else {
    const result = await runScript('test:browser')
    results.push(record('deterministic-app', 'browser', result.status, result.reason))
  }

  let iosResult
  try {
    iosResult = await runIOSRelease({ archiveMode: 'auto' })
    results.push(record(
      'deterministic-app',
      'ios-package',
      'passed',
      `catalog parity ${iosResult.catalogHash}; privacy, configuration, native source, build, and sync passed (${iosResult.packagedFileCount} files)`,
    ))
  } catch (error) {
    results.push(record('deterministic-app', 'ios-package', 'failed', compactReason(error)))
  }

  if (!iosResult) {
    results.push(record('full-xcode', 'archive', 'skipped', 'iOS package validation failed'))
  } else if (iosResult.archiveStatus === 'validated') {
    results.push(record('full-xcode', 'archive', 'passed'))
  } else {
    results.push(record('full-xcode', 'archive', 'blocked', 'full Xcode is unavailable; rerun on a full Xcode host'))
  }

  if (!externalRequested) {
    results.push(record('external-service', 'external-service', 'not-requested', 'run with --external when a controlled live-service check is configured'))
  } else if (!scripts['test:external']) {
    results.push(record('external-service', 'external-service', 'not-configured', 'missing npm script test:external'))
  } else {
    const result = await runScript('test:external')
    results.push(record('external-service', 'external-service', result.status, result.reason))
  }

  return Object.freeze(ORDER.map((scope) => results.find((item) => item.scope === scope)).filter(Boolean))
}

const run = async () => {
  const externalRequested = process.argv.includes('--external')
  const records = await verifyReleaseReadiness({ externalRequested })
  console.log(formatReadinessReport(records))
  process.exitCode = readinessExitCode(records, { externalRequested })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((error) => {
    console.error(`Release readiness could not complete: ${compactReason(error)}`)
    process.exitCode = 1
  })
}
