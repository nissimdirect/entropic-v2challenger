# Teardown: automation lanes, recording modes and modulation routing

Feeds: O06 (automation lane), O07 (modulation route) · A07 automation · A08 modulation/routing · A19 MIDI · decisions D8, D13, D13.1.
Refs read: Ardour (GPL, patterns only), Vital (GPL, patterns only), Surge XT (GPL, patterns only). REAPER envelopes are OBSERVE tier and were not observed in this pass.
Legal: GPL repos read for structure and behavior. Everything is described in my own words. No code, no algorithm transcription.

## Problem in Creatrix today

### A. The live identity bug (owner ruled: the A08/O07 spec must define ONE identity key)

1. **The wire addresses a target by effect TYPE.** `serializeEffectInstance` emits `effect_id: effect.effectId` (`frontend/src/shared/ipc-serialize.ts:45`). `effectId` is the registry type. The instance UUID `effect.id` is never sent.
2. **The backend resolves mapping targets by that type key and drops misses silently.** `backend/src/modulation/routing.py:214-218` builds `effect_map[eid]` from each serialized effect's `effect_id`. A second effect of the same type overwrites the first in that dict. Lines `309-312` do `if effect_id not in effect_map: continue` with no log or error.
3. **Every frontend mapping writer I checked writes the INSTANCE id as the target.**
   - `LFOEditor.tsx:33` (`targetEffectId: firstEffect.id`)
   - `ModulationMatrix.tsx:123, 131` (`effectId: fx.id`)
   - `OperatorKentaroCluster.tsx:188, 201` (`targetEffectId: firstEffect.id`, `instanceId`)
   - `DeviceCard.tsx:255` (drop handler: `targetEffectId: effect.id`)
   - `RoutingCanvas.tsx:339, 375` compare `m.targetEffectId` to the destination's `effectId`.
   - `routing-graph-ipc.ts:91` forwards `target_effect_id: m.targetEffectId` unchanged.
   So the writers and the wire disagree. By my reading of `routing.py` a mapping whose target is an instance UUID finds no `effect_map` entry and is skipped. I did not run an end-to-end render to confirm this, and I did not check whether any other layer translates ids in between. This is the owner's reported bug, and the code reads consistently with it.
4. **The UI can show a modulation that the engine does not apply.** The knob ghost value is computed on the frontend by matching `mapping.targetEffectId !== effectId` (`utils/resolveGhostValues.ts:42`) against `modulatedValues?.[effect.id]` (`DeviceChain.tsx:545`). Both sides use the instance id, so the ghost moves while the backend path above misses.
5. **Four other address forms coexist.**
   - Automation lanes: `paramPath = "${effectId}.${paramKey}"` with the instance id (`DeviceCard.tsx:147`, `stores/automation.ts:511`).
   - MIDI CC mappings: `m.effectId === effect.id` (`DeviceCard.tsx:404-406`).
   - Instrument macros: `pad.<padId>.<param>` (`components/instruments/types.ts:371-378`).
   - Clip transform lanes: `clipTransform.<clipId>.<field>` (`utils/transformLanes.ts:5`).
6. **The dotted-string parser disagrees between layers.** The frontend routing payload splits `paramPath` on the FIRST dot (`routing-graph-ipc.ts:117-120`). The backend operator-lane path splits on the LAST dot and its own comment says real type ids are dotted (for example `fx.hue_shift`) while instance ids are dot-free (`routing.py:696-711`). Both are right only if the id is a dot-free UUID.
7. **No cleanup of dangling targets.** A grep for removal of mappings when an effect is deleted found none (only `loadOperators` validates mapping fields: `stores/operators.ts:334-380`, which does not check that the target exists).

### B. Automation and mapping UX

8. **Mode model** (`stores/automation.ts:46`): `AutomationMode = 'read' | 'latch' | 'touch' | 'draw'`. Write behavior is separate: `AutomationRecordMode = 'replace' | 'overdub' | 'add_lane'` (`utils/automation-record.ts`). D13/D13.1 set the global Read/Touch/Latch dropdown and the three-state write glyph in the transport. Draw stays lane-level.
9. **Recording writes one point per input event** and replaces any existing point within 0.033 s (`utils/automation-record.ts`, `recordPoint` timeThreshold default). There is no pass-level cleanup. Thinning exists only as a manual RDP simplify with a caller-chosen tolerance (`stores/automation.ts:843-866`, `utils/automation-simplify.ts`), moved to the lane menu by D8.
10. **Single choke point for recording** (`recordAutomationValue`, `stores/automation.ts`, auto-reveal at ~1012-1018 and add-lane pass bookkeeping `endAddLanePass`). Touch pass ends on knob release (`DeviceCard.tsx:162-167`), latch ends on playback stop (D13.1 text).
11. **Lane ids are time-plus-counter strings** (`auto-${Date.now()}-${nextLaneId++}`, `stores/automation.ts:508`; `mod-…` at `:581`; `trig-…` at `:549`). Lane kinds are absolute, trigger and modulation (with `blendOp` add/multiply/max).
12. **Mapping creation UX.**
   - "Add mapping" in `LFOEditor.tsx:26-35` always targets the first effect's first param with depth 1.0, min 0, max 1.
   - Drop-on-param creates a NEW operator each time (`DeviceCard.tsx:232-262`), never connects an existing one.
   - `ModulationMatrix.tsx:118-181` lists every float/int param plus `_mix` as targets.
