const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value) => typeof value === 'string' ? value.trim() : ''
const diff = (scope, reason, details = {}) => Object.freeze({ scope, reason, ...details })

const freezeResult = (diffs) => {
  const frozenDiffs = Object.freeze(diffs.map((item) => Object.freeze(item)))
  return Object.freeze({ matches: frozenDiffs.length === 0, diffs: frozenDiffs })
}

const canonical = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonical).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  }
  if (!isObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
}

const equal = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))

export class ReleaseValidationError extends Error {
  constructor(diffs) {
    super(`Release validation failed with ${diffs.length} difference(s)`)
    this.name = 'ReleaseValidationError'
    this.diffs = Object.freeze(diffs.map((item) => Object.freeze({ ...item })))
  }
}

/** Validates the App Store release identifier after the same trimming used at runtime. */
export const compareReleaseVersion = (proposed, previouslyDistributed) => {
  const diffs = []
  const normalized = text(proposed)
  if (normalized.length === 0) diffs.push(diff('release-version', 'empty'))
  if ([...normalized].length > 64) {
    diffs.push(diff('release-version', 'too-long', { actualLength: [...normalized].length, maximumLength: 64 }))
  }
  if (!Array.isArray(previouslyDistributed) || previouslyDistributed.some((item) => typeof item !== 'string' || text(item).length === 0)) {
    diffs.push(diff('release-version', 'unreadable', { field: 'previouslyDistributedReleaseIds' }))
  } else if (previouslyDistributed.some((item) => text(item) === normalized)) {
    diffs.push(diff('release-version', 'previously-distributed', { id: normalized }))
  }
  return freezeResult(diffs)
}

export const validateReleaseVersion = (proposed, previouslyDistributed) => {
  const result = compareReleaseVersion(proposed, previouslyDistributed)
  if (!result.matches) throw new ReleaseValidationError(result.diffs)
  return result
}

const validateUniqueRecords = (records, scope, requiredFields, diffs) => {
  if (!Array.isArray(records)) {
    diffs.push(diff(scope, 'unreadable', { field: `${scope}s` }))
    return new Map()
  }
  const byId = new Map()
  for (const record of records) {
    if (!isObject(record) || text(record.id).length === 0) {
      diffs.push(diff(scope, 'incomplete', { field: 'id' }))
      continue
    }
    if (byId.has(record.id)) diffs.push(diff(scope, 'duplicate', { id: record.id }))
    else byId.set(record.id, record)
    for (const field of requiredFields) {
      if (text(record[field]).length === 0) diffs.push(diff(scope, 'incomplete', { id: record.id, field }))
    }
  }
  return byId
}

