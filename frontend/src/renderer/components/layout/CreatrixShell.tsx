/**
 * CreatrixShell — assembles the PR-A layout: grid shell + 5-tab browser +
 * device chain + (info) inspector, with the browser's onAdd routed to the real
 * stores. Flag-gated by F_CREATRIX_LAYOUT in App.tsx (old layout stays live
 * when off). "Shell + tabs first" pass — preview/inspector are minimal slots;
 * the live preview render + hover-help inspector are the next iteration.
 *
 * Drag-and-drop: browser entries are the drag source; the preview + device-chain
 * regions are drop targets. The drop validates the session nonce (rejects
 * external drags) + the payload shape, then routes through the same handleAdd as
 * double-click.
 */
import { useMemo, useRef, useState } from 'react'

import CreatrixLayout from './CreatrixLayout'
import BrowserPanel from '../browser/BrowserPanel'
import { useBrowserData } from '../browser/useBrowserData'
import { NONCE_MIME, type DragPayload } from '../browser/types'
import { readDropPayload } from '../browser/dropPayload'
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
  const [dragOver, setDragOver] = useState(false)

  const firstClip = useMemo(() => tracks.flatMap((t) => t.clips)[0], [tracks])
  const hasBaseClip = Boolean(firstClip)
  const tabs = useBrowserData(hasBaseClip)

  function handleAdd(payload: DragPayload) {
    const toast = useToastStore.getState()
    if (payload.kind === 'instruments') {
      if (payload.id === 'builtin:instr.sampler') {
        if (firstClip) {
          useInstrumentsStore.getState().addSampler(firstClip.id)
          toast.addToast({ level: 'info', message: 'Sampler added.', source: 'creatrix-browser' })
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
      toast.addToast({ level: 'info', message: `Added ${info.name}.`, source: 'creatrix-browser' })
      return
    }

    if (payload.kind === 'op') {
      const type = payload.id.replace(/^builtin:op\./, '') as OperatorType
      useOperatorStore.getState().addOperator(type)
      toast.addToast({ level: 'info', message: `Added ${type} operator.`, source: 'creatrix-browser' })
      return
    }

    // composite (blend mode) + tool (action) routing lands in a later pass.
    toast.addToast({
      level: 'info',
      message: `${payload.kind} routing arrives in a later pass.`,
      source: 'creatrix-browser',
    })
  }

  // Shared drop-target props for the preview + device-chain regions.
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (Array.from(e.dataTransfer.types).includes(NONCE_MIME)) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!dragOver) setDragOver(true)
      }
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const payload = readDropPayload(e.dataTransfer, nonce)
      if (payload) handleAdd(payload)
    },
  }

  const dropClass = (base: string) =>
    `${base}${dragOver ? ' creatrix-dropzone--over' : ''} creatrix-dropzone`

  return (
    <CreatrixLayout
      left={<BrowserPanel tabs={tabs} onAdd={handleAdd} sessionNonce={nonce} />}
      preview={
        <div
          className={dropClass('creatrix-slot-placeholder')}
          data-testid="creatrix-preview-slot"
          {...dropProps}
        >
          preview — drag fx / instruments here, or onto the device chain
        </div>
      }
      deviceChain={
        <div
          className={dropClass('creatrix-devicechain')}
          data-testid="creatrix-devicechain-slot"
          {...dropProps}
        >
          {sampler ? (
            <SamplerDevice />
          ) : (
            <span className="creatrix-slot-hint">
              device chain — drag an instrument or effect here
            </span>
          )}
        </div>
      }
      inspector={
        <div className="creatrix-slot-placeholder" data-testid="creatrix-inspector-slot">
          inspector
        </div>
      }
    />
  )
}
