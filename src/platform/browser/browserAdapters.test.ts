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
    expect(detectBrowserPlatform('Mozilla/5.0 (Linux; Android 14)')).toBe('android')
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
