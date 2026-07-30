/**
 * rackView selector — F4b proof-of-pattern (grows the trackStats.ts convention).
 *
 * Composes EVERY reactive Zustand hook call RackDevice.tsx previously made
 * inline (data reads AND stable action-function refs — Zustand action
 * references don't change identity across renders, so bundling them here is
 * subscription-neutral). Same store, same selector function, same order for
 * each — this only moves WHERE the hook is invoked, not what it does.
 *
 * Non-reactive `.getState()` reads (used inside onPadTrigger, onPadDelete,
 * etc.) stay inline in RackDevice.tsx, matching the getTrackStats() precedent.
 */
import { useInstrumentsStore } from '../stores/instruments'
import { useProjectStore } from '../stores/project'
import { usePerformanceStore } from '../stores/performance'
import { usePerformanceFreezeStore } from '../stores/performanceFreeze'
import { useLayoutStore } from '../stores/layout'

export function useRackDeviceView(trackId: string) {
  const rack = useInstrumentsStore((s) => s.racks[trackId])
  const setRackPadSourceAt = useInstrumentsStore((s) => s.setRackPadSourceAt)
  const updateRackPadAt = useInstrumentsStore((s) => s.updateRackPadAt)
  const setRackPadChokeGroupAt = useInstrumentsStore((s) => s.setRackPadChokeGroupAt)
  const addRackPadAt = useInstrumentsStore((s) => s.addRackPadAt)
  const removeRackPadAt = useInstrumentsStore((s) => s.removeRackPadAt)
  const convertPadToBranch = useInstrumentsStore((s) => s.convertPadToBranch)
  const addRackMacro = useInstrumentsStore((s) => s.addRackMacro)
  const updateRackMacro = useInstrumentsStore((s) => s.updateRackMacro)
  const removeRackMacro = useInstrumentsStore((s) => s.removeRackMacro)
  const addMacroRoute = useInstrumentsStore((s) => s.addMacroRoute)
  const removeMacroRoute = useInstrumentsStore((s) => s.removeMacroRoute)
  const triggerRackPad = usePerformanceStore((s) => s.triggerRackPad)
  const clearRackPadEvents = usePerformanceStore((s) => s.clearRackPadEvents)
  const captureRetroBuffer = usePerformanceStore((s) => s.captureRetroBuffer)
  const assets = useProjectStore((s) => s.assets)

  // B10.1b — Ableton-style FREEZE state for THIS track (reactive).
  const freezeFsm = usePerformanceFreezeStore((s) => s.fsm[trackId] ?? 'idle')
  const freezePerformanceTrack = usePerformanceFreezeStore((s) => s.freezePerformanceTrack)
  const unfreezePerformanceTrack = usePerformanceFreezeStore((s) => s.unfreezePerformanceTrack)

  // B5.2 — the branch path RackDevice is currently editing.
  const rackEditPath = useProjectStore((s) => s.rackEditPath)
  const enterBranch = useProjectStore((s) => s.enterBranch)
  const setRackEditPathDepth = useProjectStore((s) => s.setRackEditPathDepth)
  const resetRackEditPath = useProjectStore((s) => s.resetRackEditPath)

  const selectedRackPad = useProjectStore((s) => s.selectedRackPad)

  // B10.2 — launch-quantize.
  const launchQuantizeEnabled = useLayoutStore((s) => s.launchQuantizeEnabled)
  const toggleLaunchQuantize = useLayoutStore((s) => s.toggleLaunchQuantize)
  const quantizeDivision = useLayoutStore((s) => s.quantizeDivision)

  return {
    rack,
    setRackPadSourceAt,
    updateRackPadAt,
    setRackPadChokeGroupAt,
    addRackPadAt,
    removeRackPadAt,
    convertPadToBranch,
    addRackMacro,
    updateRackMacro,
    removeRackMacro,
    addMacroRoute,
    removeMacroRoute,
    triggerRackPad,
    clearRackPadEvents,
    captureRetroBuffer,
    assets,
    freezeFsm,
    freezePerformanceTrack,
    unfreezePerformanceTrack,
    rackEditPath,
    enterBranch,
    setRackEditPathDepth,
    resetRackEditPath,
    selectedRackPad,
    launchQuantizeEnabled,
    toggleLaunchQuantize,
    quantizeDivision,
  }
}
