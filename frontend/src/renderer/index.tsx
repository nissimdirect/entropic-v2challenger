import * as Sentry from '@sentry/electron/renderer'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

Sentry.init()

createRoot(document.getElementById('root')!).render(<App />)
