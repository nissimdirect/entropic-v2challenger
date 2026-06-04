/**
 * CreatrixShell — assembles the PR-A layout: grid shell + 5-tab browser +
 * device chain + (info) inspector, with the browser's onAdd routed to the real
 * stores. Flag-gated by F_CREATRIX_LAYOUT in App.tsx (old layout stays live
 * when off). "Shell + tabs first" pass — preview/inspector are minimal slots;
 * the live preview render + hover-help inspector are the next iteration.
 */
import { useMemo, useRef } from 'react'

import CreatrixLayout from './CreatrixLayout'
import BrowserPanel from '../browser/BrowserPanel'
import { useBrowserData } from '../browser/useBrowserData'
import type { DragPayload } from '../browser/types'
import { SamplerDevice } from '../instruments'
import { useInstrumentsStore } from '../../stores/instruments'
import { useProjectStore, getActiveTrackId } from '../../stores/project'
import { useOperatorStore } from '../../stores/operators'
import { useEffectsStore } from '../../stores/effects'
import { useTimelineStore } from '../../stores/timeline'
import { useToastStore } from '../../stores/toast'
import { randomUUID } from '../../utils'
import type { OperatorType } from '../../../shared/types'

import '../../styles/creatrix.css'

export default function CreatrixShell() {
  const nonce = useRef<string>(randomUUID()).current
  const tracks = useTimelineStore((s) => s.tracks)
  const sampler = useInstrumentsStore((s) => s.instrument)

  const firstClip = useMemo(() => tracks.flatMap((t) => t.clips)[0], [tracks])
  const hasBaseClip = Boolean(firstClip)
  const tabs = useBrowserData(hasBaseClip)

  function handleAdd(payload: DragPayload) {
    const toast = useToastStore.getState()
    if (payload.kind === 'instruments') {
      if (payload.id === 'builtin:instr.sampler') {
        if (firstClip) {
          useInstrumentsStore.getState().addSampler(firstClip.id)
        } else {
          toast.addToast({
            level: 'warning',
            message: 'Add a video clip first — the Sampler composites over it.',
            source: 'creatrix-browser',
          })
        }
      } else {
        toast.addToast({
          level: 'info',
          message: `${payload.id.split('.').pop()} rack is coming in a later pass.`,
          source: 'creatrix-browser',
        })
      }
      return
    }

    if (payload.kind === 'fx') {
      const effectId = payload.id.replace(/^builtin:/, '')
      const info = useEffectsStore.getState().registry.find((e) => e.id === effectId)
      const trackId = getActiveTrackId()
      if (!info) return
      if (!trackId) {
        toast.addToast({
          level: 'warning',
          message: 'Select a track to add an effect.',
          source: 'creatrix-browser',
        })
        return
      }
      useProjectStore.getState().addEffect(trackId, {
        id: randomUUID(),
        effectId: info.id,
        isEnabled: true,
        isFrozen: false,
        parameters: Object.fromEntries(
          Object.entries(info.params).map(([key, def]) => [key, def.default]),
        ),
        modulations: {},
        mix: 1.0,
        mask: null,
      })
      return
    }

    if (payload.kind === 'op') {
      const type = payload.id.replace(/^builtin:op\./, '') as OperatorType
      useOperatorStore.getState().addOperator(type)
      return
    }

    // composite (blend mode) + tool (action) routing lands in a later pass.
    toast.addToast({
      level: 'info',
      message: `${payload.kind} routing arrives in a later pass.`,
      source: 'creatrix-browser',
    })
  }

  return (
    <CreatrixLayout
      left={<BrowserPanel tabs={tabs} onAdd={handleAdd} sessionNonce={nonce} />}
      preview={
        <div className="creatrix-slot-placeholder" data-testid="creatrix-preview-slot">
          preview
        </div>
      }
      deviceChain={
        sampler ? (
          <SamplerDevice />
        ) : (
          <div className="creatrix-slot-placeholder" data-testid="creatrix-devicechain-slot">
            device chain — drag an instrument or effect here
          </div>
        )
      }
      inspector={
        <div className="creatrix-slot-placeholder" data-testid="creatrix-inspector-slot">
          inspector
        </div>
      }
    />
  )
}
