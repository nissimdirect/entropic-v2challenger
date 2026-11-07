# Interview queue: decisions the owner makes to clear the cross-reference findings

This queue turns every open issue in "02 — Cross-reference: every plan, up, down and across"
(`02-CROSSREF.md`) into one decision for the owner. The 79 open questions, 11 live bugs,
14 blocking law contradictions, cross-plan conflicts and 4 pending owner calls collapse into the
questions below. Each source item appears under exactly one question.

How each question is asked in the session:

- One question per message.
- The question names the person, the screen and what they see.
- The choices come first, one per line, with the recommendation first.
- The sources come after the choices.

Each answer is recorded here as a **Verdict** line. Verdicts that change law become rows in
`docs/frontend/RATIFIED-FOUNDATIONS.md` in a later docs PR. They do not change law from this file.

Source labels in brackets point into `02-CROSSREF.md` and `inventory/CROSSREF-SEMANTIC.md`:

- `B1`–`B11` are the live bugs in section 1 of `02-CROSSREF.md`.
- `X-…` are contradiction rows.
- `OQ n` is open question n in the numbered list of 79 open questions (cluster order).

---

## Round 0: how the spec pass fits the new plan standards (2026-11-06)

These come first, because each answer changes where and how every later verdict is written.

**0.1 Fill order.** The new plan standard says each level is written only when its work starts.
The brief for this pass says every piece of Creatrix functionality is fully defined before
anything more is built. Choices:

- Define everything now, at PRD height only: one PRD per surface, with no TRDs or tickets until
  a PRD is picked for building. (Recommended: it keeps the brief's goal and the standard's ban on
  early implementation detail.)
- Define everything now, down to TRDs.
- Follow the standard strictly: write the initiative, name the milestones, and write only the
  first milestone's PRDs.

Blocks: the shape of phases 3 and 4.

**0.2 Where the output lives.** The standard puts plan documents in
`docs/plans/<initiative>/initiative.md`, then milestone folders, then PRDs and TRDs. This pass
writes to `docs/spec/`. Choices:

- `docs/spec/` keeps the research (inventory, patterns, cross-reference). The specs themselves
  are written as PRDs under `docs/plans/creatrix-ui-definition/`. (Recommended.)
- Everything moves under `docs/plans/`.
- Everything stays in `docs/spec/`, outside the standard.

Blocks: where phases 3 and 4 write, and whether `/plan-check` runs its writing checks on them.
`/plan-check` runs those checks only on files under `docs/plans/`.

**0.3 How the four lenses map to PRDs.** `AREAS.md` (locked) defines 17 objects, 10 surfaces,
8 journeys and 9 systems. The PRD standard says to split PRDs on the surface a user reaches
first. Choices:

- One PRD per surface (10 PRDs). Objects become sections of the surface PRD that owns them.
  Journeys become flowcharts inside the PRDs they cross. Systems become one PRD for cross-cutting
  rules (keys, selection, undo, drag, menus). (Recommended.)
- Keep the four lenses as separate spec files and treat the PRD standard as not applying.
- Another split the owner names.

Blocks: the progress metric ("X of 17 object specs …") and the phase 3 file list.

**0.4 Status tracking.** The standard says status lives on the Ops Board, never in a plan
document. `STATE.md` holds phase status and the resume notes. Choices:

- Phase status moves to Ops Board cards. `STATE.md` keeps only the resume pointer for the next
  session. (Recommended.)
- `STATE.md` stays as it is, because `docs/spec/` is research.

**0.5 Rewriting the research documents.** The writing standard is broken in the existing
spec-pass documents. A heuristic count found about 150 bare labels in `02-CROSSREF.md`, 65 in
`AREAS.md`, and 5 to 41 in each pattern file. Choices:

- Rewrite only what moves into a PRD; the research documents stay as they are.
  (Recommended.)
- Rewrite every spec-pass document now.

