/**
 * QuantizeReadout — W1.5b PK.A3: status-bar granularity readout.
 * Owner: "there should be an actual [readout] like is this 16th notes? ...
 * on the bottom right like in Ableton." Mounted in App.tsx's status-bar
 * right cluster alongside CursorToolChip/MappingContextChip/BankPagingHUD
 * (same understated statusbar-chip pattern — see MappingContextChip.tsx).
 * Hidden entirely when quantize is off. infoText per COMPONENT-SPEC §2½
 * carried via `title` (no dedicated Info View plumbing yet).
 */
import { useLayoutStore } from '../../stores/layout'
import { useProjectStore } from '../../stores/project'
import { formatQuantizeReadout } from '../../utils/quantize-grid'

export default function QuantizeReadout() {
  const quantizeEnabled = useLayoutStore((s) => s.quantizeEnabled)
  const quantizeDivision = useLayoutStore((s) => s.quantizeDivision)
  // effectiveBpm is the modulation-derived value the timeline grid itself
  // renders against (App.tsx passes it to <Timeline bpm={effectiveBpm}>) —
  // reading the same field keeps the readout and the grid in agreement.
  const effectiveBpm = useProjectStore((s) => s.effectiveBpm)

  if (!quantizeEnabled) return null

  return (
    <span
      className="status-bar__quantize-readout"
      title="Quantize grid — division and bar length at the current tempo"
      data-testid="quantize-readout"
    >
      {formatQuantizeReadout(effectiveBpm, quantizeDivision)}
    </span>
  )
}
