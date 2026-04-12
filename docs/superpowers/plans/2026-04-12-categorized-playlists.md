# Categorized Playlists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the flat 4-card playlist grid into a sectioned layout with 59 playlists: expandable "Collections" at top, individual "All Playlists" below.

**Architecture:** Replace `CardGrid` with `PlaylistSections` component that renders two sections. Collections use `CollectionCard` with expand/collapse state (only one open at a time). Individual playlists use a simplified `Card` (title + play button, no image area). Data restructured from flat array to `{ collections, playlists }` in JSON.

**Tech Stack:** React 18, CSS (existing stylesheet extended)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/data/playlists.json` | Rewrite | Restructured data: collections + individual playlists |
| `src/components/CardGrid.jsx` | Delete | No longer needed |
| `src/components/PlaylistSections.jsx` | Create | Renders both sections, manages which collection is expanded |
| `src/components/CollectionCard.jsx` | Create | Single collection card with expand/collapse + sub-playlist grid |
| `src/components/Card.jsx` | Rewrite | Simplified card: title + play button (no image area) |
| `src/App.jsx` | Modify | Swap CardGrid for PlaylistSections |
| `src/App.css` | Modify | Add collection and section styles |

---

### Task 1: Rewrite playlists.json with all 59 playlists

**Files:**
- Rewrite: `src/data/playlists.json`

- [ ] **Step 1: Replace playlists.json with the new structure**

Write to `src/data/playlists.json`:

```json
{
  "collections": [
    {
      "id": "anand-pranami",
      "title": "Anand Pranami Bhajans",
      "playlists": [
        { "id": 1, "title": "Anand Pranami 13", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1brovn9jKAndOixHYCu4ZLD" },
        { "id": 2, "title": "Anand Pranami 12", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1adwEkF_ib_6U2LkZPmFSen" },
        { "id": 3, "title": "Anand Pranami 11", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1Yt1Vh4XGQxieiFATxOeGdl" },
        { "id": 4, "title": "Anand Pranami 10", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ZEWK_i9GM-hhlfr5CusPdr" },
        { "id": 5, "title": "Anand Pranami 9", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1aJibZjtm1_4ksVfhmEDH9v" },
        { "id": 6, "title": "Anand Pranami 8", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ZUzO0EZIQLWeU3viqNUnp_" },
        { "id": 7, "title": "Anand Pranami 7", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1b_yI8tWH2pTjAwDdovOftp" },
        { "id": 8, "title": "Anand Pranami 5", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1bcYaetCvyHL4dFYEn_7vy4" },
        { "id": 9, "title": "Anand Pranami 4", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1a7hUMOW903-v-qmJXxCqVT" },
        { "id": 10, "title": "Anand Pranami 3", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1bxn8XAdVsAxU_QzCWSFCQe" },
        { "id": 11, "title": "Anand Pranami 2", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1adbAmj-Xq-EZuPRoLH6fUh" },
        { "id": 12, "title": "Anand Pranami 1", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1YegHY-YtvXbW35YA9HvBB5" },
        { "id": 13, "title": "Aanand Pranami Bhajans", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1aCZ-ZeGw5VtpOzRk0iVoeD" },
        { "id": 14, "title": "Anand Pranami Bhajans (Set A)", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1YzVj4weYumjoIU1U-0zSGn" },
        { "id": 15, "title": "Anand Pranami Bhajans (Set B)", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1Z8SzRAsbxzkDTi1C2JOP7U" }
      ]
    },
    {
      "id": "raaj-maan",
      "title": "Raaj Maan Diaries",
      "playlists": [
        { "id": 16, "title": "Raaj Maa First Diary", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1YMjahWF2w1mWu8Pq3wDrvt" },
        { "id": 17, "title": "Raaj Maan ki Doosri Diary", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1bUu2X-RL_So5Ur_NISgB7y" },
        { "id": 18, "title": "Raaj Maa Third and Fourth Diary", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1awsfXZtiTNL6kbNaDKgCz9" },
        { "id": 19, "title": "Raaj Maan Fifth and Sixth Diary", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1bZOQYs5XI4kvoERYheC-lp" }
      ]
    },
    {
      "id": "bibiji",
      "title": "Bibiji",
      "playlists": [
        { "id": 20, "title": "Nandan Kaanan", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1YXuNhT4h0h2iUyCAccYDj0" }
      ]
    },
    {
      "id": "mausiji",
      "title": "Mausiji",
      "playlists": [
        { "id": 21, "title": "Sulochana Mausi Ji ke Naye Lekh", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1aNZT8pWpxrS-Cc9ptH5d07" }
      ]
    }
  ],
  "playlists": [
    { "id": 22, "title": "Vani Vishleshan and Pravachan", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1Y3IyLeKcg__-Z3BGOiwKwh" },
    { "id": 23, "title": "Vani Vishleshan by Shri Purushottam Bhaiya, 2022", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ZTwQUDcbwJNdtS42J63wd7" },
    { "id": 24, "title": "Gyan Vani", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1a9uHY5qXUnsVcS0RXWKNe2" },
    { "id": 25, "title": "Sukh Lekh Vishleshan by Purushottam Bhaiya", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ZNkWj5X9UlTAM_9xGxZGql" },
    { "id": 26, "title": "Dharm hai ya Shishtaachaar", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1Y06TsBWQx0DHSqlXRE1Ku4" },
    { "id": 27, "title": "Spiritual Bhajans", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1Z9bVYZpUXi8KBmWP8TNd54" },
    { "id": 28, "title": "Bhhav-Kann", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ZAaoMBrNS0yZj-6gk23orf" },
    { "id": 29, "title": "Sumir-Sumir Man Baaware", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1YmmByMf8JuNdBSBR6Wh04D" },
    { "id": 30, "title": "Madhuban Hriday hai Mera", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1bJ659qDxqWdK2GfB9yV5f8" },
    { "id": 31, "title": "Digambar Tera Roop", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ZHEJXJhBkUSs1F0b5FGLU1" },
    { "id": 32, "title": "Aaj Tera Saaj ya Raaj", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ZBa-uMHkCvP8gO36KbGUhS" },
    { "id": 33, "title": "Anjaane Anmaane Bhagwaan", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ZP7HrekgQ-dHdg5-ZGrve1" },
    { "id": 34, "title": "Tera Saurabh", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1YEWyEfUngLXS4tWXaMDSBx" },
    { "id": 35, "title": "Kya Doon?", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1a_9O7UPw67Sy2Dcw9J02YE" },
    { "id": 36, "title": "Ye Kaliyaan", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1YhVARMFd6X1UbNi_MoekHH" },
    { "id": 37, "title": "Kaisa Bhool Bhulaiya", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ZJpdr0Vdp8hJasI0Hc2lFv" },
    { "id": 38, "title": "Mukti Mahaan", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ZiAw-XEIooAWmnWCbSmTqA" },
    { "id": 39, "title": "Bhakti hi Kyon?", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1aLme1rJfTWS7wkVEFF-iEm" },
    { "id": 40, "title": "Anant ka Chakra", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1awTuPab4BHUWI7kFaogDok" },
    { "id": 41, "title": "Shanti ka Udgam", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1YUZxS_OW-fQguDXtZztCP3" },
    { "id": 42, "title": "Kaam Tera Naam Mera", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1bOeJmSskRhG3N03ErR6-Qe" },
    { "id": 43, "title": "Prakriti aur Swabhaav", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1Zp0FN8lSCa-Z_QsaIiLeqI" },
    { "id": 44, "title": "Prakritik Bhajan", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ZIkqFR_SF_S4r217ZvPfo4" },
    { "id": 45, "title": "Kyon?", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1YZnfgh5vP70fLFeVTEzOU7" },
    { "id": 46, "title": "Anaami ka Naam", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1bnas1UyRdL-DockmUjS5yI" },
    { "id": 47, "title": "Aanand Kahan", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1Yjs92shoY4Su8lpEFQIaZI" },
    { "id": 48, "title": "Aanand", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1Y8S2NxJBg0EY3XA2fzqTHB" },
    { "id": 49, "title": "Samadhi", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ZU4gebkbdKa8Prcdf31-co" },
    { "id": 50, "title": "Dukh", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1YwRRQsA6DRi4dyaj_DS8Zn" },
    { "id": 51, "title": "Meri Aakhon Mein Dekh", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1YSSnETY6LwXjVYcR2EEHJU" },
    { "id": 52, "title": "Bhav mein Abhaav", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1YOgsjfy3Rj0-T8CdXprY1R" },
    { "id": 53, "title": "Bhaav-Yog", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1aa1-UzSax9I3cm0ZY6rDRq" },
    { "id": 54, "title": "Karm-Gyan ka Avsaan", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1ayD2wSaMyPoJwe4SGqAnUc" },
    { "id": 55, "title": "Prani ki Prerna", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1Y02kCK8neaDJPQK75Me0-S" },
    { "id": 56, "title": "Chintan Manan Dhvani", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1Yd8UP_WzIDPKqfQhVW3Yj-" },
    { "id": 57, "title": "Aanand Path", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1aRm1N715TynmDN1KYnh4kx" },
    { "id": 58, "title": "Man aur Tan", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1blvm6VcYQ3arehSXVFZIbM" },
    { "id": 59, "title": "Mere Sathi", "url": "https://www.youtube.com/playlist?list=PLKsNVSr36o1b8NjhYioElAOki0mlYWvvD" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/playlists.json
git commit -m "feat: restructure playlists.json with collections and all 59 playlists"
```

---

### Task 2: Add CSS styles for collections and sections

**Files:**
- Modify: `src/App.css` (append new styles at end)

- [ ] **Step 1: Append new styles to App.css**

Add the following to the end of `src/App.css` (after the existing `.footer-om` rule):

```css

/* === Sections === */
.sections-container{padding:0 1.5rem 6rem;max-width:1280px;margin:0 auto;position:relative;z-index:10}
.section-label{
text-align:center;font-family:'Jost',sans-serif;font-size:0.68rem;letter-spacing:0.25em;
text-transform:uppercase;color:var(--sage);margin-bottom:2rem;
}

/* === Collection Cards === */
.collections-grid{
display:grid;grid-template-columns:repeat(2,1fr);gap:1.5rem;margin-bottom:1rem;
}
@media(min-width:1024px){.collections-grid{grid-template-columns:repeat(4,1fr);gap:1.75rem}}

.collection-card{
background:rgba(245,240,232,0.88);border-radius:16px;
border:2px solid rgba(212,175,55,0.4);position:relative;cursor:pointer;
padding:20px 16px;text-align:center;
transition:transform 0.4s cubic-bezier(.23,1,.32,1),box-shadow 0.4s ease,border-color 0.3s ease;
animation:fadeInUp 0.7s ease both;backdrop-filter:blur(8px);
}
.collection-card:hover{
transform:translateY(-6px) scale(1.02);
box-shadow:0 16px 40px rgba(45,90,39,0.18),0 0 0 1px rgba(212,175,55,0.5);
border-color:var(--gold);
}
.collection-card.expanded{
border-color:var(--gold);
box-shadow:0 8px 24px rgba(45,90,39,0.15),0 0 0 1px rgba(212,175,55,0.5);
transform:translateY(-2px);
}
.collection-card-title{
font-family:'Playfair Display',serif;font-size:1rem;color:var(--dark-green);
font-weight:600;line-height:1.3;margin-bottom:6px;
}
.collection-card-count{
font-family:'Jost',sans-serif;font-size:0.65rem;letter-spacing:0.15em;
text-transform:uppercase;color:var(--sage);
}
.collection-card-icon{
font-size:0.75rem;color:var(--gold);margin-top:8px;
transition:transform 0.3s ease;display:inline-block;
}
.collection-card.expanded .collection-card-icon{transform:rotate(180deg)}

/* === Expanded Sub-Playlists === */
.collection-expanded-wrap{
overflow:hidden;transition:max-height 0.4s ease;max-height:0;
}
.collection-expanded-wrap.open{max-height:600px}
.collection-expanded{
background:rgba(45,90,39,0.08);border-radius:12px;
border:1px solid rgba(212,175,55,0.2);
padding:16px;margin-bottom:2.5rem;
}
.sub-playlists-grid{
display:grid;grid-template-columns:repeat(2,1fr);gap:10px;
}
@media(min-width:768px){.sub-playlists-grid{grid-template-columns:repeat(3,1fr)}}

.sub-playlist-btn{
display:flex;align-items:center;gap:8px;
padding:10px 14px;border-radius:8px;border:none;cursor:pointer;
background:rgba(45,90,39,0.15);color:var(--dark-green);
font-family:'Jost',sans-serif;font-size:0.78rem;font-weight:400;
text-align:left;width:100%;
transition:background 0.2s ease,transform 0.2s ease;
}
.sub-playlist-btn:hover{
background:rgba(45,90,39,0.25);transform:translateY(-2px);
}
.sub-playlist-btn .play-icon{width:12px;height:12px;flex-shrink:0;color:var(--gold)}

/* === Individual Playlist Cards (simplified) === */
.playlists-section{margin-top:3rem}
.playlists-grid{
display:grid;grid-template-columns:repeat(2,1fr);gap:1.5rem;
}
@media(min-width:768px){.playlists-grid{grid-template-columns:repeat(3,1fr);gap:1.75rem}}
@media(min-width:1024px){.playlists-grid{grid-template-columns:repeat(4,1fr);gap:1.75rem}}

.playlist-card{
background:rgba(245,240,232,0.88);border-radius:12px;
border:1px solid rgba(212,175,55,0.2);position:relative;cursor:pointer;
padding:16px;
transition:transform 0.4s cubic-bezier(.23,1,.32,1),box-shadow 0.4s ease;
animation:fadeInUp 0.7s ease both;backdrop-filter:blur(8px);
}
.playlist-card:hover{
transform:translateY(-6px) scale(1.02);
box-shadow:0 16px 40px rgba(45,90,39,0.15),0 0 0 1px rgba(212,175,55,0.4);
}
.playlist-card-title{
font-family:'Playfair Display',serif;font-size:0.9rem;color:var(--dark-green);
font-weight:600;line-height:1.3;margin-bottom:10px;
}
.playlist-card-btn{
display:flex;align-items:center;justify-content:center;gap:7px;
width:100%;padding:8px 0;border-radius:8px;border:none;cursor:pointer;
font-family:'Jost',sans-serif;font-size:0.68rem;font-weight:500;letter-spacing:0.12em;
text-transform:uppercase;color:var(--dark-green);
background:linear-gradient(135deg,#D4AF37,#F0D060,#C8941A);
position:relative;overflow:hidden;
transition:opacity 0.2s ease,transform 0.2s ease;
}
.playlist-card-btn::before{
content:'';position:absolute;inset:0;
background:linear-gradient(135deg,rgba(255,255,255,0.25),transparent,rgba(255,255,255,0.1));
}
.playlist-card-btn:hover{opacity:0.92;transform:scale(0.98)}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.css
git commit -m "feat: add CSS styles for collections and sectioned layout"
```

---

### Task 3: Create CollectionCard component

**Files:**
- Create: `src/components/CollectionCard.jsx`

- [ ] **Step 1: Create CollectionCard.jsx**

Write to `src/components/CollectionCard.jsx`:

```jsx
function PlayIcon() {
  return (
    <svg className="play-icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  )
}

export default function CollectionCard({ collection, isExpanded, onToggle }) {
  return (
    <div>
      <div
        className={`collection-card${isExpanded ? ' expanded' : ''}`}
        onClick={onToggle}
      >
        <div className="collection-card-title">{collection.title}</div>
        <div className="collection-card-count">
          {collection.playlists.length} {collection.playlists.length === 1 ? 'playlist' : 'playlists'}
        </div>
        <div className="collection-card-icon">▼</div>
      </div>
      <div className={`collection-expanded-wrap${isExpanded ? ' open' : ''}`}>
        <div className="collection-expanded">
          <div className="sub-playlists-grid">
            {collection.playlists.map((p) => (
              <button
                key={p.id}
                className="sub-playlist-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  window.open(p.url, '_blank')
                }}
              >
                <PlayIcon />
                {p.title}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CollectionCard.jsx
git commit -m "feat: add CollectionCard component with expand/collapse"
```

---

### Task 4: Create PlaylistSections component and simplified Card

**Files:**
- Create: `src/components/PlaylistSections.jsx`
- Rewrite: `src/components/Card.jsx`

- [ ] **Step 1: Create PlaylistSections.jsx**

Write to `src/components/PlaylistSections.jsx`:

```jsx
import { useState } from 'react'
import data from '../data/playlists.json'
import CollectionCard from './CollectionCard'
import Card from './Card'

export default function PlaylistSections() {
  const [expandedId, setExpandedId] = useState(null)

  const handleToggle = (id) => {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div className="sections-container">
      <div className="section-label">Collections</div>
      <div className="collections-grid">
        {data.collections.map((col) => (
          <CollectionCard
            key={col.id}
            collection={col}
            isExpanded={expandedId === col.id}
            onToggle={() => handleToggle(col.id)}
          />
        ))}
      </div>

      <div className="playlists-section">
        <div className="section-label">All Playlists</div>
        <div className="playlists-grid">
          {data.playlists.map((p, i) => (
            <Card key={p.id} playlist={p} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite Card.jsx as a simplified playlist card**

Write to `src/components/Card.jsx`:

```jsx
function PlayIcon() {
  return (
    <svg className="play-icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  )
}

export default function Card({ playlist, index }) {
  const delay = `${0.1 + index * 0.08}s`

  return (
    <div
      className="playlist-card"
      style={{ animationDelay: delay }}
      onClick={() => window.open(playlist.url, '_blank')}
    >
      <div className="playlist-card-title">{playlist.title}</div>
      <button className="playlist-card-btn">
        <PlayIcon />
        Play
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/PlaylistSections.jsx src/components/Card.jsx
git commit -m "feat: add PlaylistSections and simplify Card for individual playlists"
```

---

### Task 5: Wire up App.jsx and delete CardGrid

**Files:**
- Modify: `src/App.jsx`
- Delete: `src/components/CardGrid.jsx`

- [ ] **Step 1: Update App.jsx to use PlaylistSections**

Replace the contents of `src/App.jsx` with:

```jsx
import Nav from './components/Nav'
import Hero from './components/Hero'
import PlaylistSections from './components/PlaylistSections'
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
        <PlaylistSections />
      </main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 2: Delete CardGrid.jsx**

```bash
rm src/components/CardGrid.jsx
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git rm src/components/CardGrid.jsx
git commit -m "feat: wire up PlaylistSections in App, remove CardGrid"
```

---

### Task 6: Verify build and test in browser

- [ ] **Step 1: Run the build**

```bash
cd "/Users/tasharma/Downloads/Bhaiya Website/Bhaavamritdhaara-Purushottam-Bhaiya-Dwara"
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Start dev server and verify in browser**

```bash
npm run dev
```

Open http://localhost:5173 and verify:
- "Collections" section at top with 4 collection cards (Anand Pranami, Raaj Maan, Bibiji, Mausiji)
- Each collection card shows title and playlist count
- Clicking a collection expands sub-playlists below with slide animation
- Clicking another collection collapses the previous and expands the new one
- Clicking the same collection collapses it
- Sub-playlist buttons open YouTube in a new tab
- "All Playlists" section below with ~38 individual playlist cards
- Individual cards show title + play button, open YouTube on click
- Floating petals, background Om, nav, hero, footer all still work
- Responsive: 2 columns on mobile, 4 on desktop for collections; 2/3/4 for playlists

- [ ] **Step 3: Commit any fixes if needed**

---

### Task 7: Push to GitHub

- [ ] **Step 1: Push changes**

```bash
cd "/Users/tasharma/Downloads/Bhaiya Website/Bhaavamritdhaara-Purushottam-Bhaiya-Dwara"
git push origin main
```

Expected: All new commits pushed to `SigProcess/Bhaavamritdhaara-Purushottam-Bhaiya-Dwara`.