**0.6 Label convention** (pending owner call 4; OQ 21; section 5 of `02-CROSSREF.md`). 108
decision and packet labels are defined in more than one document. For example, a proposal's own
"D5" reads as law D5. Choices:

- Bare `D#` and `R#` mean `docs/frontend` law only. Every other label carries its change name,
  such as `layertap-matte-v1/OD-2`. Every label is also written with its title, as the writing
  standard requires. (Recommended.)
- Titles only, with no codes in new documents.

---

## Round 1: live bugs (pending owner call 1)

The question for each bug is "fix now under the freeze's bug-fix exception, or specify the fix
in the PRD that owns it". Claude reproduces each bug before any fix (gate 6). The recommendation
is listed after each bug.

1.1 Save and Quit: the user cancels the save dialog and the app still quits, losing the work
[B2, OQ 33]. Recommended: fix now.

1.2 Text always draws above every video layer, whatever the row order in the timeline
[B3, X-timeline-3, OQ 61]. Also needed: does layer order cover text, performance and frozen
layers? Recommended: fix now, and the order covers all of them.

1.3 Right-clicking a knob in the track chain resets the value and opens the Automate menu at the
same time [B7, OQ 16]. Recommended: fix now, after the runtime check. The rule for right-click
is decided in 4.4.

1.4 Per-track effect automation does not reach the render (static evidence only) [B1]. The
identity-key decision in 4.2 decides the fix. Recommended: specify it first, then fix.

1.5 Edits that undo does not track never mark the project as unsaved, so autosave skips them
[B4, OQ 32]. This is decided in 5.1.

1.6 Selecting the Master, audio or text track redirects export and freeze to that track [B5,
OQ 29]. This is decided in 5.4.

1.7 Freeze changes nothing at render [B6, OQ 27]. This is decided in 5.3.

1.8 Pressing P may not leave perform mode [B8, OQ 55, OQ 76]. This is decided in 3.6.

1.9 Pressing Delete removes the clip while a mask selection shows, and a held tool key keeps
cycling [B9, OQ 73]. Recommended: fix now. Delete follows the same order as Backspace.

1.10 There are two loop mechanisms, and the loop brace cannot be dragged
[B10, X-timeline-5, OQ 62, OQ 63]. This is decided in 2.5.

1.11 The PERFORM badge text is 11px, below the 12px floor [B11, X-remainder2-7, OQ 47].
Recommended: fix now. Claude checks whether the ratchet covers inline styles.

---

## Round 2: law against what shipped

2.1 Layer panel side (pending owner call 2) [X-shell-5, OQ 49]. Law D3 says "right-dock layer
panel". The app shows the layer panel in the left column, above the effects list. Choices:

- Amend D3 to say left. (Recommended: the shipped layout passed review.)
- Move the panel to the right.

2.2 Cmd+B and the rail [X-devices-1, OQ 13, OQ 20, OQ 78]. Law D10 says one permanent rail.
The browser-folders plan has Cmd+B hide the panel that holds the rail. Choices:

- Cmd+B collapses the panel and the icon rail stays. (Recommended.)
- Cmd+B hides the rail too, and D10 is amended.

Asked with it:

- Where the 14 tools live: in the rail, or in the separate tool rail.
- Whether the press-and-hold tool flyouts stay.
- Whether Esc or a second click on the icon may close a drawer.

2.3 CPU and memory meters [X-shell-1, OQ 50]. Law D13 reserves the far right of the transport
bar. The system-monitor plan puts them in the status bar. Choices:

- Transport far right only.
- Status bar only, with D13 amended.
- Both, where the status bar chip opens the monitor.

2.4 Drawing automation [OQ 2; D13 premise]. D13 says painting in a lane still works. Nothing in
the app turns on Draw mode, and no lane pencil exists. Choices:

- Build a lane pencil.
- Retire Draw mode and amend D13.

2.5 Loop [B10, X-timeline-5, OQ 62, OQ 63]. Choices for the transport loop button:

- One mechanism: the loop button plays the loop region when a region is set, and the whole
  timeline otherwise. (Recommended.)
