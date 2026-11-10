import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  embedHostUrl,
  isSupportedYouTubeVideoId,
  parseEmbedMessage,
  requiresEmbedHost,
} from './youtubeIframeExternalMediaService'

const EMBED_ORIGIN = 'https://purushottambhaiya.netlify.app'
const EMBED_SOURCE = 'bhaavamrit-embed'
const HOST_WINDOW = { name: 'embed-frame' }

const inbound = (
  data: unknown,
  origin: string = EMBED_ORIGIN,
  source: unknown = HOST_WINDOW,
) => ({ data, origin, source })

describe('YouTube video id validation', () => {
  it('accepts exactly eleven URL-safe base64 characters', () => {
    expect(isSupportedYouTubeVideoId('vokyaFhvtXs')).toBe(true)
    expect(isSupportedYouTubeVideoId('uOVlQ-8T-To')).toBe(true)
    expect(isSupportedYouTubeVideoId('-4RPdl6TklM')).toBe(true)
    expect(isSupportedYouTubeVideoId('Rz_CWrpqDs4')).toBe(true)
  })

  it('refuses any other length', () => {
    expect(isSupportedYouTubeVideoId('')).toBe(false)
    expect(isSupportedYouTubeVideoId('vokyaFhvtX')).toBe(false)
    expect(isSupportedYouTubeVideoId('vokyaFhvtXsX')).toBe(false)
    // The fixture catalogue's placeholder ids are deliberately not real ids.
    expect(isSupportedYouTubeVideoId('youtube-hindi')).toBe(false)
  })

  /**
   * The id is interpolated into a URL that a second frame then reads, so a value carrying a
   * separator, a scheme, or markup has to be refused before it is ever used, not escaped later.
   */
  it('refuses a value that could change the meaning of the URL or the page', () => {
    expect(isSupportedYouTubeVideoId('abc&autoplay')).toBe(false)
    expect(isSupportedYouTubeVideoId('abc?v=xxxxx')).toBe(false)
    expect(isSupportedYouTubeVideoId('abc#xxxxxxx')).toBe(false)
    expect(isSupportedYouTubeVideoId('../../secret')).toBe(false)
    expect(isSupportedYouTubeVideoId('<script>abc')).toBe(false)
    expect(isSupportedYouTubeVideoId('javascript:a')).toBe(false)
    expect(isSupportedYouTubeVideoId('abcdefghij ')).toBe(false)
    expect(isSupportedYouTubeVideoId('abcdefghij\n')).toBe(false)
  })

  it('refuses anything that is not a string', () => {
    expect(isSupportedYouTubeVideoId(undefined)).toBe(false)
    expect(isSupportedYouTubeVideoId(null)).toBe(false)
    expect(isSupportedYouTubeVideoId(12345678901)).toBe(false)
    expect(isSupportedYouTubeVideoId({ toString: () => 'vokyaFhvtXs' })).toBe(false)
  })
})

describe('embedHostUrl', () => {
  it('addresses the deployed host page with the validated id', () => {
    expect(embedHostUrl('vokyaFhvtXs')).toBe(
      'https://purushottambhaiya.netlify.app/embed.html?v=vokyaFhvtXs',
    )
  })

  it('throws rather than build a URL from an unvalidated id', () => {
    expect(() => embedHostUrl('youtube-hindi')).toThrow('EMBED_VIDEO_ID_REJECTED')
    expect(() => embedHostUrl('abc&autoplay')).toThrow('EMBED_VIDEO_ID_REJECTED')
    expect(() => embedHostUrl('')).toThrow('EMBED_VIDEO_ID_REJECTED')
  })
})

describe('requiresEmbedHost', () => {
  it('leaves an http(s) runtime on the direct embed', () => {
    expect(requiresEmbedHost('https:')).toBe(false)
    expect(requiresEmbedHost('http:')).toBe(false)
  })

  /** The iOS app's own scheme, plus the schemes the Chromium probes used. */
  it('routes a custom-scheme runtime through the host page', () => {
    expect(requiresEmbedHost('capacitor:')).toBe(true)
    expect(requiresEmbedHost('ionic:')).toBe(true)
    expect(requiresEmbedHost('file:')).toBe(true)
    expect(requiresEmbedHost('about:')).toBe(true)
  })
})

