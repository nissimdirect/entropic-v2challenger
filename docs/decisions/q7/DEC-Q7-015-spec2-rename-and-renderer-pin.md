# DEC-Q7-015 — SPEC-2 rename to `AutomationLane` + renderer-site pin

**Status:** Decided 2026-06-03
**Owner:** Q7 PR #8 (Session 2)
**Scope:** Resolves the two open SPEC-2 followups from ACTIVE-TASKS — P1-C (Lane vs AutomationLane naming) and P1-D (where does `domain='y'` evaluation live).

## Question

Two open items from the 2026-06-03 schema reconciliation pass:

- **P1-C:** SPEC-2 references `Lane` and `InterpolationMode` as if they were PR-B deliverables. What's the real shape today?
- **P1-D:** SPEC-2 says `domain='y'` evaluation belongs "wherever PR-B lands lane eval." Where is that, in current code?

Compounding: as of 2026-06-03 17:00 UTC, **Creatrix PR-A/PR-B/PR-C have NOT been opened.** Only PR-zero (#116) and PR-D rebrand (#120) have shipped. The original SPEC-2 injection plan assumed PR-B would land soon and INJ-5 would ride in. That assumption no longer holds; the Q7 work needs to advance without PR-B.

## Decision

### P1-C resolution: `AutomationLane` is the canonical type

Verified at `frontend/src/shared/types.ts:261`:

```ts
export interface AutomationLane {
  id: string;
  paramPath: string;
  color: string;
  isVisible: boolean;
  points: AutomationPoint[];
  isTrigger: boolean;
  triggerMode?: TriggerMode;
  triggerADSR?: ADSREnvelope;
}
```

- **Type already exists** as `AutomationLane`. SPEC-2's references to `Lane` are documentation-level only — the type was always `AutomationLane`.
- **`InterpolationMode` does NOT exist yet.** SPEC-2 expected PR-B to add it; PR-B hasn't shipped. PR #8 adds it as an exported type in a new file (see "Module placement" below).
- **Action:** update SPEC-2 doc to use `AutomationLane` everywhere instead of `Lane`. No code rename needed.

### P1-D resolution: renderer site = `frontend/src/renderer/utils/automation-evaluate.ts`

The function `evaluateAutomation(lane: AutomationLane, time: number): number | null` at this path is the canonical lane-evaluation site as of `origin/main` SHA `6472597`. When SPEC-2's `domain='y'` shipping arrives, the renderer change is:

- Add a new function `evaluateAutomationOnAxis(lane, axisValue, axisName)` that reads `lane.axisBinding.domain` to know which axis (t / y / x / c / f / l) to evaluate at
- Keep the existing `evaluateAutomation(lane, time)` as a backward-compat wrapper that calls `evaluateAutomationOnAxis(lane, time, 't')`

### Module placement: NEW file `frontend/src/shared/axis-binding.ts`

To avoid collision with future Creatrix PR-B edits to `shared/types.ts`, **PR #8 ships the B4-lite schema additions in a SEPARATE module** rather than extending `AutomationLane` directly:

```ts
// frontend/src/shared/axis-binding.ts

export type Axis = 't' | 'y' | 'x' | 'c' | 'f' | 'l';
export type BindingRule =
  | 'broadcast' | 'sampleAt' | 'scanOver' | 'integrate'
  | 'painted' | 'hilbert' | 'polar' | 'learned';

export type InterpolationMode = 'linear' | 'step' | 'cubic' | 'cosine';

export interface LaneAxisBinding {
  domain: Axis;
  bindingRule: BindingRule;
  interpolationMode: InterpolationMode;
}

export const TIER_1_BINDING_RULES: ReadonlyArray<BindingRule> = ['broadcast'];

export function isTier1BindingRule(rule: BindingRule): boolean { ... }
export function validateBindingRule(rule: BindingRule, tier: 1 | 3): boolean { ... }
```

When PR-B eventually lands and wants to extend `AutomationLane`, it imports `LaneAxisBinding` from `shared/axis-binding` and adds `axisBinding?: LaneAxisBinding` as an OPTIONAL field. No merge conflict because the schema lives in a separate file.

### `AutomationLane` extension: DEFERRED to PR-B (or follow-up)

PR #8 does NOT modify `frontend/src/shared/types.ts:AutomationLane`. The `axisBinding` field stays unmounted until either:
1. Creatrix PR-B ships and absorbs the addition, OR
2. A separate small PR adds the optional field when there's a real consumer

This is the safer path — adding an unused optional field today creates dead code and risks bit-rot.

## Considered alternatives

- **Extend `AutomationLane` directly in PR #8** — REJECTED. Adds dead code; conflicts with PR-B's future schema; "ship now, retrofit later" pattern bit us in the past.
- **Wait for PR-B before shipping any SPEC-2 work** — REJECTED. PR-B may not happen for weeks; Q7 Session 2 shouldn't stall.
- **Put schema additions in `shared/types.ts` under a `// SPEC-2` section** — REJECTED. Still risks PR-B conflict and clutters the main types file.
- **Add a `domain` field directly to `AutomationLane`** (no separate module) — REJECTED. SPEC-2 was designed to be composable; the 8-member union shouldn't be embedded inline.

## Side effects

- New file: `frontend/src/shared/axis-binding.ts` (~80 lines)
- New test: `frontend/src/__tests__/shared/axis-binding.test.ts`
- SPEC-2 doc gets `AutomationLane` rename (P1-C closed) + renderer site pinned to `automation-evaluate.ts:evaluateAutomation` (P1-D closed)
- ACTIVE-TASKS P1-C + P1-D move to closed; P2-B (SG-1 owner) remains open

## Verification

After PR #8 merges:

```bash
# Schema types importable
cd frontend && npx tsc --noEmit --strict src/shared/axis-binding.ts

# Tier 1 validator works
node -e "
const { validateBindingRule, TIER_1_BINDING_RULES } = require('./src/shared/axis-binding');
console.log('broadcast tier 1:', validateBindingRule('broadcast', 1));
console.log('painted tier 1:', validateBindingRule('painted', 1));  // false
console.log('painted tier 3:', validateBindingRule('painted', 3));  // true
"

# Renderer site exists at the pinned path
test -f frontend/src/renderer/utils/automation-evaluate.ts && echo "OK: pinned site exists"
```

## Cross-references

- SPEC-2: `~/.claude/plans/entropic-spec-2-b4lite-schema.md` (updated by PR #8)
- ACTIVE-TASKS Creatrix Vision spec pass section (P1-C + P1-D → closed)
- Renderer site: `frontend/src/renderer/utils/automation-evaluate.ts:evaluateAutomation` (origin/main `6472597`)
- Type: `frontend/src/shared/types.ts:261` `AutomationLane` (unchanged)
- INJ-5 (Creatrix PR-B injection): superseded by this decision when PR-B ships
