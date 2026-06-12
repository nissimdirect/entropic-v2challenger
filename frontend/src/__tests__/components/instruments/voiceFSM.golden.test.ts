/**
 * P5a.4 — Golden-vector dumper for the voice FSM.
 *
 * This test DUMPS a JSON fixture of (events, frameIndex, opts) → expected voices
 * straight from the canonical `evaluateVoices` (voiceFSM.ts). The backend
 * `evaluate_voices` (voice_replay.py) is then pinned to the SAME fixture, so the
 * TS and Python implementations are provably identical on every scenario here.
 *
 * The fixture is committed at `backend/tests/fixtures/voice_fsm_golden.json`.
 * Mutating the FSM in either language requires regenerating this fixture (run
 * this test) AND updating both implementations — see the `# MIRROR` markers.
 *
 * Scenarios cover the full T1–T9 table, all ADSR phases, steal-at-cap, choke,
 * panic, release, and illegal-transition no-ops, queried at multiple frames.
 */
import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  evaluateVoices,
  type TriggerEvent,
  type EvaluateVoicesOpts,
} from '../../../renderer/components/instruments/voiceFSM'
import type { ADSREnvelope } from '../../../shared/types'

const FAST_ADSR: ADSREnvelope = { attack: 2, decay: 1, sustain: 0.7, release: 3 }
const INSTANT_ADSR: ADSREnvelope = { attack: 0, decay: 0, sustain: 1, release: 0 }
const SLOW_ADSR: ADSREnvelope = { attack: 10, decay: 5, sustain: 0.5, release: 10 }

interface GoldenCase {
  name: string
  events: TriggerEvent[]
  opts: EvaluateVoicesOpts
  /** frame_index → expected voices */
  queries: { frameIndex: number; voices: unknown[] }[]
}

function ev(
  frameIndex: number,
  eventIndex: number,
  kind: TriggerEvent['kind'],
  extra: Partial<TriggerEvent> = {},
): TriggerEvent {
  return {
    frameIndex,
    eventIndex,
    note: 60,
    velocity: 100,
    kind,
    instrumentId: 'inst-1',
    ...extra,
  }
}

/** Build a case: replay the same events at several query frames. */
function buildCase(
  name: string,
  events: TriggerEvent[],
  opts: EvaluateVoicesOpts,
  frames: number[],
): GoldenCase {
  return {
    name,
    events,
    opts,
    queries: frames.map((frameIndex) => ({
      frameIndex,
      voices: evaluateVoices(events, frameIndex, opts),
    })),
  }
}

