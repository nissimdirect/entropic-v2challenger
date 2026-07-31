/**
 * w1-first-light.test.ts — W1 First-Light punch list row-level oracle (A2).
 *
 * One assertion block per punch-list item (12 items), proving the shipped
 * fix is actually in the source — not "looks done." Source-grep pattern
 * matches the repo's existing precedent suites (icon-kit.test.tsx,
 * pkefg-frame-bugs.test.ts, pkd-empty-states.test.tsx) rather than deep
 * component mounting, since several items are pure CSS/store/copy changes
 * with no interesting render-time behavior to assert beyond "the markup
 * exists."
 *
 * W1-10 ships with a DOCUMENTED DEVIATION from the punch list's literal
 * wording (see its commit message); the assertions below test the actual
 * shipped behavior, not the original (factually wrong) suggestion.
 * W1-12 is DEFERRED to W2 — its row is skipped below with the rationale.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RENDERER = path.join(__dirname, '../renderer')
const read = (rel: string) => fs.readFileSync(path.join(RENDERER, rel), 'utf-8')

/** CSS-text block extractor — same pattern as pkefg-frame-bugs.test.ts. */
function block(src: string, selector: string): string {
  const i = src.indexOf(`${selector} {`)
  expect(i, `${selector} rule missing`).toBeGreaterThan(-1)
  return src.slice(i, src.indexOf('}', i))
}

