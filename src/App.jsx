import { useEffect, useState } from 'react'
import Nav from './components/Nav'
import Hero from './components/Hero'
import PlaylistSections from './components/PlaylistSections'
import Footer from './components/Footer'
import BhajansPage from './components/BhajansPage'

function getTabFromPath(pathname) {
  if (pathname === '/bhajans' || pathname === '/bhajans/') {
    return 'bhajans'
  }

  return 'home'
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => getTabFromPath(window.location.pathname))

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromPath(window.location.pathname))
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleTabChange = (tab) => {
    const nextPath = tab === 'bhajans' ? '/bhajans' : '/'

    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }

    setActiveTab(tab)
  }

  return (
    <div className="app">
      <div className="bg-grain" />
      <div className="bg-glow-top" />
      <div className="bg-glow-bottom" />
      <Nav activeTab={activeTab} onTabChange={handleTabChange} />
      <main>
        {activeTab === 'home' ? (
          <>
            <Hero />
            <div className="section-break">
              <div className="section-break-line" />
              <div className="section-break-icon">&#x0950;</div>
              <div className="section-break-line" />
            </div>
            <PlaylistSections />
          </>
        ) : (
          <BhajansPage />
        )}
      </main>
      <Footer />
    </div>
  )
}
