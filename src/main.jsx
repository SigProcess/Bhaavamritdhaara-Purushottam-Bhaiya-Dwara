import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

if ('serviceWorker' in navigator) {
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })

  navigator.serviceWorker.ready.then((registration) => {
    setInterval(() => registration.update(), 5 * 60 * 1000)
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
