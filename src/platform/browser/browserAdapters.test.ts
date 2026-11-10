import { describe, expect, it, vi } from 'vitest'
import {
  BrowserAppMetadataService,
  BrowserLifecycleService,
  BrowserNetworkService,
  detectBrowserPlatform,
  selectPlatformAdapters,
} from './browserAdapters'

describe('BrowserNetworkService', () => {
  it('combines browser events with actual request outcomes', async () => {
    const callbacks = new Map<string, EventListener>()
    const browserNavigator = { onLine: true }
    const environment = {
      navigator: browserNavigator,
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        callbacks.set(type, listener)
      }),
      removeEventListener: vi.fn((type: string) => callbacks.delete(type)),
    }
    const service = new BrowserNetworkService(environment)
    const listener = vi.fn()
    const unsubscribe = service.subscribe(listener)

    service.reportRequestOutcome('network-failed')
    await expect(service.currentStatus()).resolves.toBe('unknown')
    expect(listener).toHaveBeenLastCalledWith('unknown')

    browserNavigator.onLine = false
    callbacks.get('offline')?.(new Event('offline'))
    await expect(service.currentStatus()).resolves.toBe('offline')

    service.reportRequestOutcome('succeeded')
    await expect(service.currentStatus()).resolves.toBe('online')
    unsubscribe()
    expect(environment.removeEventListener).toHaveBeenCalledTimes(2)
  })
})

describe('browser lifecycle and metadata', () => {
  it('maps document visibility and generated metadata', async () => {
    const callbacks = new Map<string, EventListener>()
    const browserDocument = { visibilityState: 'visible' as DocumentVisibilityState }
    const lifecycle = new BrowserLifecycleService({
      document: browserDocument,
      addEventListener: (type, listener) => callbacks.set(type, listener),
      removeEventListener: (type) => callbacks.delete(type),
    })
    const listener = vi.fn()
    lifecycle.subscribe(listener)
    await expect(lifecycle.currentState()).resolves.toBe('active')

    browserDocument.visibilityState = 'hidden'
    callbacks.get('visibilitychange')?.(new Event('visibilitychange'))
    expect(listener).toHaveBeenCalledWith('background')

    const metadata = new BrowserAppMetadataService(
      { releaseVersion: ' 1.2.3-web ' },
      'android',
    )
    await expect(metadata.getVersion()).resolves.toBe('1.2.3-web')
    expect(metadata.getPlatform()).toBe('android')
  })
})

describe('detectBrowserPlatform', () => {
  // Agents copied from the runtimes this app actually ships to. The iOS group
  // decides whether the YouTube embed may be created with autoplay, so it is
  // pinned here rather than inferred.
  it('separates Android, Apple handhelds, and everything else', () => {
    expect(
      detectBrowserPlatform(
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe('android')
    expect(
      detectBrowserPlatform(
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36; wv',
      ),
    ).toBe('android')

    // iPhone Safari, the runtime where the embedded player was reported broken.
    expect(
      detectBrowserPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('ios')
    // The Capacitor WKWebView: WebKit's default agent minus Safari's own
    // tokens, since the app configures no appendUserAgent/overrideUserAgent.
    expect(
      detectBrowserPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      ),
    ).toBe('ios')
    expect(
      detectBrowserPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('ios')
    expect(
      detectBrowserPlatform(
        'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('ios')

    expect(
      detectBrowserPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ),
    ).toBe('web')
    expect(
      detectBrowserPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/133.0'),
    ).toBe('web')
    expect(detectBrowserPlatform('')).toBe('web')
  })
})

describe('selectPlatformAdapters', () => {
  it('does not construct native adapters outside Capacitor iOS', () => {
    const createNativeIOS = vi.fn(() => 'native')
    const createBrowser = vi.fn(() => 'browser')

    expect(selectPlatformAdapters({ createBrowser, createNativeIOS })).toBe('browser')
    expect(
      selectPlatformAdapters({
        capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
        createBrowser,
        createNativeIOS,
      }),
    ).toBe('browser')
    expect(
      selectPlatformAdapters({
        capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
        createBrowser,
        createNativeIOS,
      }),
    ).toBe('browser')
    expect(createNativeIOS).not.toHaveBeenCalled()
  })

  it('constructs native adapters only for confirmed Capacitor iOS', () => {
    const createNativeIOS = vi.fn(() => 'native')
    expect(
      selectPlatformAdapters({
        capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
        createBrowser: () => 'browser',
        createNativeIOS,
      }),
    ).toBe('native')
    expect(createNativeIOS).toHaveBeenCalledOnce()
  })
})
