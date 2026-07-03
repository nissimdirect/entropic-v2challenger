// T5 (2026-07-02): consolidated split-clip-at-playhead handler.
//
// Prior to T5, three shortcuts all performed some flavor of "split the clip
// under the playhead": `split_clip` (meta+shift+k, single-clip via the
// @deprecated selectedClipId field, no bounds check — relied on the store's
// internal `time <= clipStart || time >= clipEnd` guard), `split_at_playhead`
// (meta+k, multi-select aware, explicit bounds check), and
// `split_at_playhead_e` (bare 'e') which was a literal duplicate key binding
// for the exact same handler as `split_at_playhead`. `split_at_playhead`'s
// multi-select behavior is a strict superset of `split_clip`'s single-clip
// behavior (when exactly one clip is selected they're identical), so T5
// consolidates all three down to this one function, wired to the single
// remaining `split_at_playhead` shortcut (meta+k — also the one already
// surfaced in Clip.tsx's context-menu shortcut label).
import { useTimelineStore } from '../stores/timeline'

/**
 * Split every currently-selected clip that the playhead sits strictly inside.
 * No-op for clips whose bounds don't bracket the playhead, and a no-op
 * overall when nothing is selected.
 */
export function splitSelectedClipsAtPlayhead(): void {
  const ts = useTimelineStore.getState()
  for (const clipId of ts.selectedClipIds) {
    for (const track of ts.tracks) {
      const clip = track.clips.find((c) => c.id === clipId)
      if (clip && ts.playheadTime > clip.position && ts.playheadTime < clip.position + clip.duration) {
        ts.splitClip(clipId, ts.playheadTime)
        break
      }
    }
  }
}
