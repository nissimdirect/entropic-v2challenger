/**
 * w15a-owner-walk.test.tsx — W1.5a owner-directed quick-fix oracle (A2
 * row-level pattern, one block per item — see w1-first-light.test.ts for
 * the shape this follows). QF1/QF2 are pure markup/CSS changes with no
 * interesting render-time behavior beyond "the fix is actually in source,"
 * so those use the same source-grep pattern as w1-first-light. QF3 (amended
 * mid-session), QF4, QF6, and QF7 (added across two later owner walks) are
 * all real behavior — a unified menu replacing per-type buttons in TWO
 * separate creation surfaces, a cross-store state leak, and an
 * interaction-model change — so those get real render/store/event tests
 * instead of grep, proving the bug/feature is actually fixed/shipped, not
 * just that some string appears in a file. QF8 (a second stale version
 * string) is back to source-grep, same reasoning as QF1/QF2.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { setupMockEntropic, teardownMockEntropic } from './helpers/mock-entropic'

const RENDERER = path.join(__dirname, '../renderer')
const read = (rel: string) => fs.readFileSync(path.join(RENDERER, rel), 'utf-8')

import { TrackHeader } from '../renderer/components/timeline/Track'
import { MasterTrackHeader } from '../renderer/components/timeline/MasterTrack'
import Timeline from '../renderer/components/timeline/Timeline'
import WelcomeScreen from '../renderer/components/layout/WelcomeScreen'
import { useTimelineStore } from '../renderer/stores/timeline'
import { useAutomationStore } from '../renderer/stores/automation'

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')) as { version: string }

// setupMockEntropic installs window.entropic on the REAL happy-dom window
// (Object.defineProperty), unlike the simpler `window = {...}` stub some
// sibling suites use — Timeline mounts MarqueeOverlay, which calls real
// window.addEventListener, so the full window must stay intact.
beforeEach(() => {
  setupMockEntropic()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
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

  // QF3 AMENDED (2026-07-31 second owner walk): "not three separate buttons
  // for three separate types" — ONE unified menu (Video/MIDI/Text, no
  // Inspector — see QF6), reachable by right-clicking the empty lane bed OR
  // the QF6 "+ Track" button. Behavioral (not source-grep): mount the real
  // Timeline, right-click the empty lane bed, and drive the actual menu.
  it('QF3 (amended): right-clicking the empty lane bed opens ONE unified Add Track menu (Video/MIDI/Text, no Inspector)', () => {
    useTimelineStore.getState().reset()
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')

    const { container } = render(<Timeline onSeek={() => {}} />)
    const laneBed = container.querySelector('.timeline__tracks-scroll')
    expect(laneBed).toBeTruthy()
    fireEvent.contextMenu(laneBed!)

    expect(document.querySelector('[data-testid="add-track-menu-item-video"]')?.textContent).toBe('Add Video Track')
    expect(document.querySelector('[data-testid="add-track-menu-item-midi"]')?.textContent).toBe('Add MIDI Track')
    expect(document.querySelector('[data-testid="add-track-menu-item-text"]')?.textContent).toBe('Add Text Track')
    // No Inspector option in this menu (QF6 removed its creation path entirely).
    expect(document.querySelector('[data-testid="add-track-menu-item-inspector"]')).toBeNull()
    expect(container.textContent).not.toContain('Inspector')

    const beforeCount = useTimelineStore.getState().tracks.length
    fireEvent.click(document.querySelector('[data-testid="add-track-menu-item-video"]')!)
    expect(useTimelineStore.getState().tracks.length).toBe(beforeCount + 1)
    // Menu closes after picking an item.
    expect(document.querySelector('[data-testid="add-track-menu-item-video"]')).toBeNull()
  })

  // QF6 (NEW, 2026-07-31 second owner walk): owner directive collapsed the
  // headers-spacer's + Track / + MIDI / + Inspector three-button row into a
  // single "+ Track" button opening the SAME unified menu as QF3's
  // right-click, and removed Inspector's creation entry point entirely
  // (feature code / store action / saved-project load path stay untouched —
  // only the UI affordance to CREATE a new one goes).
  it('QF6: the headers-spacer has ONE "+ Track" button (no Inspector button) that opens the same unified menu', () => {
    useTimelineStore.getState().reset()
    useTimelineStore.getState().addTrack('Track 1', '#ff0000')

    const { container } = render(<Timeline onSeek={() => {}} />)
    const spacer = container.querySelector('.timeline__headers-spacer')
    expect(spacer).toBeTruthy()
    const spacerButtons = spacer!.querySelectorAll('.timeline__add-track-btn')
    expect(spacerButtons.length).toBe(1)
    expect(spacer!.textContent).not.toContain('Inspector')
    expect(spacer!.textContent).not.toContain('MIDI')

    const addTrackBtn = document.querySelector('[data-testid="add-track-button"]') as HTMLElement
    expect(addTrackBtn).toBeTruthy()
    const beforeCount = useTimelineStore.getState().tracks.length
    fireEvent.click(addTrackBtn)
    fireEvent.click(document.querySelector('[data-testid="add-track-menu-item-midi"]')!)
    expect(useTimelineStore.getState().tracks.length).toBe(beforeCount + 1)
    expect(useTimelineStore.getState().tracks[useTimelineStore.getState().tracks.length - 1].type).toBe('performance')

    // Inspector's creation entry point is gone from the component, not just
    // relabeled — the store action (used by project-load) stays untouched.
    const src = read('components/timeline/Timeline.tsx')
    expect(src).not.toContain('handleAddInspectorTrack')
    const storeSrc = read('stores/timeline.ts')
    expect(storeSrc).toContain('addInspectorTrack:')
    const persistSrc = read('project-persistence.ts')
    expect(persistSrc).toContain('addInspectorTrack(')
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

  // QF7 (NEW, 2026-07-31 third owner walk): Timeline's zero-track
  // early-return branch had its OWN, older two-button (+ Add Track /
  // + MIDI Track) creation surface — a second, unrelated pattern that
  // predated QF6 and violated "one way to create tracks" (no Text option,
  // no testids). Behavioral, mirroring QF3/QF6's render+event pattern: mount
  // Timeline with ZERO tracks (the empty-state branch), click its add-track
  // button, and verify it opens the SAME unified menu.
  it('QF7: the empty-state (zero tracks) add-track button opens the same unified menu as QF6/QF3, not its own older two-button surface', () => {
    useTimelineStore.getState().reset()
    // A fresh reset() has zero tracks — Timeline's tracks.length===0 branch.
    expect(useTimelineStore.getState().tracks.length).toBe(0)

    const { container } = render(<Timeline onSeek={() => {}} />)
    const emptyState = container.querySelector('.timeline__empty')
    expect(emptyState).toBeTruthy()
    // Exactly one creation button, the shared testid — not the old
    // two-button (+ Add Track / + MIDI Track) surface.
    const emptyButtons = emptyState!.querySelectorAll('.timeline__add-track-btn')
    expect(emptyButtons.length).toBe(1)
    expect(emptyState!.textContent).not.toContain('MIDI Track')
    const addBtn = document.querySelector('[data-testid="add-track-button"]') as HTMLElement
    expect(addBtn).toBeTruthy()
    expect(addBtn.textContent).toBe('+ Track')

    fireEvent.click(addBtn)
    expect(document.querySelector('[data-testid="add-track-menu-item-video"]')?.textContent).toBe('Add Video Track')
    expect(document.querySelector('[data-testid="add-track-menu-item-midi"]')?.textContent).toBe('Add MIDI Track')
    expect(document.querySelector('[data-testid="add-track-menu-item-text"]')?.textContent).toBe('Add Text Track')

    fireEvent.click(document.querySelector('[data-testid="add-track-menu-item-text"]')!)
    expect(useTimelineStore.getState().tracks.length).toBe(1)
    expect(useTimelineStore.getState().tracks[0].type).toBe('text')
  })

  // QF8 (NEW, 2026-07-31 third owner walk): a SECOND stale version string
  // survived QF5 — the status bar's boot line composed "creatrix v3.0.0 —
  // N effects loaded" from a hardcoded prop in App.tsx (boot.line template
  // lives in i18n/onboarding-strings.ts; QF5's grep only caught
  // WelcomeScreen.tsx's own literal). Source-grep (App.tsx isn't cheaply
  // renderable here — it pulls in the whole app shell/every store); traced
  // and fixed the actual prop, not the template.
  it('QF8: the status bar boot-line no longer hardcodes an app version — same __APP_VERSION__ constant as QF5', () => {
    const appSrc = read('App.tsx')
    expect(appSrc).toContain('appVersion={__APP_VERSION__}')
    expect(appSrc).not.toMatch(/appVersion="3\.0\.0"/)
    // The composed template itself is untouched — {appVersion} is filled by
    // BootLine.tsx from the (now-correct) prop, not hardcoded in the string.
    const stringsSrc = read('i18n/onboarding-strings.ts')
    expect(stringsSrc).toContain('{appVersion}')
  })
})
