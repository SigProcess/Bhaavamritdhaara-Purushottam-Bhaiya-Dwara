export default function Footer({ onOpenPrivacy, privacyButtonRef }) {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-text">
          May your soul find peace and liberation through the sacred sounds
          <span className="hi"> · सुनें, गाएँ और भाव में डूबें।</span>
        </div>
        <button
          ref={privacyButtonRef}
          className="footer-privacy-button"
          type="button"
          onClick={onOpenPrivacy}
          aria-label="Open Privacy Notice"
        >
          Privacy Notice
        </button>
        <div className="footer-ornament" aria-hidden="true">
          <div className="footer-ornament-line" />
          <div className="footer-om">&#x0950;</div>
          <div className="footer-ornament-line r" />
        </div>
      </div>
    </footer>
  )
}
