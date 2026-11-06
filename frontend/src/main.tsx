import './product/qr-intent'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// El módulo de intención limpia el fragmento antes de solicitar las fuentes externas.
const fonts = document.createElement('link')
fonts.rel = 'stylesheet'
fonts.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700&display=swap'
fonts.referrerPolicy = 'no-referrer'
document.head.append(fonts)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
