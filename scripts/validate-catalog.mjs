#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { repositoryAssetReader } from './generate-catalog.mjs'
import {
  CatalogValidationError,
  createValidationSnapshot,
  validateReleaseCatalog,
} from './lib/catalog-validator.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return resolve(ROOT, index >= 0 ? process.argv[index + 1] : fallback)
}

const safeReadJson = async (path, scope) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new CatalogValidationError([{
      scope: 'catalog',
      reason: 'unreadable',
      field: scope,
    }])
  }
}

const labels = Object.freeze({
  missing: 'missing',
  additional: 'additional',
  order: 'reordered',
  membership: 'reassigned',
  metadata: 'changed',
  unreadable: 'unreadable',
  'hash-mismatch': 'hash-mismatched',
})

export const formatCatalogDiff = (item) => {
  const location = [item.scope, item.id, item.field].filter(Boolean).join(':')
  return `[${labels[item.reason] ?? item.reason}] ${location}`
}

export const validateCatalogFiles = async ({
  snapshotPath = resolve(ROOT, 'public/catalog.json.snapshot.json'),
  candidatePath = resolve(ROOT, 'public/catalog.json'),
  readAsset = repositoryAssetReader(ROOT),
} = {}) => {
  const serializedSnapshot = await safeReadJson(snapshotPath, 'snapshot')
  const candidate = await safeReadJson(candidatePath, 'candidate')
  const snapshot = createValidationSnapshot(serializedSnapshot)
  return validateReleaseCatalog({ snapshot, candidate, readAsset })
}

const run = async () => {
  const snapshotPath = argument('--snapshot', 'public/catalog.json.snapshot.json')
  const candidatePath = argument('--candidate', 'public/catalog.json')
  await validateCatalogFiles({ snapshotPath, candidatePath })
  console.log(`Catalog parity validated: ${relative(ROOT, candidatePath)}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((error) => {
    if (error instanceof CatalogValidationError) {
      for (const item of error.diffs) console.error(formatCatalogDiff(item))
    } else {
      console.error('Catalog validation could not complete.')
    }
    process.exitCode = 1
  })
}