- Keep two mechanisms.

Asked with it: does the loop brace drag on its own, as D12 says, and do markers drag?

2.6 Deleting an automation take [OQ 9]. D13.1 has takes, and no screen removes one. Choices:

- A delete action on the take.
- Clear-lane is the only removal, and D13.1 is amended.

2.7 What happens on an automation lane [X-timeline-1, X-timeline-2, OQ 60]. D12 says a plain
drag on any lane bed makes a time selection. A visible automation lane draws its own point
marquee over that bed, and audio lanes have no marquee at all. Which gesture wins on an
automation lane?

2.8 The REAL-INVENTORY-ONLY rule has no row in the law table, and REAL-DIMENSIONS-ONLY promises
a grep script that does not exist [OQ 58]. Recommended: add the row, write the script in
phase 3, and record whether the 1280×800 re-check ran.

2.9 Rows that need ratifying [OQ 23]. Four decisions have no law row:

- tune-up cursor tools
- clip and track lock
- the field-mapping apply-preset menu
- the inspector rename to "Scope" (OQ 68 asks whether that track is a layer at all)

Which of these become law rows?

2.10 Legacy shell [OQ 54; X-shell-6]. The old layout behind `F_CREATRIX_LAYOUT=false` still
has track-header controls that break D3. Recommended: retire it.

---

## Round 3: keys and gestures that mean two things

3.1 Cmd+Shift+I: Routing Canvas (shipped) or mask Invert (planned) [X-tools-keys-2; OQ 69].

3.2 Cmd+Shift+M and Cmd+Shift+T: New MIDI Track, new performance track, or promote selection to
mask [X-tools-keys-3, X-tools-keys-4, OQ 55, OQ 70]. Decisions 19 and 32 exist only outside the
repo. Does the owner restate them?

3.3 Cmd+T: add text track (shipped), new video track, or Free Transform [X-timeline-8].

3.4 The command palette key, and Cmd+Shift+P: pop-out window or command palette
[X-shell-9, OQ 53, OQ 77].

3.5 Cmd+K splits a clip in the app, while older documents say Cmd+Shift+K [X-tools-keys-12].
Recommended: the app wins, and the documents are corrected.

3.6 P and M: bare keys (shipped) or Cmd+P and Cmd+M (older documents). Also: P must leave
perform mode [B8, X-shell-7, OQ 55].

3.7 Pad keys overlap tool, focus and automation keys [OQ 56]. Choices:

- Perform mode shadows them on purpose.
- Pads move to keys that collide with nothing.

3.8 Automation copy and paste: Cmd+C and Cmd+V (documents) or Cmd+Shift+C and Cmd+Shift+V
(app) [X-tools-keys-13].

3.9 Cmd+Y: opens the history panel, or the menu only [X-lifecycle-1].

3.10 Alt during a drag: bypass snapping (D12), or subtract from a mask and grow from the center
[X-tools-keys-16].

3.11 Space, Delete and Esc in the middle of a mask gesture [X-tools-keys-6, X-tools-keys-7].

3.12 Tool keys: does a held key repeat, and does Shift plus the key cycle backwards [OQ 73]?

3.13 X: keep a direct ripple-delete key, or only the trim cycle? Also: delete the dead S and D
rows [OQ 74]?

3.14 Number keys 5 to 9 and Cmd+1 to Cmd+9 have no plan. Choices [OQ 79]:

- pad rows
- zoom presets
- workspace switch
- leave them unbound

3.15 Menu items that show a shortcut the app does not bind [section 3a of `02-CROSSREF.md`]:

- freeze
- flatten
- save effect preset
- save chain preset
- group with previous

Recommended: remove the shortcut labels until each key is decided.

---

## Round 4: one model where plans disagree

4.1 Precedence of signals on one parameter [OQ 1; section 3c of `02-CROSSREF.md`]. A parameter
has automation, an LFO and a hardware knob at once. Today automation replaces the other two.
Two documents say they add together. Choices:

