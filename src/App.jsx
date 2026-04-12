import Nav from './components/Nav'
import Hero from './components/Hero'
import PlaylistSections from './components/PlaylistSections'
import PetalsLayer from './components/PetalsLayer'
import Footer from './components/Footer'

export default function App() {
  return (
    <div className="app">
      <video className="bg-video" autoPlay muted loop playsInline>
        <source src="/bg-video.mp4" type="video/mp4" />
      </video>
      <div className="bg-video-overlay" />
      <div className="bg-om">
        <div className="bg-om-text">ॐ</div>
      </div>
      <PetalsLayer />
      <Nav />
      <main>
        <Hero />
        <PlaylistSections />
      </main>
      <Footer />
    </div>
  )
}