describe('parseEmbedMessage', () => {
  it('accepts the handshake, the four player states, and a position report', () => {
    expect(parseEmbedMessage(inbound({ source: EMBED_SOURCE, type: 'ready' }), HOST_WINDOW))
      .toEqual({ type: 'ready' })
    for (const state of ['playing', 'paused', 'ended', 'failed'] as const) {
      expect(parseEmbedMessage(inbound({ source: EMBED_SOURCE, type: 'state', state }), HOST_WINDOW))
        .toEqual({ type: 'state', state })
    }
    expect(parseEmbedMessage(
      inbound({ source: EMBED_SOURCE, type: 'time', positionSeconds: 12.5 }),
      HOST_WINDOW,
    )).toEqual({ type: 'time', positionSeconds: 12.5 })
  })

  it('refuses a message from any origin other than the embed host', () => {
    const message = { source: EMBED_SOURCE, type: 'ready' }
    expect(parseEmbedMessage(inbound(message, 'https://evil.example'), HOST_WINDOW)).toBeUndefined()
    expect(parseEmbedMessage(inbound(message, 'https://www.youtube.com'), HOST_WINDOW)).toBeUndefined()
    expect(parseEmbedMessage(inbound(message, 'capacitor://localhost'), HOST_WINDOW)).toBeUndefined()
    expect(parseEmbedMessage(inbound(message, 'null'), HOST_WINDOW)).toBeUndefined()
    expect(parseEmbedMessage(
      inbound(message, 'https://purushottambhaiya.netlify.app.evil.example'),
      HOST_WINDOW,
    )).toBeUndefined()
  })

  it('refuses a message from a frame other than the one this handle created', () => {
    expect(parseEmbedMessage(
      inbound({ source: EMBED_SOURCE, type: 'ready' }, EMBED_ORIGIN, { name: 'other-frame' }),
      HOST_WINDOW,
    )).toBeUndefined()
  })

  it('refuses an envelope that is not the embed page speaking', () => {
    expect(parseEmbedMessage(inbound({ type: 'ready' }), HOST_WINDOW)).toBeUndefined()
    expect(parseEmbedMessage(inbound({ source: 'bhaavamrit-embed-host', type: 'ready' }), HOST_WINDOW))
      .toBeUndefined()
    // YouTube's own IFrame API posts to the same window; it must not be mistaken for the bridge.
    expect(parseEmbedMessage(
      inbound({ event: 'infoDelivery', info: { playerState: 1 } }),
      HOST_WINDOW,
    )).toBeUndefined()
  })

  it('refuses anything outside the closed message set', () => {
    for (const type of ['play', 'pause', 'seek', 'eval', 'navigate', '', undefined]) {
      expect(parseEmbedMessage(inbound({ source: EMBED_SOURCE, type }), HOST_WINDOW)).toBeUndefined()
    }
  })

  it('refuses a state name that is not a player state', () => {
    for (const state of ['buffering', 'PLAYING', 'ready', 1, null, undefined]) {
      expect(parseEmbedMessage(
        inbound({ source: EMBED_SOURCE, type: 'state', state }),
        HOST_WINDOW,
      )).toBeUndefined()
    }
  })

  it('refuses a position that is not a finite, non-negative number', () => {
    for (const positionSeconds of [-1, Number.NaN, Number.POSITIVE_INFINITY, '12', null, undefined]) {
      expect(parseEmbedMessage(
        inbound({ source: EMBED_SOURCE, type: 'time', positionSeconds }),
        HOST_WINDOW,
      )).toBeUndefined()
    }
  })

  it('refuses a payload that is not an object', () => {
    for (const data of ['ready', 42, null, undefined, true]) {
      expect(parseEmbedMessage(inbound(data), HOST_WINDOW)).toBeUndefined()
    }
  })

  /**
   * A frame whose window is not reachable cannot be compared against anything, so the origin and
   * the envelope carry the check on their own rather than the message being dropped outright.
   */
  it('falls back to the origin check when the frame window is unknown', () => {
    expect(parseEmbedMessage(inbound({ source: EMBED_SOURCE, type: 'ready' }), null))
      .toEqual({ type: 'ready' })
    expect(parseEmbedMessage(
      inbound({ source: EMBED_SOURCE, type: 'ready' }, 'https://evil.example'),
      null,
    )).toBeUndefined()
  })
})

/**
 * The host page is a static asset, so nothing else in the suite can reach it. These are the
 * invariants that make it safe to frame: a strictly validated id, an origin check on every
 * inbound message, and no path from a message to executed code or to markup.
 */
describe('the shipped public/embed.html', () => {
  const page = readFileSync(
    new URL('../../public/embed.html', import.meta.url),
    'utf8',
  )

  it('validates the video id with the same pattern as the parent', () => {
    expect(page).toContain('/^[A-Za-z0-9_-]{11}$/')
    expect(page).toContain('VIDEO_ID_PATTERN.test(value)')
  })

  it('checks the sender and the origin of every inbound message', () => {
    expect(page).toContain('event.source !== window.parent')
    expect(page).toContain('ALLOWED_PARENT_ORIGINS.indexOf(event.origin) === -1')
    expect(page).toContain("'capacitor://localhost'")
    expect(page).toContain("'https://purushottambhaiya.netlify.app'")
  })

  it('accepts a closed command set and nothing else', () => {
    expect(page).toContain(
      "if (type !== 'hello' && type !== 'play' && type !== 'pause' && type !== 'seek') return",
    )
  })

  it('never turns a message into code or into markup', () => {
    for (const forbidden of [
      'eval(',
      'new Function',
      'innerHTML',
      'outerHTML',
      'document.write',
      'insertAdjacentHTML',
      'location.assign',
      'location.replace',
      'location.href =',
      'setTimeout("',
    ]) {
      expect(page).not.toContain(forbidden)
    }
  })

  it('creates the player paused and never muted', () => {
    expect(page).toContain('autoplay: 0')
    expect(page).not.toContain('mute:')
    expect(page).not.toContain('muted:')
    expect(page).not.toContain('mute=')
    expect(page).not.toContain('mute(')
  })
})
