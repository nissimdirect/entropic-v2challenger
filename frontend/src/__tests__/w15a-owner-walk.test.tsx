/**
 * w15a-owner-walk.test.tsx — W1.5a owner-directed quick-fix oracle (A2
 * row-level pattern, one block per item — see w1-first-light.test.ts for
 * the shape this follows). QF1/QF2/QF3 are markup/CSS/config changes with
 * no interesting render-time behavior beyond "the fix is actually in
 * source," so those use the same source-grep pattern as w1-first-light.
 * QF4 is store-logic behavior (a state leak, not markup), so it gets a real
 * render/store test instead of a grep — proving the bug is actually fixed,
 * not just that some string appears in a file.
 */
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { render, cleanup } from '@testing-library/react'

const RENDERER = path.join(__dirname, '../renderer')
const read = (rel: string) => fs.readFileSync(path.join(RENDERER, rel), 'utf-8')

// Mock entropic + zustand stores BEFORE importing renderer components.
const mockEntropic = {
  sendCommand: () => Promise.resolve({ ok: true }),
  onEngineStatus: () => () => {},
}
;(globalThis as unknown as { window: unknown }).window = { entropic: mockEntropic }

import { TrackHeader } from '../renderer/components/timeline/Track'
import { MasterTrackHeader } from '../renderer/components/timeline/MasterTrack'
import WelcomeScreen from '../renderer/components/layout/WelcomeScreen'
import { useTimelineStore } from '../renderer/stores/timeline'
import { useAutomationStore } from '../renderer/stores/automation'

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')) as { version: string }

afterEach(() => {
  cleanup()
})