- Automation replaces the others.
- They add together.
- A per-parameter mode.

4.2 One identity key for an effect parameter [B1, OQ 3, OQ 4, OQ 12, OQ 38; section 3h of
`02-CROSSREF.md`]. Choices:

- The instance id end to end, with the type id as a fallback (decision UD-1 extended to
  automation, operators and export).
- A structured parameter address.

Asked with it: the grammar for effect ids that contain a dot.

4.3 Composite preview skips operators and automation, while export applies them [OQ 10].
Choices:

- Preview matches export, and the gap gets a packet.
- The gap is a waived exception.

4.4 Right-click on a parameter [B7, OQ 7, OQ 16; section 3b of `02-CROSSREF.md`]. Today it
does four different things by context. Choices:

- Always opens one menu: Reset, Automate, MIDI Learn, Map to Macro. (Recommended.)
- Another rule.

4.5 Macro model [OQ 17; section 3f of `02-CROSSREF.md`]. Which model survives:

- the preset MacroMapping
- RackMacro
- the T3.9 Macro

Asked with it: where preset macros appear when the user applies a preset.

4.6 Presets [OQ 14, OQ 15]. Asked together:

- Where can the user drop a dragged preset: the device chain, the track header, or both?
- Does a "Save as Preset" item go to Presets, the user library, or both?
- Which folder is used: `Documents/Creatrix/Presets` or `~/.creatrix/user-library/`?

4.7 Panel registry owner [OQ 18, OQ 51; section 3d of `02-CROSSREF.md`]. Three changes each
wait for another to build the panel registry. Which change builds it?

- device-monitors-v1
- system-monitor-v1
- multiwindow stage A

Asked with it:

- The mount mechanism for the docked System Monitor.
- Who owns migrating saved layout state.

4.8 Detached monitor window preload [OQ 52]. Choices:

- The full preload.
- The minimal preload, with one writer.

4.9 Taps [OQ 18; section 3g of `02-CROSSREF.md`]. Choices:

- One tap primitive.
- Two tap mechanisms, documented as two.

4.10 Device names [OQ 19]. Choose one name in each pair:

- Wavetable or Frame-Bank
- Sample Rack or Drum Rack
- "Rack" for effect groups: yes or no
- "generator": the registry category or the operators

4.11 MIDI banks [OQ 8]. How does a user without a MIDImix make bank bindings? Do slot-learned
targets drive the live render, or only recording?

4.12 Mask selection [OQ 71, OQ 72]:

- Does a plain drag replace the selection (documents) or add to it (app)?
- Is mask edit mode (paint, rubylith, view modes) still in scope?

4.13 Text tracks [OQ 65]. Text tracks shipped without a plan. Choices:

- Ratify the shipped behaviour.
- Send text tracks through a PRD.

Asked with it: do text tracks have blend and opacity?

4.14 Transitions [OQ 43]. If the app gets transitions, does a clip edge or the layer own them?

4.15 Slide and ripple trim [OQ 64]:

- When a slide is blocked, does it fail silently, show a toast, or slide against the previous
  neighbour only?
- Does ripple trim on the out point get a UI, or is it deleted?

4.16 Master track duplicate guard [OQ 66]. Recommended: add the guard. No question unless the
owner objects.

---

## Round 5: project, freeze, undo and export

5.1 What marks a project as unsaved [B4, OQ 32]:

- Do edits that undo does not track count?
- Does undoing back to the saved state clear the mark?

5.2 Confirm before a destructive action [B2, OQ 33]. Which actions ask first?

- flatten
- replacing a chain with a preset
- opening a demo
- deleting a track
- New, Open or Close during an export

5.3 What freeze is [B6, OQ 26, OQ 27, OQ 28; section 3e of `02-CROSSREF.md`]. Choices:

- A render accelerator, which needs the frozen frames read back and invalidated on edit.
- Only a step before flatten.

Asked with it:

- Does undo replay freeze (option A), or is the frozen prefix a cache rebuilt on change
  (option B)?