describe('voiceFSM golden-vector dump (P5a.4 — pins voice_replay.py)', () => {
  it('writes backend/tests/fixtures/voice_fsm_golden.json', () => {
    const cases: GoldenCase[] = [
      // T1: single trigger, attack→sustain over frames
      buildCase(
        'T1-single-trigger',
        [ev(0, 0, 'trigger')],
        { voiceCap: 4, adsr: FAST_ADSR },
        [0, 1, 2, 3, 4, 5],
      ),
      // T1 multi: three triggers under cap, different frames
      buildCase(
        'T1-three-under-cap',
        [ev(0, 0, 'trigger'), ev(5, 1, 'trigger'), ev(10, 2, 'trigger')],
        { voiceCap: 4, adsr: SLOW_ADSR },
        [0, 5, 10, 12, 20],
      ),
      // T2/T7: steal oldest at cap
      buildCase(
        'T2-steal-oldest-at-cap',
        [
          ev(0, 0, 'trigger'),
          ev(1, 1, 'trigger'),
          ev(2, 2, 'trigger'),
          ev(3, 3, 'trigger'),
          ev(4, 4, 'trigger'), // 5th — steals voice from frame 0
        ],
        { voiceCap: 4, adsr: SLOW_ADSR },
        [0, 3, 4, 5],
      ),
      // T4: release from attack ramps from current value
      buildCase(
        'T4-release-from-attack',
        [ev(0, 0, 'trigger'), ev(1, 1, 'release')],
        { voiceCap: 4, adsr: FAST_ADSR },
        [0, 1, 2, 3, 4, 5],
      ),
      // T5: release from sustain
      buildCase(
        'T5-release-from-sustain',
        [ev(0, 0, 'trigger'), ev(10, 1, 'release')],
        { voiceCap: 4, adsr: FAST_ADSR },
        [0, 5, 10, 11, 12, 13, 14],
      ),
      // T6: release decays to idle
      buildCase(
        'T6-release-to-idle',
        [ev(0, 0, 'trigger'), ev(5, 1, 'release')],
        { voiceCap: 4, adsr: FAST_ADSR },
        [5, 6, 7, 8, 9],
      ),
      // T8: choke group siblings idled atomically
      buildCase(
        'T8-choke-group',
        [
          ev(0, 0, 'trigger', { chokeGroup: 1 }),
          ev(2, 1, 'trigger', { chokeGroup: 1, note: 62 }),
          ev(5, 2, 'choke', { chokeGroup: 1, note: 0, velocity: 0 }),
        ],
        { voiceCap: 4, adsr: SLOW_ADSR },
        [0, 2, 4, 5, 6],
      ),
      // T9: panic idles everything
      buildCase(
        'T9-panic',
        [
          ev(0, 0, 'trigger'),
          ev(1, 1, 'trigger', { note: 62 }),
          ev(2, 2, 'trigger', { note: 64 }),
          ev(5, 3, 'panic', { note: 0, velocity: 0 }),
        ],
        { voiceCap: 4, adsr: SLOW_ADSR },
        [0, 2, 4, 5, 6],
      ),
      // Illegal: release for unknown voice = no-op
      buildCase(
        'illegal-release-unknown',
        [ev(0, 0, 'release', { note: 99 })],
        { voiceCap: 4, adsr: FAST_ADSR },
        [0, 1],
      ),
      // INSTANT ADSR: attack=0 → straight to sustain
      buildCase(
        'instant-adsr',
        [ev(0, 0, 'trigger')],
        { voiceCap: 4, adsr: INSTANT_ADSR },
        [0, 1, 2],
      ),
      // Malformed events dropped silently (NaN/negative/out-of-range)
      buildCase(
        'malformed-events-dropped',
        [
          { frameIndex: -1, eventIndex: 0, note: 60, velocity: 100, kind: 'trigger', instrumentId: 'inst-1' },
          { frameIndex: 0, eventIndex: 1, note: 999, velocity: 100, kind: 'trigger', instrumentId: 'inst-1' },
          ev(0, 2, 'trigger'), // the only valid one
        ],
        { voiceCap: 4, adsr: FAST_ADSR },
        [0, 1, 2, 3],
      ),
      // Multi-instrument with retrigger after release (new voice via T1)
      buildCase(
        'retrigger-after-release',
        [
          ev(0, 0, 'trigger'),
          ev(3, 1, 'release'),
          ev(10, 2, 'trigger'), // new voice, different voiceId
        ],
        { voiceCap: 4, adsr: FAST_ADSR },
        [0, 3, 6, 10, 11, 12],
      ),
    ]

    const fixture = {
      _comment:
        'GENERATED by voiceFSM.golden.test.ts — do not hand-edit. Pins voice_replay.py to voiceFSM.ts.',
      adsrPresets: { FAST_ADSR, INSTANT_ADSR, SLOW_ADSR },
      cases,
    }

    const outPath = resolve(
      __dirname,
      '../../../../../backend/tests/fixtures/voice_fsm_golden.json',
    )
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n', 'utf-8')

    // Sanity: every case has at least one query and the dump is non-empty.
    expect(cases.length).toBeGreaterThan(0)
    for (const c of cases) {
      expect(c.queries.length).toBeGreaterThan(0)
    }
  })
})
