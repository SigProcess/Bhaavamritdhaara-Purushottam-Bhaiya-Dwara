import { LotusIcon } from './LotusIcon'

export default function Nav() {
  return (
    <nav>
      <a className="nav-logo" href="#">
        <LotusIcon size={38} />
        <div>
          <div className="nav-title">Bhaavamritdhaara</div>
          <div className="nav-subtitle">Purushottam Bhaiya Dwara</div>
        </div>
      </a>
      <div className="nav-right">ॐ Anand Pranami Series</div>
    </nav>
  )
}