- Is frozen state saved with the project?
- Is it cleared on New and Open?

5.4 Export target [B5, OQ 29]:

- Do export and freeze refuse the Master, audio and text tracks?
- Does export use a frozen prefix?

5.5 Render queue [OQ 30]. Choices:

- Wire it to the Export dialog's "Add to queue".
- Retire the unused code.

5.6 Multi-track export [OQ 31]. Choices:

- A planned feature.
- A permanent non-goal.

5.7 Drafts and demos [OQ 34]:

- Is a draft separate from autosave?
- Which file format do demos use: `.entropic` or `.glitch`?
- Which folder: `~/.entropic` or `~/.creatrix`?

5.8 Gesture undo [OQ 35]. Choices:

- One undo entry per pointer move.
- A begin, commit or abort transaction per gesture.

Asked with it: what does Cmd+Z do while a gesture is open?

5.9 History branches [OQ 36]. Choices:

- A real branching history.
- A linear history.

5.10 Crash restore [OQ 37]. After a crash restore, is the project marked unsaved? The undo stack
cannot be restored.

5.11 Undo granularity for a recording pass [OQ 5, OQ 6, OQ 11]. Asked inside the automation PRD
interview:

- Touch semantics for on/off parameters.
- Recording while stopped.
- Which lane copy and paste act on.

5.12 Tempo [OQ 41]. Is tempo still off by default? Every project has 120 BPM today.

5.13 Preferences "Max chain length" [OQ 48]. The field shows 20 and does nothing, while the app
enforces 10. Choices:

- Remove the field.
- Wire the field.
- Ratify 10.

5.14 Multicam [OQ 57]. Which plan hosts the fullscreen performer view? The plan exists only in
memory.

5.15 Frame cap and transport [OQ 39, OQ 40, OQ 45]:

- Is 300,000 frames the intended cap?
- Is the shared-memory frame path retired, so that its contract documents can be cut?

---

## Round 6: document repairs (one approval each)

6.1 Second "headers only" supersede sweep (pending owner call 3). It covers:

- the 58 chains without a header
- the documents that still specify 11px text, with their oracles re-pointed to 12px
- the old mask tool letters
- the B3 PRD
- the help text for Cmd+L
- the contract documents in section 3i of `02-CROSSREF.md`

Same terms as the first sweep.

6.2 Status drift [section 4 of `02-CROSSREF.md`, OQ 22]:

- Which single document is the live status ledger, or does the Ops Board replace it (see 0.4)?
- Correct the repo `CLAUDE.md` store count and the `CONTRIBUTING.md` law pointer.

6.3 A CI check against stale ledgers. Recommended: generate the status column from git
history.

6.4 The constitution [OQ 44]. Amend it to 23 stores and the current preload surface? May the
renderer write and delete files?

6.5 The BDD test plan [X-remainder2-1, OQ 46]. Choices:

- Re-baseline it.
- Mark it superseded.

6.6 Old mockups [OQ 59]. Choices:

- Mark them as made before D5 and D6.
- Re-author them.

6.7 W1.5b closed? [OQ 24]. q7 report still valid? [OQ 25]. Matte cache stage [OQ 42].

---

## Claude-owned checks (no owner question; done before the matching question is asked)

- The runtime check that right-clicking a knob fires twice (before 1.3).
- Reproducing the B1 automation render gap with a pixel diff (before 4.2).
- The runtime check of P in perform mode (before 3.6; OQ 76).
- Whether the Edit menu's OS roles take Cmd+Z, Cmd+C and Cmd+V before the app does (before 3.8;
  OQ 75).
- Whether the type-floor ratchet covers inline styles (before 1.11; OQ 47).
- Reading the openspec 01–03 `design.md` and `tasks.md` files that were skipped (OQ 67).
- Whether lane edges validate in `routing_graph_get` (OQ 12, before 4.2).

## Verdicts

| Question | Verdict | Date |
|---|---|---|
