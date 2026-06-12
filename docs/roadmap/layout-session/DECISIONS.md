# Creatrix redesign — decisions worksheet

Reply under each `ANSWER:` line. Leave blank to accept the `REC:` (my pick).
Strike with `~~text~~` to reject. Anything else = override.

---

## Layout & shell

### 1. Left column width
REC: 260px keep
ANSWER: it should be draggable and responsive up to 1/3 of the screen width ? 

### 2. Device chain row height
REC: 180px keep
ANSWER: yeah also draggable (we should spec out the drag handle and make sure there's no interaction conflicts)

### 3. Preview height (share of right column)
REC: 38% keep
ANSWER: yeah but also draggable-- and when it pops out into another window we should collapse the preview band to save space

### 4. Sidebar collapse keybinding
REC: preserve Cmd+B toggle
ANSWER: sure 

---

## Browser

### 5. Tab order
REC: fx · op · blend · tool  (most-used first; preset tab if added goes 5th)
ANSWER: actually an expandable user category in each tab not a 5th tab but we should consider how a sample explorer might figure into all this and how a user can have a sample bank or a drum rack with samples loaded already as part of the left side of the screen. Some more discovery necessary here

### 6. Preset/patch location
REC: 5th tab "user" PLUS each category surfaces user-saved at top of its own list
ALT: only 5th tab · only per-category · separate panel below browser
ANSWER: see above

### 7. Search box
REC: global search above the tabs (filters across all 4+1 categories); per-tab filtering still happens via tab click
ANSWER: agreed; make sure there's an x button for the search query 

### 8. Drag vs double-click for adding items
REC: support both — drag is primary, double-click adds to currently-selected track's chain (preserves current muscle memory)
ANSWER: great

### 9. Tools tab contents
REC: Select/Move · Razor · Slip · Slide · Ripple Delete · Marker · Loop In/Out · Range Select
ANSWER: also loop on off and quantize on off and quantize up size down size ; all need hotkeys too; get as close to bale ton as possible and make sure no conflicts

### 10. Operators tab contents
REC: LFO · Env Follower · S&H · Random · Add · Multiply · Clamp · Curve · Audio Amplitude · MIDI CC · Playhead Time
ANSWER: also Sidechain and also gate and also midi envelope stutter and also Kentaro's multi loo emulation

### 11. Blends tab contents
REC: Normal · Add · Multiply · Screen · Overlay · Difference · Alpha Clip · Luma Key · Chroma Key · Mask From Track
ANSWER: what else should there be ? Compete with gimp and photoshop here

---

## Inspector (polymorphic, info-only — no actions)

### 12. Selection states to support
REC: 8 states — nothing / 1 clip / multi-clip / track / effect / operator / marker / hovering
ANSWER: sure 

### 13. Header style
REC: `INSPECTOR · <type>` with detail chip on the right (e.g. `INSPECTOR · CLIP   V1`)
ANSWER: sure

### 14. Hover-help slot
REC: always reserved at the bottom of every state; updates live when you hover any knob/param; otherwise shows `ⓘ hover for details`
ANSWER: make sure this isn't too annoying 

### 15. What's hoverable
REC: every knob, slider, dropdown, browser item, AND clip transforms in the preview
ANSWER: love this 

### 16. Sticky help timing
REC: stays visible ~400 ms after mouseleave so you can read; clears on next hover
ANSWER: sounds good

---

## Track header (post-blend extraction)

### 17. Track header contents
REC: color bar · name · type chip · M/S/● buttons. NO opacity slider, NO blend dropdown.
ANSWER: yes and opacity and blend are in the side bar to drag on as an effect

### 18. Track header right-click menu
REC: keep current items minus blend stuff — Duplicate / Rename / Move Up / Down / Delete + Add Lane / Trigger
ANSWER: what does trigger do? We need show automation lanes and a dropdown for the track header showing all the automations like ableton and flesh that out; we also need freeze . Flatten we can call it print or something on the full track and we can do up to a certain effect on the effect bus

---

## Blend-as-effect refactor

### 19. Migration of existing projects
REC: on project load, if `track.opacity ≠ 1` OR `track.blendMode ≠ 'normal'`, auto-insert a Blend effect at the END of the chain with those values, then clear the track fields. One-time, idempotent.
ANSWER: there are no existing projects or like just start from scratch 

### 20. New-track default chain
REC: empty chain. User adds Blend explicitly when they want non-default compositing.
ALT: auto-insert Blend at position-0 so every track has one.
ANSWER: go with rec

### 21. Track-level opacity slider
REC: REMOVE entirely. Forces the cleaner "blend is an effect" mental model.
ALT: keep as a quick-shortcut, hidden behind hover-reveal.
ANSWER: go with rec

---

## BPM (new project field)

### 22. Storage location
REC: `project.bpm: number` in project store
ANSWER: no it already exists I think

### 23. Default value
REC: 120
ANSWER: sure

### 24. Where BPM is edited
REC: transport bar — click-to-edit number next to the timecode
ANSWER: yeah and automatable same as Ableton 

---

## Project rename

### 25. Entropic → Creatrix in this same PR?
REC: SEPARATE PR. Layout refactor is already big; rename touches every doc + menu + About + package metadata. Bundle = harder review.
ANSWER: yeah we can honestly fork into a new version or something 

---

## Scope & shipping

### 26. PR strategy
REC: 3 sequential PRs behind a single feature flag:
  - PR-A: layout shell + 4-tab browser + polymorphic inspector (info display only)
  - PR-B: Blend-as-effect data model + migration + remove track.opacity/blendMode
  - PR-C: Operator entity surfaced in browser (mod routes already exist via applyCCModulations)
ALT: one giant PR.
ANSWER:

### 27. Feature flag
REC: `F_CREATRIX_LAYOUT` — off → today's layout; on → new shape. Lets you switch back if something breaks.
ANSWER:

### 28. Migration window
REC: 2 minor versions where old projects auto-migrate on load. Then remove the flag.
ANSWER:

---

## Anything I missed?
ANSWER:
