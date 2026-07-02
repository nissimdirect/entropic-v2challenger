/**
 * B4.1 — Sample Rack per-pad channel summing.
 *
 * A rack is N pads; each pad is a CHANNEL whose Sampler renders one-or-more
 * voice layers via the EXISTING `buildVoiceLayers` path (B3 sampler render).
 * This module SUMS the pad channels into ONE ordered rack-output layer list,
 * honoring per-pad opacity, blend mode, mute and solo. The actual blend is done
 * by the EXISTING backend compositor (`render_composite` reads each layer's
 * `opacity` + `blend_mode`) — we do NOT write a parallel compositor here.
 *
 * Summing semantics (the gates):
 *   - MUTE:  a muted pad contributes NOTHING (emits zero layers).
 *   - SOLO:  if ANY pad in the rack is soloed, ONLY soloed pads render
 *            (non-soloed pads are silenced, even if not muted). Solo wins over
 *            a pad's own mute only in that a soloed+muted pad is still muted
 *            (mute is the harder gate: muted → silent regardless of solo).
 *   - OPACITY: per-pad opacity multiplies onto each voice layer's opacity
 *              (which already folds in instrument opacity × ADSR envelope).
 *   - BLEND: per-pad blend mode REPLACES the layer's blend_mode so the channel
 *            composites onto the running sum with the pad's mode.
 *
 * Z-ORDER: pads are emitted in array order; within a pad, voices keep the
 * `buildVoiceLayers` ascending-triggerFrame order. So later pads composite on
 * top of earlier pads (NLE convention — matches the per-track sampler path).
 *
 * Regression safety: a project with NO rack never calls this — the per-track
 * sampler render path is untouched and renders byte-identical to today.
 *
 * B5.1 — Sample Rack grouping (composite-tree / nested racks).
 *   A pad may hold a `branch` (a nested RackNode) INSTEAD of a leaf instrument:
 *   "one note fires an ensemble." Render is POST-ORDER: a branch's children are
 *   composited into a sub-frame, the branch's chain + composite folded in, and
 *   ONE group layer emitted upward (RackGroupLayer). The backend compositor
 *   expands the group via a recursive render_composite sub-frame so the branch
 *   CHAIN runs on the COMPOSITED children (not per-child) in BOTH preview and
 *   export. ADDITIVE: a pad with no `branch` emits the SAME flat voice layers
 *   with the SAME voice_ids as B4 (flat byte-identical — see the flat-byte gate).
 *
 * Pure / no store reads — unit-testable without the App render pipeline.
 */
import { buildVoiceLayers } from './buildSamplerLayer'
import { evaluateVoices } from './voiceFSM'
import type { TriggerEvent } from './voiceFSM'
import type { RackNode, RackPad, SamplerVoiceLayer, RackGroupLayer } from './types'
import {
  RACK_PAD_OPACITY_MIN,
  RACK_PAD_OPACITY_MAX,
  MAX_BRANCH_DEPTH,
  MAX_BRANCH_VOICES_PER_RENDER,
} from './types'
import type { Asset, ADSREnvelope, BlendMode } from '../../../shared/types'
import { clampFinite } from '../../../shared/numeric'

export interface BuildRackLayersOpts {
  /** Per-pad TriggerEvent log, keyed by pad id (frontend-evaluated).
   *
   * B5.1: for NESTED branch children, events are keyed by the PATH-FROM-ROOT
   * pad path (see `padEventKey`) so two sibling branches' identically-named pads
   * don't collide. A flat (depth-0) pad's key is just its `pad.id` — UNCHANGED
   * from B4, so the flat lookup is byte-identical. */
  eventsByPad: Record<string, TriggerEvent[]>
  /** Current render frame. */
  frame: number
  /** Project asset table (clipId → Asset). */
  assets: Record<string, Asset>
  /** Project fps fallback when an asset lacks fps meta. */
  defaultFps: number
  /** Rack-level voice envelope (Phase-5a: all pads share the rack ADSR). */
  adsr: ADSREnvelope
  /** Voice polyphony cap per pad. Default 4 (matches the per-track path). */
  voiceCap?: number
}

/**
 * B5.1 — the path-from-root event key for a nested branch child pad. A flat
 * (depth-0) pad uses its bare `pad.id` (UNCHANGED from B4 → flat byte-identical).
 * A nested pad prefixes the branch path so sibling branches don't collide. The
 * key is colon-free `_`-joined so it can also seed the path-prefixed voice_id.
 */
export function padEventKey(branchPath: string, padId: string): string {
  return branchPath === '' ? padId : `${branchPath}_${padId}`
}

/**
 * B5.3 — convert a UI edit path (an array of branch PAD IDS, as held in
 * `useProjectStore.rackEditPath`) into the INDEX-based `bN_`-joined branch path
 * that `walkRack` / `gatherPadEvents` use as the event-key prefix.
 *
 * The render walk keys nested branches by their pad INDEX (`b${padIndex}`,
 * joined with `_`), NOT their pad id — so a UI trigger at a nested level must
 * resolve the SAME index path to write events under the key the render expects.
 * This walks the rack tree following the pad ids, emitting `b${index}` per hop.
 *
 * Returns '' for the top level (empty path → flat, byte-identical to B4). Returns
 * null if any hop is stale (a pad id not found, or the pad has no branch) — the
 * caller falls back to a flat trigger (defensive; mirrors `resolveRackNode`).
 */
export function rackEditPathToBranchPath(
  top: RackNode,
  editPath: string[],
): string | null {
  if (editPath.length === 0) return ''
  let node: RackNode = top
  const segs: string[] = []
  for (const padId of editPath) {
    const idx = node.pads.findIndex((p) => p.id === padId)
    if (idx === -1) return null
    const pad = node.pads[idx]
    if (!pad.branch) return null
    segs.push(`b${idx}`)
    node = pad.branch
  }
  return segs.join('_')
}

const DEFAULT_COMPOSITE: { opacity: number; blend: BlendMode } = {
  opacity: 1,
  blend: 'normal',
}

/**
 * B5.1 — render a single LEAF pad's voice layers (the B4 per-pad channel). Pure
 * extraction of the original leaf branch so both the flat loop and the recursive
 * branch walk share ONE leaf path → flat output is byte-identical.
 *
 * `voiceIdPrefix` is '' for a flat (depth-0) leaf (→ voice_ids UNCHANGED from B4)
 * and a path-from-root prefix for a nested leaf (→ per-path state keys so nested
 * stateful effects don't alias across sibling branches).
 */
function buildLeafPadLayers(
  pad: RackPad,
  opts: BuildRackLayersOpts,
  eventKey: string,
  voiceIdPrefix: string,
): SamplerVoiceLayer[] {
  const { eventsByPad, frame, assets, defaultFps, adsr, voiceCap = 4 } = opts
  const events = eventsByPad[eventKey] ?? []
  const voices = evaluateVoices(events, frame, { voiceCap, adsr })
  if (voices.length === 0) return []

  const padLayers = buildVoiceLayers(
    pad.instrument,
    voices,
    assets,
    frame,
    defaultFps,
    adsr,
  )

  const padOpacity = clampFinite(
    pad.opacity,
    RACK_PAD_OPACITY_MIN,
    RACK_PAD_OPACITY_MAX,
    1,
  )

  const out: SamplerVoiceLayer[] = []
  for (const layer of padLayers) {
    // FLAT PATH (voiceIdPrefix === ''): emit the EXACT B4 object — `...layer`
    // (keeping layer.voice_id verbatim), opacity*padOpacity, pad.blend, pad.chain.
    // This branch is byte-identical to pre-B5 buildRackLayers (the flat gate).
    const base: SamplerVoiceLayer = {
      ...layer,
      opacity: clampFinite(
        layer.opacity * padOpacity,
        RACK_PAD_OPACITY_MIN,
        RACK_PAD_OPACITY_MAX,
        0,
      ),
      blend_mode: pad.blend,
      // B4-pad-chain: the pad's per-pad insert chain rides each voice layer to
      // render_composite (preview); empty → no-op → byte-identical to a no-chain
      // pad. EXPORT carries the SAME chain via the serialized instrument dict.
      chain: pad.chain ?? [],
    }
    // NESTED PATH only: path-prefix the voice_id so nested stateful effects key
    // independently per branch (sibling branches don't alias). Untouched when
    // flat (prefix '') or when the leaf has no voice_id → flat byte-identical.
    if (voiceIdPrefix !== '' && layer.voice_id !== undefined) {
      base.voice_id = `${voiceIdPrefix}_${layer.voice_id}`.slice(0, 128)
    }
    out.push(base)
  }
  return out
}

/**
 * B5.1 — internal recursive tree walk (post-order). Builds the ordered layer
 * list for one rack `node`. A leaf pad emits its B4 voice layers; a branch pad
 * emits ONE RackGroupLayer whose `children` are the branch's recursively-built
 * layers (composited under the branch chain/composite by the backend sub-frame).
 *
 * Trust boundary (the caps gate): `depth` is bounded by MAX_BRANCH_DEPTH — a
 * branch deeper than the cap is REJECTED (its children are dropped, fail-closed,
 * no recursion past the cap → no stack overflow). `counter.voices` accumulates
 * the tree-wide voice total; once it reaches MAX_BRANCH_VOICES_PER_RENDER no
 * further voice layers are emitted (truncated, fail-closed, no OOM).
 *
 * `branchPath` is the path-from-root prefix ('' at the top level). It seeds both
 * the child event keys and the path-prefixed voice_ids / group_ids so siblings
 * never alias.
 */
