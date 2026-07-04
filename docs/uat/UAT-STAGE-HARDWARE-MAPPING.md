# UAT Stage — Hardware Mapping (H1-H7)

**Closes:** #426 — the hardware-mapping suite (H1-H7: focus-context selector,
bank-relative CC resolve, MIDI-learn surface, CC-records-automation,
controller-identity persistence, velocity, bank paging + HUD) shipped with no
UAT stage. This is that stage.

**Scope — PRs covered:** #345 (H1), #351 (H2), #356 (H3), #361 (H4), #365 (H5),
#373 (H6), #376 (H7), #296 (MIDI-learn hardening: rate-limit + echo-suppression
+ persistence round-trip, feeding H4/H5).

**How to read this doc:** each checkpoint is Given/When/Then, then a status:

- **AUTOMATED** — a vitest spec exercises this exact behavior; the spec file
  is named. Runnable via `cd frontend && npx --no vitest run <path>`.
- **CU-MANUAL** — genuinely needs a live Electron app plus a real or virtual
  MIDI controller (actual Web MIDI permission grant, actual device timing,
  actual on-screen visual confirmation). No vitest spec can prove this layer;
  per the project's UAT rule, a feature is covered ONLY if a user can REACH
  and USE it by driving the running app, not because code exists for it.
- **BLOCKED-BY-BUG** — the flow is not reachable through any UI in the
  shipped app; a bug was filed instead of being fixed (out of scope for this
  tests/docs-only task). The checkpoint stays open until the bug ships.

**New automated coverage added by this stage:**
`frontend/src/__tests__/integration/hardware-mapping-uat.test.ts` — 12 tests
that chain the H1-H7 packets into continuous sessions (one physical CC,
never re-learned, carried through focus changes / bank paging / recording),
injected at `handleMIDIMessage` — the exact call `useMIDI.ts`'s
`onmidimessage` handler makes for real hardware. This closes the gap that the
existing per-packet unit suites (listed inline below) each prove their own
slice in isolation but never combine them into one session.

---

## Section A — H1: focus-context selector

1. **Given** a rack pad is selected on Track A while Track B is the active
   track, **when** nothing else changes, **then** the mapping context is NOT
   `rack-pad` for Track A's pad (the "Tiger fix" precedence rule) — it falls
   through to Track B's own context.
   **AUTOMATED** — `frontend/src/__tests__/integration/hardware-mapping-uat.test.ts`
   ("a pad selected on the OTHER track does not steal bank focus (Tiger fix)");
   also `frontend/src/__tests__/utils/focusContext.test.ts`.

2. **Given** an effect is selected on the active track, **when** the user
   looks at the statusbar, **then** the `MappingContextChip` shows
   `◎ effect · <name>`; deselecting shows nothing (chip hidden for
   `kind: 'none'`).
   **AUTOMATED** — `frontend/src/__tests__/components/mapping-context-chip.test.tsx`
   (renders the real component via `@testing-library/react`, no MIDI hardware
   needed for this step).

3. **Given** a clip is selected on the currently-selected track, **when** a
   second clip is also select-toggled, **then** the mapping context tracks
   the LAST-interacted (primary) clip, not the first.
   **AUTOMATED** — `frontend/src/__tests__/utils/focusContext.test.ts`.

## Section B — H2: bank-relative CC resolve

