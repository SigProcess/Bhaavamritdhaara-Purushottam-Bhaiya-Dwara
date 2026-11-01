import AppProviders from './app/AppProviders'
import AppShell from './app/AppShell'

/** @param {Omit<import('./app/AppProviders').AppProvidersProps, 'children'>} props */
export default function App({ services, catalogRepository } = {}) {
  return (
    <AppProviders services={services} catalogRepository={catalogRepository}>
      <AppShell />
    </AppProviders>
  )
}
