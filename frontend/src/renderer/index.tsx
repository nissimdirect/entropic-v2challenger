import * as Sentry from '@sentry/electron/renderer'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'
import './styles/tooltip.css'
import { applyCssDisableFlags } from '../shared/feature-flags'

Sentry.init()

// Toggle data-disable-f-0512-* attributes on <body> so CSS-only UAT fixes
// (thumb width, card width, transform-panel height) can be reverted via
// localStorage or env without rebuilding the JS bundle.
applyCssDisableFlags()

createRoot(document.getElementById('root')!).render(<App />)
