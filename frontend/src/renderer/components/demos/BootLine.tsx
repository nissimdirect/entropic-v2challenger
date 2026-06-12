/**
 * P3.5 — Boot line component (ONBOARDING-SPEC.md §2).
 *
 * TE-style identity beat. One line, IBM Plex Mono, types on over ≤1.0 s
 * in the statusbar region (not a splash screen — the app is interactive
 * immediately underneath). Renders on every launch, not just first launch.
 *
 * Reduced motion: the line renders instantly, no type-on animation.
 * No RGB-split flicker — the sanctioned glitch moment (DESIGN-SPEC §5)
 * stays reserved for render-complete and destructive-confirm; the boot
 * is calm.
 */
import { useState, useEffect, useRef } from 'react'
import { ONBOARDING } from '../../i18n/onboarding-strings'

interface BootLineProps {
  /** App version from package.json (e.g. "3.0.0"). Never hardcoded. */
  appVersion: string
  /** Live effect count from the registry. Never hardcoded. */
  effectCount: number
}

// Total typewriter duration in ms (≤1000 per spec §2).
const TYPE_DURATION_MS = 900

function buildLine(appVersion: string, effectCount: number): string {
  return ONBOARDING['boot.line']
    .replace('{appVersion}', appVersion)
    .replace('{effectCount}', String(effectCount))
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export default function BootLine({ appVersion, effectCount }: BootLineProps) {
  const fullText = buildLine(appVersion, effectCount)
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const startRef = useRef<number>(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    // Reduced motion: render instantly, no type-on.
    if (prefersReducedMotion()) {
      setDisplayed(fullText)
      setDone(true)
      return
    }

    const len = fullText.length
    if (len === 0) {
      setDone(true)
      return
    }

    startRef.current = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / TYPE_DURATION_MS, 1)
      const chars = Math.floor(progress * len)
      setDisplayed(fullText.slice(0, chars))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplayed(fullText)
        setDone(true)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [fullText])

  if (done && displayed === fullText) {
    // Fade out after a short hold (matches 140ms exit timing from DESIGN-SPEC §3).
    return (
      <span
        className="boot-line boot-line--done"
        data-testid="boot-line"
        aria-live="off"
      >
        {fullText}
      </span>
    )
  }

  return (
    <span
      className="boot-line"
      data-testid="boot-line"
      aria-live="off"
    >
      {displayed}
      <span className="boot-line__cursor" aria-hidden="true">▌</span>
    </span>
  )
}
