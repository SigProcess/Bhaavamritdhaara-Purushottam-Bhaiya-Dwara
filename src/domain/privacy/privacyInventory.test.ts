import { describe, expect, it } from 'vitest'
import { privacyInventory } from './privacyInventory'

const unique = (values: readonly string[]) => new Set(values).size === values.length

describe('privacyInventory', () => {
  it('keeps stable unique IDs and valid references', () => {
    const serviceIds = privacyInventory.services.map(({ id }) => id)
    const citationIds = privacyInventory.citations.map(({ id }) => id)
    const activityIds = privacyInventory.activities.map(({ id }) => id)

    expect(unique(serviceIds)).toBe(true)
    expect(unique(citationIds)).toBe(true)
    expect(unique(activityIds)).toBe(true)

    for (const activity of privacyInventory.activities) {
      expect(serviceIds).toContain(activity.serviceId)
      expect(activity.implementationEvidence.length).toBeGreaterThan(0)
      for (const citationId of activity.citationIds) expect(citationIds).toContain(citationId)
    }
  })

  it('contains complete notice fields for app and third-party processing', () => {
    expect(new Set(privacyInventory.services.map(({ control }) => control))).toEqual(
      new Set(['app-controlled', 'third-party']),
    )

    for (const activity of privacyInventory.activities) {
      expect(activity.dataCategory.trim()).not.toBe('')
      expect(activity.purpose.trim()).not.toBe('')
      expect(activity.recipients.trim()).not.toBe('')
      expect(activity.retentionRule.trim()).not.toBe('')
      expect(activity.condition.trim()).not.toBe('')
    }
  })

  it('covers YouTube/Google and Netlify with official citations', () => {
    for (const serviceId of ['youtube-google', 'netlify']) {
      const activities = privacyInventory.activities.filter((entry) => entry.serviceId === serviceId)
      expect(activities.length).toBeGreaterThan(0)
      expect(activities.every((entry) => entry.citationIds.length > 0)).toBe(true)
    }

    expect(privacyInventory.citations.map(({ url }) => url)).toEqual(
      expect.arrayContaining([
        'https://policies.google.com/privacy',
        'https://www.youtube.com/t/terms',
        'https://www.netlify.com/privacy/',
      ]),
    )
  })
})
