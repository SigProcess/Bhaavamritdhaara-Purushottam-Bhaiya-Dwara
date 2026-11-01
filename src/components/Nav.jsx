export default function Nav() {
  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <a className="nav-logo" href="/">
        <div className="nav-logo-mark" aria-hidden="true">&#x0950;</div>
        <div className="nav-title-group">
          <div className="nav-title">Bhaavamritdhaara</div>
          <div className="nav-subtitle">Purushottam Bhaiya Dwara</div>
        </div>
      </a>
      <div className="nav-right-wrap">
        <a className="nav-tab" href="#bhajan-finder">
          Bhajan Finder
        </a>
      </div>
    </nav>
  )
}