describe('W1 First-Light — row-level oracle (one assertion per punch-list item)', () => {
  it('W1-1: MasterTrack record-arm renders the icon-kit dot, not a bare ">R<"', () => {
    const src = read('components/timeline/MasterTrack.tsx')
    expect(src).toContain('data-testid="master-track-auto-btn"')
    // toContain (not toMatch/regex) — the literal string has unescaped { }
    // from JSX prop syntax, which a regex would misparse as a quantifier.
    expect(src).toContain('<Icon name="circle" size={10} filled={isArmed} />')
    // The old bare-text button body must be gone.
    expect(src).not.toMatch(/>\s*R\s*<\/button>/)
  })

  it('W1-2: automation hint + tooltips reference the record-arm dot, not letter R', () => {
    const src = read('components/automation/AutomationToolbar.tsx')
    expect(src).not.toMatch(/<kbd>R<\/kbd>/)
    // toContain, not regex — literal { } from JSX prop syntax.
    expect(src).toContain('<Icon name="circle" size={10} className="auto-toolbar__hint-dot" />')
    expect(src).toContain('the record-arm dot on a track header')
    expect(src).not.toContain('R button')
  })

  it('W1-3: transport snap toggle renders the vendored magnet glyph', () => {
    const iconKit = read('assets/icon-kit.tsx')
    expect(iconKit).toMatch(/\|\s*'magnet'/)
    expect(iconKit).toMatch(/magnet:\s*\(/)
    const app = read('App.tsx')
    // The snap-toggle button (data-testid) must render the magnet icon inside it.
    expect(app).toMatch(/data-testid="snap-toggle"[\s\S]{0,200}Icon name="magnet"/)
  })

  it('W1-4: mask-edit lasso chips have real styled rules (rest/hover/active), not zero CSS', () => {
    const css = read('styles/global.css')
    expect(block(css, '.preview-controls__lasso-btn')).toMatch(/background:\s*var\(--cx-bg-raised\)/)
    expect(css).toContain('.preview-controls__lasso-btn:hover')
    expect(css).toContain('.preview-controls__lasso-btn:focus-visible')
    expect(css).toContain('.preview-controls__lasso-btn--active')
  })

  it('W1-5: LayerPanel renders the EmptyState primitive when no track is selected', () => {
    const src = read('components/timeline/LayerPanel.tsx')
    expect(src).toContain("import EmptyState from '../common/EmptyState'")
    expect(src).toMatch(/<EmptyState[\s\S]{0,150}hint="Select a track to edit its blend, opacity, and mattes\."/)
    // Outer testid preserved for existing test/back-compat.
    expect(src).toContain('data-testid="layer-panel-empty"')
  })

  it('W1-6: Master header/lane use the opaque --cx-master-bg identity token, not a wash', () => {
    const tokens = read('styles/tokens.css')
    expect(tokens).toMatch(/--cx-master-bg:\s*#[0-9A-Fa-f]{6}/)
    const timeline = read('styles/timeline.css')
    expect(block(timeline, '.master-track-header')).toMatch(/background:\s*var\(--cx-master-bg\)/)
    expect(block(timeline, '.master-track-lane')).toMatch(/background:\s*var\(--cx-master-bg\)/)
    // Selected/hover states still use translucent washes (state, not identity) — untouched.
    expect(timeline).toContain('.master-track-header.track-header--selected')
    expect(block(timeline, '.master-track-header.track-header--selected')).toMatch(/var\(--cx-amber-alpha-28\)/)
  })

  it('W1-7: track context menu has an 8-swatch Color row wired to setTrackColor', () => {
    const track = read('components/timeline/Track.tsx')
    expect(track).toContain("import ClipComponent, { CLIP_COLOR_SWATCHES } from './Clip'")
    expect(track).toMatch(/label:\s*'Color'/)
    expect(track).toContain('CLIP_COLOR_SWATCHES.map')
    expect(track).toContain('store.setTrackColor(track.id, sw.hex)')
    const store = read('stores/timeline.ts')
    expect(store).toMatch(/setTrackColor:\s*\(id,\s*color\)\s*=>/)
    const clip = read('components/timeline/Clip.tsx')
    expect(clip).toContain('export const CLIP_COLOR_SWATCHES')
    const swatchCount = (clip.match(/hex: '#[0-9A-Fa-f]{6}', label: '/g) ?? []).length
    expect(swatchCount).toBe(8)
  })

  it('W1-8: empty/near-empty session displays a 60s ruler-span floor', () => {
    const src = read('components/timeline/Timeline.tsx')
    expect(src).toMatch(/EMPTY_SESSION_DISPLAY_SECONDS\s*=\s*60/)
    expect(src).toMatch(/displayDuration\s*=\s*Math\.max\(duration,\s*EMPTY_SESSION_DISPLAY_SECONDS\)/)
    expect(src).toMatch(/contentWidth\s*=\s*\(displayDuration \+ 1\)\s*\*\s*zoom/)
  })

  it('W1-9: Master lane label floors at a readable min-width (never a truncated shard)', () => {
    const css = read('styles/timeline.css')
    const labelBlock = block(css, '.master-track-lane__label')
    expect(labelBlock).toMatch(/min-width:\s*220px/)
    // PK.E's existing truncation contract (ellipsis, not wrap) must survive untouched.
    expect(labelBlock).toMatch(/white-space:\s*nowrap/)
    expect(labelBlock).toMatch(/text-overflow:\s*ellipsis/)
  })

  // W1-10 ORIGINALLY asserted three distinct labeled buttons (+ Track /
  // + MIDI / + Inspector) in the headers-spacer. SUPERSEDED by QF6 (W1.5a
  // owner walk, second walk 2026-07-31): owner directive collapsed that row
  // to a single "+ Track" button opening a unified Add Track menu, and
  // removed the Inspector creation entry point entirely (see
  // w15a-owner-walk.test.tsx for the QF6 row-level oracle). This row is
  // rewritten to assert the NEW single-button + menu contract rather than
  // the shipped-then-superseded three-button behavior — a stale assertion
  // here would be testing a UI that no longer exists.
  it('W1-10 (superseded by QF6): headers-spacer has ONE "+ Track" button, no Inspector button, opening the unified Add Track menu', () => {
    const src = read('components/timeline/Timeline.tsx')
    const spacerStart = src.indexOf('timeline__headers-spacer')
    const spacerEnd = src.indexOf('timeline__track-headers', spacerStart)
    const spacer = src.slice(spacerStart, spacerEnd)
    expect(spacer).toContain('+ Track')
    expect(spacer).toContain('data-testid="add-track-button"')
    expect(spacer).toContain('onClick={handleAddTrackButtonClick}')
    // The old per-type buttons/labels must be gone from this region.
    expect(spacer).not.toContain('+ MIDI')
    expect(spacer).not.toContain('+ Inspector')
    expect(spacer).not.toContain('handleAddInspectorTrack')
    // Inspector's creation entry point is gone from the component entirely
    // (not just this row) — the store action + project-load path stay.
    expect(src).not.toContain('handleAddInspectorTrack')
    expect(src).toContain('addTrackMenuItems')
  })

  it('W1-11: transport DOM order is BPM/tempo cluster then the centered playback cluster', () => {
    const src = read('App.tsx')
    const bpmIdx = src.indexOf('app__transport-bpm')
    const quantIdx = src.indexOf('app__transport-quant')
    const playbackIdx = src.indexOf('app__transport-playback')
    expect(bpmIdx).toBeGreaterThan(-1)
    expect(quantIdx).toBeGreaterThan(bpmIdx)
    expect(playbackIdx).toBeGreaterThan(quantIdx)
    const css = read('styles/global.css')
    expect(block(css, '.app__transport-playback')).toMatch(/margin:\s*0 auto/)
  })

  // W1-12 DEFERRED to W2 (red-team finding 2): 11 e2e spec files bootstrap
  // media import by clicking .file-dialog-btn, so removing the Browse button
  // without migrating that bootstrap turns main red post-merge (the PR gate
  // only runs smoke.spec.ts). The removal rides the W2 browser-folders wave
  // (P9 reworks this sidebar region) after the import bootstrap migrates to
  // the menu:action('import-media') + dialog:open-stub path. When that lands,
  // un-skip and restore the removal assertions.
  it.skip('W1-12 (deferred to W2): the sidebar Browse... button (FileDialog) is no longer imported/mounted in App.tsx', () => {
    const src = read('App.tsx')
    expect(src).not.toMatch(/import FileDialog/)
    expect(src).not.toMatch(/<FileDialog\b/)
    // FileDialog.tsx itself is untouched and still independently unit-tested.
    expect(fs.existsSync(path.join(RENDERER, 'components/upload/FileDialog.tsx'))).toBe(true)
  })
})