/** Checks every invariant required by the notice's direct inventory projection. */
export const comparePrivacyInventory = (inventory) => {
  const diffs = []
  if (!isObject(inventory)) return freezeResult([diff('privacy-inventory', 'unreadable')])

  const services = validateUniqueRecords(inventory.services, 'privacy-service', ['name', 'control', 'description'], diffs)
  const citations = validateUniqueRecords(inventory.citations, 'privacy-citation', ['title', 'publisher', 'url', 'summary'], diffs)
  const activities = validateUniqueRecords(
    inventory.activities,
    'privacy-activity',
    ['serviceId', 'dataCategory', 'purpose', 'recipients', 'retentionRule', 'condition'],
    diffs,
  )
  const noticeMappings = new Set()
  const serviceActivityCounts = new Map([...services.keys()].map((id) => [id, 0]))

  for (const activity of activities.values()) {
    if (!services.has(activity.serviceId)) {
      diffs.push(diff('privacy-activity', 'unknown-service', { id: activity.id, serviceId: activity.serviceId }))
    } else {
      serviceActivityCounts.set(activity.serviceId, (serviceActivityCounts.get(activity.serviceId) ?? 0) + 1)
    }
    const mapping = `${activity.serviceId}\u0000${text(activity.dataCategory)}`
    if (noticeMappings.has(mapping)) {
      diffs.push(diff('privacy-activity', 'duplicate-notice-mapping', {
        id: activity.id,
        serviceId: activity.serviceId,
        dataCategory: activity.dataCategory,
      }))
    }
    noticeMappings.add(mapping)

    if (!Array.isArray(activity.implementationEvidence) || activity.implementationEvidence.length === 0
      || activity.implementationEvidence.some((entry) => text(entry).length === 0)) {
      diffs.push(diff('privacy-activity', 'incomplete', { id: activity.id, field: 'implementationEvidence' }))
    }
    if (!Array.isArray(activity.citationIds)) {
      diffs.push(diff('privacy-activity', 'incomplete', { id: activity.id, field: 'citationIds' }))
      continue
    }
    const referenced = new Set()
    for (const citationId of activity.citationIds) {
      if (!citations.has(citationId)) diffs.push(diff('privacy-activity', 'unknown-citation', { id: activity.id, citationId }))
      if (referenced.has(citationId)) diffs.push(diff('privacy-activity', 'duplicate-citation', { id: activity.id, citationId }))
      referenced.add(citationId)
    }
    if (services.get(activity.serviceId)?.control === 'third-party' && referenced.size === 0) {
      diffs.push(diff('privacy-activity', 'incomplete', { id: activity.id, field: 'citationIds' }))
    }
  }

  for (const [serviceId, count] of serviceActivityCounts) {
    if (count === 0) diffs.push(diff('privacy-service', 'missing-notice-mapping', { id: serviceId }))
  }
  return freezeResult(diffs)
}

export const validatePrivacyInventory = (inventory) => {
  const result = comparePrivacyInventory(inventory)
  if (!result.matches) throw new ReleaseValidationError(result.diffs)
  return result
}

const sdkKey = (sdk) => `${sdk?.swiftPackage ?? ''}:${sdk?.product ?? ''}`

/** Compares the declared linked SDK set and normalized native manifest contents in both directions. */
export const compareNativePrivacyInventory = (declared, discovered) => {
  const diffs = []
  if (!isObject(declared) || !isObject(discovered)) {
    return freezeResult([diff('native-privacy', 'unreadable')])
  }
  if (!equal(declared.appManifest, discovered.appManifest)) {
    diffs.push(diff('native-privacy', 'manifest-mismatch', { id: 'app', field: 'declaration' }))
  }
  if (!Array.isArray(declared.sdks) || !Array.isArray(discovered.sdks)) {
    diffs.push(diff('native-sdk', 'unreadable', { field: 'sdks' }))
    return freezeResult(diffs)
  }

  const declaredByKey = new Map(declared.sdks.map((sdk) => [sdkKey(sdk), sdk]))
  const discoveredByKey = new Map(discovered.sdks.map((sdk) => [sdkKey(sdk), sdk]))
  if (declaredByKey.size !== declared.sdks.length) diffs.push(diff('native-sdk', 'duplicate'))
  if (discoveredByKey.size !== discovered.sdks.length) diffs.push(diff('native-sdk', 'duplicate-discovered'))

  for (const [key, expected] of declaredByKey) {
    const actual = discoveredByKey.get(key)
    if (!actual) {
      diffs.push(diff('native-sdk', 'missing', { id: key }))
      continue
    }
    for (const field of ['version', 'npmPackage', 'npmVersion', 'manifestPath', 'privacyManifest']) {
      if (!equal(expected[field], actual[field])) diffs.push(diff('native-sdk', 'metadata', { id: key, field }))
    }
  }
  for (const key of discoveredByKey.keys()) {
    if (!declaredByKey.has(key)) diffs.push(diff('native-sdk', 'additional', { id: key }))
  }
  return freezeResult(diffs)
}

export const validateNativePrivacyInventory = (declared, discovered) => {
  const result = compareNativePrivacyInventory(declared, discovered)
  if (!result.matches) throw new ReleaseValidationError(result.diffs)
  return result
}
