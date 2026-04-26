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

  return (
    <div className="fb-expanded-wrap">
      <div className="fb-expanded">
        <div className="fb-expanded-header">
          <div className="fb-expanded-title">{post.title}</div>
          <button className="fb-expanded-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="fb-expanded-post-img">
          <img src={post.thumb} alt={post.title} loading="lazy" />
        </div>

        {commentScreenshots.length > 0 && (
          <div className="fb-expanded-comments">
            <div className="fb-expanded-comments-label">Replies by Purushottam Bhaiya</div>
            {commentScreenshots.map((src, i) => (
              <img
                key={i}
                className="fb-expanded-comment-img"
                src={src}
                alt={`Comment ${i + 1}`}
                loading="lazy"
              />
            ))}
          </div>
        )}

        <a
          className="fb-expanded-link"
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLinkIcon />
          Open on Facebook
        </a>
      </div>
    </div>
  )
}