function walkRack(
  node: RackNode,
  opts: BuildRackLayersOpts,
  depth: number,
  branchPath: string,
  counter: { voices: number },
): (SamplerVoiceLayer | RackGroupLayer)[] {
  if (node.pads.length === 0) return []

  // SOLO gate: if ANY pad at THIS level is soloed, only soloed pads are audible.
  const anySolo = node.pads.some((p) => p.solo === true)

  const out: (SamplerVoiceLayer | RackGroupLayer)[] = []

  node.pads.forEach((pad, padIndex) => {
    // MUTE is the harder gate — a muted pad is silent regardless of solo.
    if (pad.mute) return
    // SOLO: when any pad is soloed, non-soloed pads are silenced.
    if (anySolo && !pad.solo) return

    if (pad.branch) {
      // ---- BRANCH pad (B5.1): recurse, then emit ONE group layer ----
      // DEPTH CAP (trust boundary): a branch at-or-beyond the cap is rejected —
      // its subtree is NOT recursed (fail-closed, no stack overflow / OOM).
      if (depth + 1 > MAX_BRANCH_DEPTH) return

      // Path-from-root segment for THIS branch (e.g. 'b0', then 'b0_b2').
      const seg = `b${padIndex}`
      const childPath = branchPath === '' ? seg : `${branchPath}_${seg}`

      // POST-ORDER: build the children FIRST (recursively), then fold the
      // branch composite + chain into a single group layer emitted upward.
      const children = walkRack(pad.branch, opts, depth + 1, childPath, counter)
      // A branch that composited to nothing (all children muted / no voices /
      // truncated by the voice cap) emits NO layer (no empty group).
      if (children.length === 0) return

      const comp = pad.branch.composite ?? DEFAULT_COMPOSITE
      const branchOpacity = clampFinite(
        comp.opacity,
        RACK_PAD_OPACITY_MIN,
        RACK_PAD_OPACITY_MAX,
        1,
      )
      // Per-pad opacity multiplies onto the branch composite opacity (the pad is
      // still a channel in its parent rack).
      const padOpacity = clampFinite(
        pad.opacity,
        RACK_PAD_OPACITY_MIN,
        RACK_PAD_OPACITY_MAX,
        1,
      )

      const group: RackGroupLayer = {
        layer_type: 'group',
        group_id: childPath,
        children,
        chain: pad.branch.chain ?? [],
        opacity: clampFinite(
          branchOpacity * padOpacity,
          RACK_PAD_OPACITY_MIN,
          RACK_PAD_OPACITY_MAX,
          0,
        ),
        blend_mode: comp.blend,
      }
      out.push(group)
      return
    }

    // ---- LEAF pad (B4 path, UNCHANGED for flat racks) ----
    const eventKey = padEventKey(branchPath, pad.id)
    // Path-prefix the voice_id ONLY when nested (branchPath !== '').
    const leaf = buildLeafPadLayers(pad, opts, eventKey, branchPath)
    // VOICE CAP (trust boundary): tree-wide voice total is bounded — once the
    // running count reaches the cap we stop emitting (truncate, fail-closed).
    for (const layer of leaf) {
      if (counter.voices >= MAX_BRANCH_VOICES_PER_RENDER) break
      counter.voices += 1
      out.push(layer)
    }
  })

  return out
}

/**
 * B5.1 — flatten a rack TREE into the ordered layer list for render_composite.
 *
 * The PUBLIC recursive entry point. For a FLAT rack (no `branch` pads) this is
 * exactly the B4 per-pad summing and returns a `SamplerVoiceLayer[]` with the
 * SAME voice_ids — flat byte-identical. For a TREE it returns a mixed list of
 * leaf voice layers and `RackGroupLayer` group descriptors (which the backend
 * expands via a recursive sub-frame composite).
 *
 * Enforces the recursion caps (MAX_BRANCH_DEPTH / MAX_BRANCH_VOICES_PER_RENDER)
 * so a hostile/deep tree is rejected/truncated, never OOM or infinite-recurse.
 */
export function flattenRackTree(
  rack: RackNode | null,
  opts: BuildRackLayersOpts,
): (SamplerVoiceLayer | RackGroupLayer)[] {
  if (!rack || rack.pads.length === 0) return []
  return walkRack(rack, opts, 0, '', { voices: 0 })
}

/**
 * Sum a rack's pad channels into one ordered layer list for `render_composite`.
 *
 * B4 public API — preserved. For a FLAT rack (every pad a leaf, no `branch`) this
 * returns the SAME `SamplerVoiceLayer[]` as before B5 (flat byte-identical). When
 * the rack contains branch pads, the returned list ALSO carries `RackGroupLayer`
 * group descriptors (the caller / serializer forwards them; the backend expands
 * them into sub-frame composites). Callers that only handle leaf layers keep
 * working for flat racks because `flattenRackTree` emits leaf layers verbatim.
 *
 * Returns [] for a null rack or a rack with no audible pads.
 */
export function buildRackLayers(
  rack: RackNode | null,
  opts: BuildRackLayersOpts,
): (SamplerVoiceLayer | RackGroupLayer)[] {
  return flattenRackTree(rack, opts)
}
