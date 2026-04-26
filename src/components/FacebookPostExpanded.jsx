import { useEffect } from 'react'

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

export default function FacebookPostExpanded({ post, onClose }) {
  const commentScreenshots = post.commentScreenshots || []

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fb-lightbox" onClick={onClose}>
      <div className="fb-lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button className="fb-lightbox-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="fb-lightbox-scroll">
          <img className="fb-lightbox-img" src={post.thumb} alt={post.title} />

          {commentScreenshots.length > 0 && (
            <div className="fb-lightbox-comments">
              <div className="fb-lightbox-comments-label">Replies by Purushottam Bhaiya</div>
              {commentScreenshots.map((src, i) => (
                <img
                  key={i}
                  className="fb-lightbox-comment-img"
                  src={src}
                  alt={`Comment ${i + 1}`}
                />
              ))}
            </div>
          )}

          <a
            className="fb-lightbox-link"
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLinkIcon />
            Open on Facebook
          </a>
        </div>
      </div>
    </div>
  )
}
