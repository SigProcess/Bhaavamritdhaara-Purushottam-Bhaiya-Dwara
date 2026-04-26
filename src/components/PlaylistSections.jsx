import { useState } from 'react'
import data from '../data/playlists.json'
import facebookLinks from '../data/facebookLinks.json'
import { CollectionCardButton, CollectionExpanded } from './CollectionCard'
import Card from './Card'
import FacebookPostExpanded from './FacebookPostExpanded'

export default function PlaylistSections() {
  const [expandedId, setExpandedId] = useState(null)
  const [expandedFbId, setExpandedFbId] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedTag, setSelectedTag] = useState('All')

  const handleToggle = (id) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const handleFbToggle = (id) => {
    setExpandedFbId(expandedFbId === id ? null : id)
  }

  const expandedCollection = data.collections.find((c) => c.id === expandedId)
  const visibleFacebookLinks = facebookLinks.filter((link) => link.visible !== false)

  const categories = [
    'All',
    ...new Set(visibleFacebookLinks.map((link) => link.category).filter(Boolean)),
  ]

  const tags = [
    'All',
    ...new Set(
      visibleFacebookLinks.flatMap((link) =>
        Array.isArray(link.tags)
          ? link.tags
          : String(link.tags || '')
              .split(/[|,]/)
              .map((tag) => tag.trim())
              .filter(Boolean)
      )
    ),
  ]

  const filteredFacebookLinks = visibleFacebookLinks.filter((link) => {
    const categoryOk = selectedCategory === 'All' || link.category === selectedCategory
    const linkTags = Array.isArray(link.tags)
      ? link.tags
      : String(link.tags || '')
          .split(/[|,]/)
          .map((tag) => tag.trim())
          .filter(Boolean)
    const tagOk = selectedTag === 'All' || linkTags.includes(selectedTag)
    return categoryOk && tagOk
  })

  const expandedFbPost = filteredFacebookLinks.find((link) => link.id === expandedFbId)

  return (
    <div className="sections-container">
      <div className="section-heading">Collections</div>
      <div className="section-subheading">Curated series of bhajans and pravachans</div>
      <div className="collections-grid">
        {data.collections.map((col, i) => (
          <CollectionCardButton
            key={col.id}
            collection={col}
            isExpanded={expandedId === col.id}
            onToggle={() => handleToggle(col.id)}
            index={i}
          />
        ))}
      </div>
      {expandedCollection && (
        <CollectionExpanded
          key={expandedCollection.id}
          collection={expandedCollection}
        />
      )}

      {data.playlists.length > 0 && (
        <div className="playlists-section">
          <div className="section-heading">More Playlists</div>
          <div className="section-subheading">Individual devotional playlists</div>
          <div className="playlists-grid">
            {data.playlists.map((p, i) => (
              <Card key={p.id} playlist={p} index={i} />
            ))}
          </div>
        </div>
      )}

      {visibleFacebookLinks.length > 0 && (
        <div className="playlists-section">
          <div className="section-heading">Facebook Updates</div>
          <div className="section-subheading">Posts and replies by Purushottam Bhaiya</div>
          <div className="facebook-filters">
            <label className="facebook-filter">
              <span>Category</span>
              <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="facebook-filter">
              <span>Tag</span>
              <select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)}>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="playlists-grid">
            {filteredFacebookLinks.map((link, i) => (
              <Card
                key={link.id}
                playlist={link}
                index={i}
                ctaLabel="View"
                onClick={() => handleFbToggle(link.id)}
              />
            ))}
          </div>
          {expandedFbPost && (
            <FacebookPostExpanded
              key={expandedFbPost.id}
              post={expandedFbPost}
              onClose={() => setExpandedFbId(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}
