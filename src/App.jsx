import Nav from './components/Nav'
import Hero from './components/Hero'
import BhajanFinder from './components/BhajansPage'
import PlaylistSections from './components/PlaylistSections'
import BooksSection from './components/BooksSection'
import Footer from './components/Footer'

export default function App() {
  return (
    <div className="app">
      <div className="bg-grain" />
      <div className="bg-glow-top" />
      <div className="bg-glow-bottom" />
      <Nav />
      <main>
        <Hero />
        <div className="section-break">
          <div className="section-break-line" />
          <div className="section-break-icon">&#x0950;</div>
          <div className="section-break-line" />
        </div>
        <BhajanFinder />
        <div className="section-break">
          <div className="section-break-line" />
          <div className="section-break-icon">&#x0950;</div>
          <div className="section-break-line" />
        </div>
        <PlaylistSections />
        <div className="section-break">
          <div className="section-break-line" />
          <div className="section-break-icon">&#x0950;</div>
          <div className="section-break-line" />
        </div>
        <BooksSection />
      </main>
      <Footer />
    </div>
  )
}
