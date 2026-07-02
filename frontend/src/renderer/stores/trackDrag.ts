/**
 * trackDrag — transient UI state shared across track headers while the user
 * drags one to reorder. Lives outside the timeline store so the ~30 Hz updates
 * during a drag don't fan out to every timeline subscriber (lanes, clips,
 * automation, etc.); only the track headers subscribe here.
 */
import { create } from 'zustand'

interface TrackDragState {
  fromIdx: number | null
  dropTargetIdx: number | null
  setDrag: (fromIdx: number, dropTargetIdx: number | null) => void
  clearDrag: () => void
}

export const useTrackDragStore = create<TrackDragState>((set) => ({
  fromIdx: null,
  dropTargetIdx: null,
  setDrag: (fromIdx, dropTargetIdx) => set({ fromIdx, dropTargetIdx }),
  clearDrag: () => set({ fromIdx: null, dropTargetIdx: null }),
}))
