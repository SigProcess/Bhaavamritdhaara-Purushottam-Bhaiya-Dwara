import Nav from './components/Nav'
import Hero from './components/Hero'
import CardGrid from './components/CardGrid'
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
        <CardGrid />
      </main>
      <Footer />
    </div>
  )
}
