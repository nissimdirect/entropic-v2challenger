/**
 * useAudioMeterPoll — drives the audio store's meter at ~30Hz while playback
 * is active. Mounts once at the App level; consumers (GainMeter) read from
 * the store reactively.
 *
 * F-0516-6 phase 2 wiring (PR-paired with backend `audio_meter` IPC).
 *
 * Why a hook and not a useEffect inline somewhere: the polling lifecycle
 * needs to (a) start on isPlaying=true, (b) stop on isPlaying=false (saves
 * IPC bandwidth when the app is idle), (c) reset to floor on stop. Putting
 * this in a dedicated hook keeps the cleanup atomic and avoids duplicate
 * intervals when the App mounts twice (StrictMode).
 */
import { useEffect } from 'react'
import { useAudioStore, METER_FLOOR_DB } from '../stores/audio'

const METER_POLL_INTERVAL_MS = 33 // ~30 fps; faster than typical visual rate

export function useAudioMeterPoll(): void {
  const isPlaying = useAudioStore((s) => s.isPlaying)

  useEffect(() => {
    if (!isPlaying) {
      // Reset to floor so the meter visibly drops when playback stops,
      // instead of holding the last reading indefinitely.
      useAudioStore.getState().setMeter({
        rmsDb: METER_FLOOR_DB,
        peakDb: METER_FLOOR_DB,
        clipped: false,
      })
      return
    }

    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      await useAudioStore.getState().pollMeter()
    }

    // Fire one immediate poll so the meter responds within ~30ms of play
    // instead of waiting for the first interval tick.
    void tick()
    const id = setInterval(() => {
      void tick()
    }, METER_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [isPlaying])
}