describe('W1.5a owner walk — row-level oracle (one assertion block per quick fix)', () => {
  it('QF1: record-arm dot renders LEFT of the track name — lean header (default FF_CREATRIX_LAYOUT), Master header, and legacy (FF-off) source order', () => {
    useTimelineStore.getState().reset()
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    const t = useTimelineStore.getState().tracks[0]

    const { container: leanContainer } = render(<TrackHeader track={t} isSelected={false} />)
    const leanArm = leanContainer.querySelector('.track-header__auto-btn')
    const leanName = leanContainer.querySelector('[data-testid="lean-track-name"]')
    expect(leanArm).toBeTruthy()
    expect(leanName).toBeTruthy()
    // DOCUMENT_POSITION_FOLLOWING (4): leanName comes AFTER leanArm in the DOM.
    expect(leanArm!.compareDocumentPosition(leanName!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const { container: masterContainer } = render(<MasterTrackHeader track={t} isSelected={false} />)
    const masterArm = masterContainer.querySelector('[data-testid="master-track-auto-btn"]')
    const masterName = masterContainer.querySelector('.master-track-header__name')
    expect(masterArm).toBeTruthy()
    expect(masterName).toBeTruthy()
    expect(masterArm!.compareDocumentPosition(masterName!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Legacy (FF_CREATRIX_LAYOUT off) header is unreachable-by-default in this
    // process — FF is a static snapshot taken at module import, before any
    // test can toggle localStorage — so its JSX order is verified by source
    // position instead of a render. `track-header__row--top`/`--bottom` are
    // legacy-only anchors (the lean header never renders those class names).
    const src = read('components/timeline/Track.tsx')
    const legacyStart = src.indexOf('track-header__row track-header__row--top')
    const legacyEnd = src.indexOf('track-header__row track-header__row--bottom')
    expect(legacyStart).toBeGreaterThan(-1)
    expect(legacyEnd).toBeGreaterThan(legacyStart)
    const legacySlice = src.slice(legacyStart, legacyEnd)
    const legacyArmIdx = legacySlice.indexOf('track-header__auto-btn')
    const legacyInfoIdx = legacySlice.indexOf('track-header__info"')
    expect(legacyArmIdx).toBeGreaterThan(-1)
    expect(legacyInfoIdx).toBeGreaterThan(-1)
    expect(legacyArmIdx).toBeLessThan(legacyInfoIdx)
  })

  it('QF2: --cx-master-bg is the 30% amber flat-mix (#524128), stronger than the prior 15% (#352D23)', () => {
    const tokens = read('styles/tokens.css')
    expect(tokens).toMatch(/--cx-master-bg:\s*#524128/)
    expect(tokens).not.toContain('--cx-master-bg: #352D23')
  })

  it('QF3: right-clicking the empty lane bed opens an Add Track / Add MIDI Track / Add Text Track menu', () => {
    const src = read('components/timeline/Timeline.tsx')
    expect(src).toContain("import ContextMenu from './ContextMenu'")
    expect(src).toContain('onContextMenu={handleLaneBedContextMenu}')
    expect(src).toMatch(/label:\s*'Add Track',\s*action:\s*handleAddTrack,\s*testId:\s*'empty-area-menu-add-track'/)
    expect(src).toMatch(/label:\s*'Add MIDI Track',\s*action:\s*handleAddMidiTrack,\s*testId:\s*'empty-area-menu-add-midi-track'/)
    expect(src).toMatch(/label:\s*'Add Text Track',\s*action:\s*handleAddTextTrack,\s*testId:\s*'empty-area-menu-add-text-track'/)
    // Add Text Track uses the same store action as App.tsx's Cmd+T handler.
    expect(src).toContain("useTimelineStore.getState().addTextTrack(")
  })

  it('QF4: deleting a SELECTED + ARMED track clears both selection and the automation arm state (no stale-track leak)', () => {
    useTimelineStore.getState().reset()
    useAutomationStore.getState().resetAutomation()
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    const t1 = useTimelineStore.getState().tracks[0]
    useTimelineStore.getState().selectTrack(t1.id)
    useAutomationStore.getState().armTrack(t1.id)

    useTimelineStore.getState().removeTrack(t1.id)

    expect(useTimelineStore.getState().selectedTrackId).toBeNull()
    // The actual bug: armedTrackId lived in a DIFFERENT store than
    // selectedTrackId and was never cleared by removeTrack, so it kept
    // pointing at a track id that no longer existed — the arm-gated UI
    // (AutomationToolbar, Track/MasterTrack headers) stayed "live" for a
    // phantom track. This is the assertion that regresses without the fix.
    expect(useAutomationStore.getState().armedTrackId).toBeNull()
  })

  it('QF4: deleting an UNSELECTED, UNARMED track preserves the current selection and arm state', () => {
    useTimelineStore.getState().reset()
    useAutomationStore.getState().resetAutomation()
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')
    useTimelineStore.getState().addTrack('Track 2', '#00ff00')
    const [t1, t2] = useTimelineStore.getState().tracks
    useTimelineStore.getState().selectTrack(t2.id)
    useAutomationStore.getState().armTrack(t2.id)

    useTimelineStore.getState().removeTrack(t1.id)

    expect(useTimelineStore.getState().selectedTrackId).toBe(t2.id)
    expect(useAutomationStore.getState().armedTrackId).toBe(t2.id)
  })

  it('QF5: welcome screen renders the real package.json app version, not a hardcoded string', () => {
    expect(pkg.version).not.toBe('3.0.0')
    const { container } = render(
      <WelcomeScreen
        isVisible={true}
        recentProjects={[]}
        onNewProject={() => {}}
        onOpenProject={() => {}}
        onOpenRecent={() => {}}
      />,
    )
    const versionEl = container.querySelector('.welcome-screen__version')
    expect(versionEl).toBeTruthy()
    expect(versionEl!.textContent).toBe(`v${pkg.version}`)
    expect(versionEl!.textContent).not.toBe('v3.0.0')
    // Source-level guard: no hardcoded version string left behind.
    const src = read('components/layout/WelcomeScreen.tsx')
    expect(src).not.toContain('v3.0.0')
    expect(src).toContain('__APP_VERSION__')
  })
})
