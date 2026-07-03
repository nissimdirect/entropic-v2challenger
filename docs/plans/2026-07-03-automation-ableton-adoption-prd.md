
---

## CORRECTION (2026-07-03, post-code-verification) — operator overlap

Verifying `stores/operators.ts` + `types.ts:629` (OperatorMapping) shows Creatrix ALREADY has
relative, depth-scaled, CROSS-DOMAIN modulation — via **operators** (LFO / Kentaro 8-LFO /
env-follower) with `depth` + `bindingRule` (broadcast/sampleAt/scanOver/integrate) + srcAxis→dstAxis.
So the AA.2/AA.3 gap is NARROWER and more precise than first written:

- **What's genuinely missing is DRAWN/RECORDED relative modulation** (a hand-shaped envelope on the
  automation-lane surface, edited with breakpoints/curves/transform box), as opposed to operators'
  GENERATIVE modulation (rack params). Ableton's blue relative envelope IS drawable — that's the gap.
- **AA.3 (generators/LFO/audio-follower on a lane) PARTIALLY DUPLICATES the operator system.** Do NOT
  build a second parallel modulation engine (dual-taxonomy trap). Instead: **AA.2/AA.3 should expose the
  EXISTING operator as a lane-native, drawable, cross-domain layer** — unify the automation-lane surface
  and the operator rack, not add a third system. The audio-follower (AA.3) may already exist as an
  operator (env-follower) — confirm; if so, AA.3 = surface it on a lane, not rebuild it.
- **Revised AA.2 scope:** (a) a `kind:'modulation'` lane that is a DRAWN relative envelope with a blend-op
  (the new drawable case), AND (b) let an existing OPERATOR bind to a param AS a modulation lane on the
  same surface (unify UI/mental-model). Keep the cross-domain compositing contract as the hard part.
- **Pre-AA.2 verification (added):** map exactly what OperatorMapping already composes at render time
  (evaluateAutomationOverrides + axis-lanes buildAxisLanes) so AA.2 EXTENDS it, never forks it.