4. **Given** a physical CC is bound to bank slot (row, col) and that slot is
   assigned to an effect param for the focused context, **when** the knob
   moves, **then** the chain's cloned effect param visibly changes to the
   CC's normalized value.
   **AUTOMATED** — `hardware-mapping-uat.test.ts` ("the SAME physical CC...
   resolves to a DIFFERENT effect param as focus moves between two tracks");
   `frontend/src/__tests__/renderer/bank-resolver.test.ts`.

5. **Given** the SAME physical CC/slot binding, **when** the user switches
   focus to a different track/effect/clip WITHOUT re-learning anything,
   **then** the same knob now drives whatever that new context's bank
   assignment says (focus-follows) — proven by observing the OLD target is
   simultaneously untouched by the new move.
   **AUTOMATED** — `hardware-mapping-uat.test.ts` (same test as #4);
   `bank-resolver.test.ts` ("focus-follows proof").

6. **Given** a project file with `ccBankBindings` + `bankAssignments` +
   `ccSlotMappings` populated, **when** the project is saved then reopened,
   **then** all three round-trip byte-for-byte through
   `getMIDIPersistData` -> `loadMIDIMappings`.
   **AUTOMATED** — `hardware-mapping-uat.test.ts` ("ccBankBindings,
   bankAssignments, and ccSlotMappings all round-trip..."); `bank-resolver.test.ts`
   ("H2 bank persistence + validation").

7. **Given** a NON-MIDImix physical controller (e.g. a Novation Launch
   Control XL, or any generic/DIY controller), **when** the user tries to
   teach the app "my knob sending CC 20 is bank slot row 2, col 5" through
   any UI affordance (right-click on a bank slot, a learn button in MIDI Map
   mode, anything), **then** a binding should be created.
   **BLOCKED-BY-BUG** — issue **#440**. `setCCBankBinding` (the only store
   action that writes `ccBankBindings`) has zero UI call sites anywhere in
   the app outside the Akai-MIDImix factory-profile path
   (`applyControllerProfile`, wired to `MIDIMapOverlay`'s "Load factory
   mapping" button and the on-connect auto-apply in `stores/midi.ts`). Every
   `LearnTarget` variant `handleMIDIMessage` understands (`pad`, `cc`,
   `slot`) writes somewhere else (`padMidiNotes`, legacy `ccMappings`, or the
   H3 `ccSlotMappings` absolute binding) — none of them ever calls
   `setCCBankBinding`. A user without a recognized MIDImix cannot use the H2
   bank system at all through the shipped UI.

8. **Given** an Akai MIDImix, **when** it connects for the first time with no
   saved learn for its fingerprint, **then** the factory 32-binding CC map is
   auto-applied and a "MIDImix factory mapping loaded" toast appears; **when**
   the user instead clicks "Load factory mapping" in MIDI Map mode, **then**
   the same 32 bindings overwrite whatever was there.
   **CU-MANUAL** — needs a real (or OS-level virtual) Akai MIDImix connected
   to the live app to prove the Web MIDI enumeration path; the store-level
   logic and the button click are separately AUTOMATED via
   `frontend/src/__tests__/stores/controller-identity.test.ts` ("E18 — MIDImix
   factory-profile auto-apply on connect") and
   `frontend/src/__tests__/components/performance/midi-map-overlay.test.tsx`
   ("manual factory-mapping load").

9. **Given** MIDI Map mode is open, **when** the user clicks an empty bank
   slot then clicks a candidate param for the focused context, **then** the
   slot's `bankAssignments` override is written and the grid re-renders with
   the new target (badged "user-overridden" vs "auto-default").
   **AUTOMATED** — `frontend/src/__tests__/components/performance/midi-map-overlay.test.tsx`
   ("click-to-assign").

## Section C — H3: MIDI-learn surface (macro / instrument / transform / mask)

10. **Given** a rack macro slider, instrument knob (Sampler/Granulator/
    FrameBank), transform field, or mask op slider, **when** the user
    right-clicks it, **then** the correct `LearnTarget{type:'slot'}` is
    armed; **when** the next physical CC arrives, **then** it binds a
    `CCSlotMapping` for that exact target.
    **AUTOMATED** — `frontend/src/__tests__/components/performance/h3-learn-surface.test.tsx`
    (right-click arming via real component render + `fireEvent.contextMenu`)
    combined with `hardware-mapping-uat.test.ts` ("arming a macro-slot learn
    and moving a CC binds a direct CCSlotMapping..." — the CC half fed via
    `handleMIDIMessage`, the same boundary real hardware uses).

11. **Given** a slot-learn is armed, **when** a note-on (not a CC) arrives,
    **then** the learn stays armed (a pad/note message must not accidentally
    consume a knob-learn).
    **AUTOMATED** — `hardware-mapping-uat.test.ts` ("note-on (not a CC) does
    not consume a slot learn").

12. **Given** an effect-knob right-click-learn (the pre-existing, unchanged
    legacy path) happens in the same session as an H3 slot-learn, **when**
    both complete, **then** the effect-knob learn writes only legacy
    `ccMappings` and never touches `ccSlotMappings` (no cross-contamination
    between the two learn systems).
    **AUTOMATED** — `hardware-mapping-uat.test.ts` (same test as #10, second
    half); `h3-learn-surface.test.tsx` ("H3 regression: legacy effect-knob
    learn is unchanged").

## Section D — H4: CC-records-automation

13. **Given** automation is armed (`latch`/`touch` mode, an armed track,
    transport playing) and a bank-bound CC resolves to an effect-param lane,
    **when** the physical knob moves, **then** a point is recorded into that
    lane at the current playhead time with the CC's normalized value.
    **AUTOMATED** — `hardware-mapping-uat.test.ts` ("a bank-bound CC records
    into the resolved lane..."); `frontend/src/__tests__/utils/cc-record.test.ts`.

14. **Given** the SAME physical CC as #13, **when** the user changes focus to
    a different context mid-session, **then** the next knob move records into
    the NEW context's resolved lane — proving "focus-follows-records", not
    just "focus-follows" for the live overlay.
    **AUTOMATED** — `hardware-mapping-uat.test.ts` (same test as #13, second
    half — both moves fed through the real `handleMIDIMessage` +
    `installCCRecordSubscriber` boundary, not `recordCCMove` called
    directly); `cc-record.test.ts` ("focus-follows-records proof").

15. **Given** automation is in `read`/`draw` mode, no armed track, or the
    transport is stopped, **when** a bound CC moves, **then** ZERO points are
    recorded (byte-identical to pre-H4 behavior — hardware CC stays a
    transient overlay only).
    **AUTOMATED** — `hardware-mapping-uat.test.ts` ("read mode (not armed)
    records nothing, even as the CC keeps flowing through handleMIDIMessage");
    `cc-record.test.ts` ("not-armed regression").

## Section E — H5: controller-identity persistence

16. **Given** a controller is connected and the user learns bank-slot
    bindings, **when** the project is closed/reopened (or the app is
    relaunched) and the SAME physical controller reconnects, **then** its
    bindings are auto-restored without re-learning.
    **AUTOMATED** — `hardware-mapping-uat.test.ts` ("a learned bank binding
    survives resetMIDI (project close/reopen) once the SAME controller
    reconnects" — this exercises `resetMIDI()` [what
    `project-persistence.ts`'s `hydrateStores` actually calls on load] +
    `applyControllerIdentity` [what `useMIDI.ts`'s reconnect handshake
    actually calls], not a mocked stand-in for either); also
    `frontend/src/__tests__/stores/controller-identity.test.ts`.

17. **Note on where this persists — checked, not assumed:** `getMIDIPersistData`
    / `loadMIDIMappings` (the actual project-file save/load boundary) never
    carry `activeControllerFingerprint` — confirmed by reading both functions
    and by `hardware-mapping-uat.test.ts` ("getMIDIPersistData does NOT carry
    activeControllerFingerprint"). This is BY DESIGN per the H5 module doc in
    `shared/controllerIdentity.ts`: the fingerprint->bindings map lives in
    `localStorage` (APP-scoped, key `creatrix-controller-bindings`), not in
    the `.glitch` project file (PROJECT-scoped). Checkpoint #16 is the correct
    round-trip proof for this feature, not a project-file assertion — flagging
    this explicitly since the sibling sampler-persistence bug (#315) was
    exactly a case where an assumed round-trip silently didn't happen; here it
    genuinely does, just through a different mechanism than the project file.
    **AUTOMATED** — `hardware-mapping-uat.test.ts` (both tests above).

18. **Given** a DIFFERENT physical controller connects after a project
    reopen, **when** it has no saved bindings of its own, **then** it starts
    with an EMPTY bank map — it must never inherit the previous session's
    controller's bindings.
    **AUTOMATED** — `hardware-mapping-uat.test.ts` ("a DIFFERENT controller
    reconnecting after reopen gets its own (empty) bindings").

19. **Given** a real controller physically disconnects and reconnects (hot-plug,
    sleep/wake, cable reseat) while the app is running, **then** the identity
    re-derivation and re-apply happens through the actual Web MIDI
    `onstatechange` event, not a synthetic store call.
    **CU-MANUAL** — needs a real/virtual MIDI device physically unplugged and
    replugged into the live app; the underlying re-derive logic is separately
    AUTOMATED via `frontend/src/__tests__/hooks/useMIDI.test.ts` and
    `controller-identity.test.ts`.

## Section F — H6: velocity

20. **Given** a MIDI pad is mapped to a physical drum pad/key, **when** the
    user hits it softly vs. hard, **then** `padStates[pad].velocity` reflects
    the actual struck velocity (not hardcoded to 127), and a soft hit produces
    a visibly lower ADSR envelope peak than a hard hit.
    **AUTOMATED** — `hardware-mapping-uat.test.ts` ("a soft hit and a hard hit
    on the same pad produce different padStates.velocity"), fed through the
    real `handleMIDIMessage` boundary; `frontend/src/__tests__/h6-velocity-plumbing.test.ts`.

21. **Given** a keyboard/mouse pad trigger (no velocity source), **when** it
    fires, **then** velocity still defaults to 127 (byte-identical to
    pre-H6 behavior) — no regression for non-MIDI triggers.
    **AUTOMATED** — `h6-velocity-plumbing.test.ts` ("keyboard/mouse triggers...
    default to 127").

22. **Given** a real velocity-sensitive pad controller (e.g. nanoPAD2,
    Launchpad), **when** the user physically varies hit force, **then** the
    on-screen pad visualization / audible envelope response is perceptibly
    different between a soft and hard hit.
    **CU-MANUAL** — needs a real velocity-sensitive controller and eyes/ears
    on the live app; the signal-chain math is separately AUTOMATED (above).

## Section G — H7: bank paging + HUD

23. **Given** `ccBankBindings` is non-empty, **when** the user looks at the
    statusbar, **then** `BankPagingHUD` is visible showing "Bank N/MAX";
    it is hidden entirely when no bindings exist.
    **AUTOMATED** — `frontend/src/__tests__/components/bank-paging-hud.test.tsx`.

24. **Given** a bank-bound CC resolves to param X on page 0, **when** the
    user clicks the HUD's right-arrow (or the equivalent store action
    `bankPageRight`), **then** the SAME physical CC now resolves to a
    DIFFERENT param on the new page for the SAME focused context, and the HUD
    label increments.
    **AUTOMATED** — `hardware-mapping-uat.test.ts` ("bankPageRight... changes
    the resolved effect param for an already-bound CC, fed via
    handleMIDIMessage"); `frontend/src/__tests__/renderer/bank-paging.test.ts`;
    `bank-paging-hud.test.tsx` (button click -> store action -> re-render).

25. **Given** the user is already on the last bank page, **when** they click
    right again (or the first page and click left), **then** paging clamps
    at the rail (no wrap) and the corresponding HUD arrow button is disabled.
    **AUTOMATED** — `renderer/bank-paging.test.ts` ("clamped at MAX_BANK_PAGES
    - 1 (no wrap)"); `bank-paging-hud.test.tsx`.

26. **Given** the physical MIDImix hardware BANK L/R buttons (which, per
    Akai's own documentation, transmit no MIDI at all — they silently
    reconfigure what CCs the controller's own knobs send), **when** the user
    presses them, **then** nothing in this app reacts (by design — paging is
    a software-only click control, `BankPagingHUD`, not a listener for a
    physical button).
    **CU-MANUAL** (documentation/expectation-setting checkpoint only — confirms
    the ABSENCE of a reaction is correct, not a bug, when physically tested
    with real MIDImix hardware).

---

## Tally

- **26 checkpoints total.**
- **21 AUTOMATED** (specs listed inline; new coverage:
  `frontend/src/__tests__/integration/hardware-mapping-uat.test.ts`, 12 tests).
- **4 CU-MANUAL** (#8, #19, #22, #26 — all require real/virtual MIDI hardware
  physically connected to the live app; nothing in a vitest process can
  substitute for Web MIDI device enumeration, hot-plug timing, or a human
  judging perceived hit-force response).
- **1 BLOCKED-BY-BUG** (#7 — issue #440: no UI path exists to learn a bank-slot
  binding for non-MIDImix hardware).