13. **A mapping has no mute/bypass.** `OperatorMapping` fields are target, param key, depth, min, max, curve, blend mode, `sourceKey`, `srcAxis`, `dstAxis`, `bindingRule` (`shared/types.ts:679-700`). Only the whole operator has `isEnabled`.
14. **Caps.** 32 mappings per operator, 64 operators, 2048 edges total (`shared/limits.ts:13-24`). The operator cap surfaces a toast (`DeviceCard.tsx:242-247`). No equivalent refusal was found for the per-operator mapping cap in the code I read.

## Patterns

| # | Pattern | Source + tier | Behavior | Fit / conflict | Feeds |
|---|---|---|---|---|---|
| 1 | Automation lives on the owning instance, keyed inside it | Ardour `libs/ardour/ardour/processor.h:61` (a `Processor` is a `SessionObject` and `Automatable`), `libs/ardour/ardour/automatable.h:52`, `libs/evoral/evoral/ControlSet.h:64` (controls kept in a map keyed by `Parameter`), `libs/evoral/evoral/Parameter.h:42-60` (key is type + channel + id) | Each plugin/processor *instance* owns its own set of controls and automation lists. Two instances of the same plugin each have separate lanes. The key is local to the instance. | **Evidence for an instance-scoped key.** Matches Creatrix's own automation (`${effect.id}.${key}`). Fits D2 (track = layer, nested devices). | O06 · O07 |
| 2 | Routing record with explicit disambiguators | Surge `src/common/ModulationSource.h:273-285` (`ModulationRouting`: source id, destination id, depth, muted, `source_index`, `source_scene`; the `source_scene` comment says it was added to disambiguate a global-routing case, issue #2285 in the comment) | A route is a full tuple, not one string. The second and third fields were added after an ambiguity bug. | **Evidence for defining the full key up front.** Creatrix already needed `sourceKey` for a multi-output operator (`routing.py` source_key handling, P4.2). | O07 |
| 3 | Name-pair identity in a single-engine design | Vital `src/interface/editor_sections/modulation_manager.h:183-184` (`connectModulation(source, destination)`, `removeModulation(source, destination)` take stable control-name strings) and `src/common/synth_constants.h:37` (`kMaxModulationConnections = 64`) | A connection is the pair (source name, destination name). It works because every control has one globally unique name and there is exactly one synth instance. | **Evidence for the owner's trade-off, neutral.** Name identity is simple and portable across presets, but it needs unique names. Creatrix allows duplicates of the same effect type in a chain (`MAX_EFFECTS_PER_CHAIN = 10`, `limits.ts:28`), so a name/type key cannot address them. | O07 |
| 4 | Drag a source onto a destination to connect, with a live temporary connection | Vital `modulation_manager.cpp:795-835` (`modulationDraggedToComponent`: connects while the drag hovers; initial amount is the remaining headroom of the destination's current position, doubled-min for bipolar, floored at 0.25), `:838-882` (`setTemporaryModulationBipolar`, `clearTemporaryModulation` removes the connection when the drag leaves), `:914-925` (wheel adjusts the amount during the drag), `:928-946` (`endModulationMap` clears drag state) | Hovering shows the effect immediately and an amount overlay. Leaving cancels. A modifier toggles bipolar mid-drag. | **Partly existing.** Creatrix has drop-on-param (Problem 12) but it creates a new operator with depth 1.0. The temp-connection preview and headroom-based default are new. Existing-operator drag is a **Candidate addition**. | O07 · A08 |
| 5 | Selecting a source shows all its routes on the destinations | Vital `modulation_manager.cpp:638-660` (`current_modulator_` set, amount sliders for that source's connections become visible), `:956-961` (`clearModulationSource`) | Choosing a source highlights every parameter it drives, with an amount control on each. | **Fits** the existing routing canvas and operator cards as a *focus* behavior. Not part of today's card UI (`LFOEditor.tsx` lists mappings inside the card only). | O07 · A08 |
| 6 | Per-route flags: bipolar, bypass, stereo, remove | Vital `modulation_manager.cpp:277-325` (`ModulationAmountKnob` menu: disconnect, toggle bypass, toggle bipolar, toggle stereo); Surge `ModulationRouting.muted` (`ModulationSource.h:278`) and `SurgeSynthesizer` `muteModulation/clearModulation` (`src/common/SurgeSynthesizer.h:450-452`) | A route can be muted without losing its settings. | **Gap in Creatrix** (Problem 13). Creatrix covers bipolar through `min`/`max` and `blendMode`, and enable only per operator. Per-route mute is a new field, so it is a **Candidate addition**. | O07 |
| 7 | Route list with sort and filter | Surge `src/surge-xt/gui/overlays/ModulationEditor.cpp:358-385` (row data: source, destination, depth, bipolar, muted), `:829-833` (sort by source or by target), `:323-341` (filter by source, target, control group or scene, persisted in editor state) | A single overlay lists every route, sortable and filterable, with per-row mute and clear. | **Fits the matrix as a scaling answer.** The existing `ModulationMatrix.tsx` is a source-by-target grid (`:181`). With up to 2048 edges (`limits.ts:24`) a list view with filter is the usual answer. New view, so **Candidate addition**. | O07 · A08 |
| 8 | Modulation feedback on the destination | Vital `src/interface/editor_components/modulation_meter.cpp` / `.h` (a meter drawn on the destination control showing the live modulated value) | The destination shows live movement and the authored value. | **Existing in simpler form.** `ghostValue` on `Knob` (`DeviceCard.tsx:403, 441`). A modulation *range* arc is a visual extension. Spec the content of the indicator (authored, effective, range). The arc is a **Candidate addition**. | O05 · O07 |
| 9 | Per-parameter menu lists and manages its routes | Surge `SurgeGUIEditorValueCallbacks.cpp:1200-1250` (`isModulationMuted`, mute/clear ops per routing in the control menu) | Right-click on a param lists its routes. | **Fits** the existing param context menu (`DeviceChain.tsx:566`, Automate only). See devices-params.md #10. | O05 · O07 |
| 10 | Automation states and per-lane state control | Ardour `libs/ardour/ardour/types.h:211-217` (`AutoState`: Off, Write, Touch, Play, Latch), `gtk2_ardour/automation_time_axis.cc:178-186` (a dropdown on each lane's header offers Off/Play/Write/Touch/Latch) | The mode is a property of each lane, chosen in the lane header. | **Rejected — conflicts D13/D13.1.** Creatrix ratified a single global Read/Touch/Latch dropdown in the transport and a global write-behavior glyph. Creatrix has no Write mode (Draw is lane-level painting). | O06 |
| 11 | Touch and latch end conditions | Ardour `libs/ardour/automation_control.cc:286-306` (`start_touch`: only starts for Touch or Latch, and re-aligns the value with what playback was producing), `:309-330` (`stop_touch`: Latch does not stop while the transport is rolling; Touch on a toggled (on/off) control also latches) | Touch writes while the control is held and stops at release. Latch keeps writing until the transport stops. On/off params behave as latch even in Touch. | **Confirms D13/D13.1** (Touch: knob release; Latch: until playback stops). New detail for the spec: **bool/choice params in Touch**. Decision needed. | O06 |
| 12 | Auto-thinning at the end of a write pass | Ardour `libs/evoral/ControlList.cc:547-553` (`write_pass_finished` thins only if something was written in the pass), `:386-440` (`thin`: skips on/off params; drops a point when the triangle formed with its neighbors has area below a threshold; the factor is renormalised for compatibility) | Recording produces dense points. A cleanup runs once per pass with a user-set factor. | **Conflict check with D8: not a conflict.** D8 moved manual Simplify to the lane menu. Auto-thin would add an automatic step, a new behavior, so it is a **Candidate addition**. If the owner wants it, the algorithm family differs from the existing RDP (`automation-simplify.ts`). | O06 |
| 13 | Anchoring a pass so earlier curve survives | Ardour `libs/evoral/ControlList.cc:559-575` (`set_in_write_pass(yn, add_point, when)` can add a guard point at pass start) | A pass start can place an anchor point so the curve before the pass stays intact. | **Fits** the existing "replace nearby, release resumes" (RATIFIED D2 note in `automation-record.ts`). Whether Creatrix needs an explicit anchor is untested. Spec question. | O06 |
| 14 | Macro as a modulation source (cross-ref) | Vital `src/interface/editor_sections/macro_knob_section.cpp:47-61` | See devices-params.md #11. | Fits instrument macros (`components/instruments/types.ts:380-415`). | O07 |

## Recommendation for the spec

**Identity key (owner ruling: define ONE key).** The reference evidence supports an instance-scoped key (patterns 1, 2, 3) and the in-repo evidence points the same way. This is the evidence for the choice. The final fix decision stays with the owner.

1. **(#1, #2, Problem A.3, A.5)** Define one address type, **ParamAddress = { ownerKind, ownerId, paramKey [, subKey] }**. `ownerKind` covers device (effect instance), pad (instrument rack pad) and clip-transform. `ownerId` is the stable instance UUID, never the registry type. Automation lanes, operator mappings, CC mappings, macro routes and clip-transform lanes all use it. `subKey` is the existing `sourceKey` for multi-output operators (pattern #2 shows why disambiguators belong in the key from day one).
2. **(#1, Problem A.1-A.2)** Why instance and not type, with the evidence side by side:
   - Ardour keeps automation on the instance (#1). Surge extends the key tuple when ambiguity appears (#2). Vital's name identity works only for one engine with unique names (#3).
   - Creatrix duplicates of one effect type are allowed, and the backend map overwrites the earlier instance (`routing.py:216-218`). A type key cannot address both.
   - Automation, CC, ghost values and four of the mapping writers already use the instance id (Problem A.3-A.5). Choosing instance means changing the serializer (`ipc-serialize.ts:45`) and the backend map. Choosing type means changing every writer and still cannot address duplicates.
   - **Counter-case, stated for neutrality:** a type key is portable across projects (a preset that says "any hue-shift's amount" survives replacing the device), and the wire already speaks it. That portability is the one thing the instance key loses. If wanted, it belongs in presets, not in project mappings.
3. **(Problem A.6)** Encode the address on the wire as **separate fields**, not a dotted string, so no parser ambiguity (FIRST vs LAST dot) can exist. If a string form is needed for lane ids or file keys, the spec defines the separator and escaping once and both layers import it.
4. **(Problem A.2, A.7)** Unknown target must never be silent. The spec requires: (a) the backend reports unresolved routes in its response, (b) the frontend marks the mapping as *orphaned* in the operator card, matrix and routing canvas, and (c) device delete either removes its dependent mappings and lanes in the same undo step or turns them into visibly orphaned items. Pick one in the spec; undo must restore them.
5. **(Problem A.2-A.4)** **End-to-end oracle:** create a device, map an LFO to a param, render a frame twice with different LFO phases, and assert the output pixels or the effective param differ. Repeat with two instances of the same effect type to prove they are addressed independently. This closes the recurrence noted in the ledger (see `docs/spec/01-FEATURE-MAP.md:92-93`).
6. **(Problem A.4)** The ghost value shown on a knob must be computed from the same resolved route list the engine used, or be returned by the engine. Two parallel resolvers (`resolveGhostValues.ts` and `routing.py`) are what let the UI disagree with the render.
7. **(Problem 12)** "Add mapping" (`LFOEditor.tsx:26-35`) must not silently pick the first param. The spec requires an explicit target choice. The matrix list at `ModulationMatrix.tsx:118-134` is the existing pattern.
8. **(#4, Problem 12)** Specify the current drop-on-param contract exactly: creates a new operator of the dragged type, a mapping with depth 1.0, min 0, max 1, linear, refuses with a toast at the operator cap, and no-ops otherwise. Add the missing refusal toast for the mapping cap (Problem 14).
9. **(#9)** Specify the current param menu (Automate only). A menu that lists and removes the routes targeting the param is a Candidate addition (see devices-params.md Candidate 3).
10. **(#10, D13, D13.1)** Record "per-lane mode" as rejected with the D-row reference. Keep the global mode and write-behavior model.
11. **(#11)** Add a short semantics table for Read, Touch, Latch and the three write behaviors (replace, overdub, add-lane), and an explicit rule for non-numeric params (bool, choice) in Touch. D13's hover legend is the wording source.
12. **(#13)** Spec what happens to the curve at pass start and end (replace window 0.033 s, release resumes) so the behavior is testable.
13. **(Problem 11)** State the lane id scheme and its uniqueness guarantee on project load, since lane ids are `Date.now` plus a module counter.
14. **(#8, #14)** Define the modulation indicator's content: authored value, effective value, and (if approved) range.

## Library evidence

No library is relevant here. Ardour, Vital and Surge are GPL and are patterns-only references. The Creatrix store and backend are bespoke. Nothing in this topic is a candidate for adoption.

## Candidate additions (owner approval required)

1. **Drag an existing operator onto a param** with a live temporary connection and a headroom-based default amount (#4).
2. **Source focus**: selecting an operator highlights every param it drives (#5).
3. **Per-route mute/bypass** field on `OperatorMapping` (#6).
4. **Route list view** with sort by source/target and filter (#7).
5. **Modulation range arc** on knobs (#8).
6. **Auto-thinning at the end of a record pass** (#12).
7. **Type-portable preset targets** ("any device of this type"), as the preset-level answer to the portability counter-case in rec 2.
