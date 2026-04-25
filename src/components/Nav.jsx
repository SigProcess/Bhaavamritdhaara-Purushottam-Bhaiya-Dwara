export default function Nav({ activeTab, onTabChange }) {
  return (
    <nav>
      <a className="nav-logo" href="#">
        <div className="nav-logo-mark">&#x0950;</div>
        <div className="nav-title-group">
          <div className="nav-title">Bhaavamritdhaara</div>
          <div className="nav-subtitle">Purushottam Bhaiya Dwara</div>
        </div>
      </a>
      <div className="nav-right-wrap">
        <a
          href="/"
          className={`nav-tab ${activeTab === 'home' ? 'active' : ''}`}
          onClick={(event) => {
            event.preventDefault()
            onTabChange('home')
          }}
        >
          Home
        </a>
        <a
          href="/bhajans"
          className={`nav-tab ${activeTab === 'bhajans' ? 'active' : ''}`}
          onClick={(event) => {
            event.preventDefault()
            onTabChange('bhajans')
          }}
        >
          Bhajans PDFs
        </a>
      </div>
    </nav>
  )
}
