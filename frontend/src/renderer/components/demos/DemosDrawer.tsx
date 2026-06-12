/**
 * P3.5 — Demos Drawer (ONBOARDING-SPEC.md §3).
 *
 * A drawer (not a browser/shell/panel) that lists the three rendered demo
 * MP4s with inline playback. Slides open on first launch; reachable from
 * the browser tab surface afterward.
 *
 * Demo asset path is resolved from the ONE runtime-dir constant via IPC.
 * No hardcoded `~/.entropic` or `~/.creatrix` paths (ONBOARDING-SPEC §8
 * grep-check #2; P3.5 precondition).
 *
 * Reduced-motion paths (§5): no hover autoplay, no slide animation —
 * opacity-only or instant appearance; poster frame + play button instead
 * of auto-looping preview.
 */
import { useRef, useEffect, useState, useCallback } from 'react'
import { useOnboardingStore } from '../../stores/onboarding'
import { ONBOARDING } from '../../i18n/onboarding-strings'

export interface DemoMeta {
  id: string
  title: string
  body: string
  /** Absolute filesystem path to the MP4 (resolved by the parent from the
   *  runtime-dir constant — never hardcoded here). */
  filePath: string
}

/** The three canonical demos in spec order. */
export const DEMO_IDS = ['y_is_time', 'painted_blur', 'audio_lfo_stripes'] as const
export type DemoId = typeof DEMO_IDS[number]

function demoMeta(id: DemoId, filePath: string): DemoMeta {
  return {
    id,
    filePath,
    title: ONBOARDING[`drawer.card.${id}.title` as keyof typeof ONBOARDING] as string,
    body: ONBOARDING[`drawer.card.${id}.body` as keyof typeof ONBOARDING] as string,
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

interface DemoCardProps {
  demo: DemoMeta
  fileMissing: boolean
  onOpen: (demo: DemoMeta) => void
}

function DemoCard({ demo, fileMissing, onOpen }: DemoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [reducedMotion] = useState(prefersReducedMotion)

  const handleMouseEnter = useCallback(() => {
    if (reducedMotion || fileMissing) return
    const v = videoRef.current
    if (v && v.paused) {
      v.muted = true
      v.loop = true
      v.play().catch(() => undefined)
      setPlaying(true)
    }
  }, [reducedMotion, fileMissing])

  const handleMouseLeave = useCallback(() => {
    const v = videoRef.current
    if (v && !v.paused) {
      v.pause()
      v.currentTime = 0
      setPlaying(false)
    }
  }, [])

  const handleVideoClick = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.muted = true
      v.loop = true
      v.play().catch(() => undefined)
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }, [])

  return (
    <div
      className={`demos-card${fileMissing ? ' demos-card--missing' : ''}`}
      data-testid={`demo-card-${demo.id}`}
    >
      <div
        className="demos-card__media"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleVideoClick}
        aria-label={`Preview ${demo.title}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleVideoClick()
        }}
      >
        {fileMissing ? (
          <div className="demos-card__media-placeholder" aria-label="Demo file missing">
            <span className="demos-card__media-icon">⚠</span>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              src={`file://${demo.filePath}`}
              className="demos-card__video"
              muted
              loop
              playsInline
              preload="metadata"
              data-testid={`demo-video-${demo.id}`}
            />
            {!playing && (
              <div className="demos-card__play-overlay" aria-hidden="true">▶</div>
            )}
          </>
        )}
      </div>

      <div className="demos-card__body">
        <span
          className="demos-card__title"
          data-testid={`demo-title-${demo.id}`}
        >
          {demo.title}
        </span>
        <span
          className="demos-card__desc"
          data-testid={`demo-desc-${demo.id}`}
        >
          {fileMissing
            ? ONBOARDING['drawer.card.missing']
            : demo.body}
        </span>
      </div>

      {!fileMissing && (
        <button
          className="demos-card__open"
          onClick={() => onOpen(demo)}
          data-testid={`demo-open-${demo.id}`}
        >
          {ONBOARDING['drawer.card.open']}
        </button>
      )}
    </div>
  )
}

interface DemosDrawerProps {
  /**
   * Absolute paths for each demo, indexed by demo ID.
   * Missing entries mean the file was not found on disk.
   * Resolved by the parent from the ONE runtime-dir constant.
   */
  demoPaths: Record<DemoId, string | null>
  /** Called when the user clicks "open" on a demo card. */
  onOpenDemo?: (demoId: string) => void
}

export default function DemosDrawer({ demoPaths, onOpenDemo }: DemosDrawerProps) {
  const { drawerOpen, closeDrawer, dismiss, dismissed, recordEngagement } = useOnboardingStore()
  const drawerRef = useRef<HTMLDivElement>(null)

  // Keyboard: Esc closes the drawer (§5 — closes drawer, does not punish).
  useEffect(() => {
    if (!drawerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [drawerOpen, closeDrawer])

  // Focus management: focus first card on open (§5 — keyboard-operable).
  useEffect(() => {
    if (drawerOpen && drawerRef.current) {
      const first = drawerRef.current.querySelector<HTMLElement>('[data-testid^="demo-card-"]')
      if (first) first.focus()
    }
  }, [drawerOpen])

  const handleOpen = useCallback((demo: DemoMeta) => {
    recordEngagement()
    onOpenDemo?.(demo.id)
  }, [onOpenDemo, recordEngagement])

  const handleDismissChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      dismiss()
    }
  }, [dismiss])

  if (!drawerOpen) return null

  const demos: DemoMeta[] = DEMO_IDS.map((id) => demoMeta(id, demoPaths[id] ?? ''))

  return (
    <div
      className="demos-drawer"
      data-testid="demos-drawer"
      ref={drawerRef}
      role="dialog"
      aria-modal="false"
      aria-label={ONBOARDING['drawer.title']}
    >
      <div className="demos-drawer__header">
        <span className="demos-drawer__title" data-testid="demos-drawer-title">
          {ONBOARDING['drawer.title']}
        </span>
        <button
          className="demos-drawer__close"
          onClick={closeDrawer}
          aria-label="Close demos drawer"
          data-testid="demos-drawer-close"
        >
          ×
        </button>
      </div>

      <p className="demos-drawer__subtitle" data-testid="demos-drawer-subtitle">
        {ONBOARDING['drawer.subtitle']}
      </p>

      <div className="demos-drawer__cards" data-testid="demos-drawer-cards">
        {demos.map((demo) => (
          <DemoCard
            key={demo.id}
            demo={demo}
            fileMissing={demoPaths[demo.id as DemoId] === null}
            onOpen={handleOpen}
          />
        ))}
      </div>

      <div className="demos-drawer__footer" data-testid="demos-drawer-footer">
        <label className="demos-drawer__dismiss-label">
          <input
            type="checkbox"
            className="demos-drawer__dismiss-checkbox"
            checked={dismissed}
            onChange={handleDismissChange}
            data-testid="demos-drawer-dismiss-checkbox"
          />
          <span>{ONBOARDING['drawer.footer.dismiss']}</span>
        </label>
      </div>
    </div>
  )
}
