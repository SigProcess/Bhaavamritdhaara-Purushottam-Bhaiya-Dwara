const books = [
  {
    id: 'rom-rom-ga-raha',
    title: 'रोम रोम गा रहा',
    subtitle: 'भाव',
    pages: 234,
    cover: '/book-rom-rom-cover.jpeg',
    pdf: '/rom-rom-ga-raha.pdf',
  },
  {
    id: 'krishna-arjun',
    title: 'कृष्ण अर्जुन',
    subtitle: 'भाव निर्झरिणी',
    author: 'आनन्दघन (विश्लेषण: पुरुषोत्तम शर्मा)',
    pages: 54,
    cover: '/book-krishna-arjun-cover.jpeg',
    pdf: '/krishna-arjun.pdf',
  },
  {
    id: 'swarn-kalash',
    title: 'स्वर्ण कलश',
    pages: 152,
    cover: '/book-swarn-kalash-cover.jpeg',
    pdf: '/swarn-kalash.pdf',
  },
]

export default function BooksSection() {
  return (
    <section className="books-section">
      <div className="section-heading">Published Books</div>
      <div className="section-subheading">Sacred texts for devotional reading</div>
      <div className="books-grid">
        {books.map((book, i) => (
          <a
            key={book.id}
            className="book-card"
            href={book.pdf}
            target="_blank"
            rel="noopener noreferrer"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div className="book-card-cover">
              <img src={book.cover} alt={book.title} />
            </div>
            <div className="book-card-body">
              <div className="book-card-title">{book.title}</div>
              {book.subtitle && (
                <div className="book-card-subtitle">{book.subtitle}</div>
              )}
              {book.author && (
                <div className="book-card-author">{book.author}</div>
              )}
              <div className="book-card-meta">{book.pages} pages</div>
              <div className="book-card-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                Read Book
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
