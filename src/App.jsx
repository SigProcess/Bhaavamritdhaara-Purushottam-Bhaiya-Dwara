import Nav from './components/Nav'
import Hero from './components/Hero'
import PlaylistSections from './components/PlaylistSections'
import PetalsLayer from './components/PetalsLayer'
import Footer from './components/Footer'

export default function App() {
  return (
    <div className="app">
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
