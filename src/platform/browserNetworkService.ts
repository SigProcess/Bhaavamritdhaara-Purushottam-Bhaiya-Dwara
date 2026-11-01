import type {
  NetworkService,
  NetworkStatus,
  Unsubscribe,
} from '../domain/contracts'

function browserStatus(): NetworkStatus {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return 'unknown'
  }
  return navigator.onLine ? 'online' : 'offline'
}

/** Browser connectivity adapter; request outcomes remain the final authority. */
export class BrowserNetworkService implements NetworkService {
  async currentStatus(): Promise<NetworkStatus> {
    return browserStatus()
  }

  subscribe(listener: (status: NetworkStatus) => void): Unsubscribe {
    if (typeof window === 'undefined') return () => {}
    const online = () => listener('online')
    const offline = () => listener('offline')
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }
}
