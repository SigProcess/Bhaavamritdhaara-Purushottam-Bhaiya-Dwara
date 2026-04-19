export default function Hero() {
  return (
    <div className="hero">
      <div className="hero-banner">
        <img
          className="hero-banner-img"
          src="/bhaiya-altar.jpg"
          alt="Sacred altar with garlands and offerings"
        />
        <div className="hero-banner-overlay" />
        <div className="hero-banner-content">
          <div className="hero-portrait-wrap">
            <img
              className="hero-portrait"
              src="/bhaiya-portrait.jpg"
              alt="Shri Purushottam Bhaiya"
            />
          </div>
          <div className="hero-text">
            <div className="hero-eyebrow">Bhajans, Pravachans, lekh and Vani Vishleshan</div>
            <h1 className="hero-title">
              Bhaavamrit Dhaara
            </h1>
            <p className="hero-subtitle">Purushottam Bhaiya Dwara</p>
            <p className="hero-desc">
              A collection of sacred devotional offerings streaming the nectar of divine emotion.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
