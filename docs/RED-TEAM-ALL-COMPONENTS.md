# Entropic v2 — Red Team: All Components

> **Scope:** Every component in the BDD acceptance criteria, attacked from these angles:
> 1. **Input abuse** — malformed, extreme, unicode, injection
> 2. **Timing** — race conditions, rapid interaction, interrupt mid-operation
> 3. **State corruption** — stale refs, orphaned data, impossible states
> 4. **Resource exhaustion** — memory, CPU, disk, unbounded growth
> 5. **Security** — XSS, path traversal, command injection, data exfiltration
> 6. **Missing error handling** — what happens when things go wrong
>
> Severity: 🔴 Critical (data loss/security) | 🟡 High (crash/hang) | 🟠 Medium (incorrect behavior) | 🔵 Low (cosmetic/UX)

---

## Z1: Title Bar

### Z1-01: Window Title
| Attack | Expected | Severity |
|--------|----------|----------|
| Save project as `../../../etc/important.glitch` | Path rejected or sanitized, no directory traversal | 🔴 |
| Save project with name `<img onerror=alert(1)>.glitch` | Rendered as text in title bar, no HTML execution | 🟠 |
| Save with emoji filename `🎬 my project.glitch` | Should work or show sanitized name | 🔵 |
| Filename > 255 chars | Truncated in title bar, file save fails gracefully | 🔵 |
| Dirty state: make 1000 rapid changes | Asterisk appears once, doesn't flicker or lag | 🔵 |

### Z1-02: Traffic Lights
| Attack | Expected | Severity |
|--------|----------|----------|
| Click close during active export | Prompt to cancel export first, or export completes | 🟡 |
| Click close during save operation | Wait for save to finish, then close | 🟡 |
| Close with 10 unsaved effects + large timeline | Save dialog handles large project, no timeout | 🟠 |
| Minimize during playback | Playback continues (audio), resumes visual on restore | 🟠 |
| Full screen on external monitor then disconnect monitor | Window recovers to primary display | 🟠 |

---

## Z2: Transport Bar

### Z2-01: Play Button
| Attack | Expected | Severity |
|--------|----------|----------|
| Click Play 50 times rapidly | Single play/pause cycle per click, no desync | 🟡 |
| Play with 10 effects each taking 200ms | Playback drops frames or shows warning, no hang | 🟡 |
| Play immediately after import (before ingest complete) | Either waits or shows "importing..." message | 🟠 |
| Play after deleting all tracks | Nothing happens, no crash | 🟠 |
| Play with Python sidecar crashed | Shows "Engine: Disconnected", no crash | 🟡 |

### Z2-02: Stop Button
| Attack | Expected | Severity |
|--------|----------|----------|
| Rapid stop→play→stop→play (20x) | Clean state transitions, no orphaned playback | 🟡 |
| Stop during frame render | Current render cancels or completes, no partial frame | 🟠 |

### Z2-03: Timecode
| Attack | Expected | Severity |
|--------|----------|----------|
| Click timecode display (should it be editable?) | Either opens input for time navigation or does nothing | 🔵 |
| Video with duration > 1 hour | Timecode format handles "1:00:00.0" correctly | 🔵 |

### Z2-04: BPM Field
| Attack | Expected | Severity |
|--------|----------|----------|
| Type `0` | Clamp to minimum (e.g. 20), no divide-by-zero in grid calc | 🟡 |
| Type `-1` | Reject, revert | 🟠 |
| Type `99999` | Clamp to maximum | 🟠 |
| Type `120.5` (float) | Accept or round to int | 🔵 |
| Type `alert(1)` | Renders as text, no execution | 🟠 |
| Paste 10KB of text | Truncated or rejected, no UI hang | 🟠 |
| Edit BPM during playback | Grid updates live without audio glitch | 🟠 |

### Z2-05: Quantize Button
| Attack | Expected | Severity |
|--------|----------|----------|
| Toggle rapidly 50 times | Clean toggle, no stuck state | 🔵 |
| Toggle during clip drag (mid-operation) | Snapping changes take effect after drag completes | 🟠 |

### Z2-06: Quantize Dropdown
| Attack | Expected | Severity |
|--------|----------|----------|
| Open dropdown, switch tabs, return | Dropdown closed cleanly, no orphaned menu | 🔵 |

### Z2-07: JKL Transport (BUG-12)
| Attack | Expected | Severity |
|--------|----------|----------|
| Press J/K/L with no handler | Nothing happens, no error in console | 🟠 |
| Press L 10 times rapidly (when implemented) | Speed caps at max (e.g. 8x), no overflow | 🟠 |

### Z2-08: Volume Control
| Attack | Expected | Severity |
|--------|----------|----------|
| Set volume to 0 then play | Silent playback, no error | 🔵 |
| Drag slider beyond min/max | Clamp to 0-100% range | 🔵 |
| Rapid mute/unmute during playback | No audio glitch or pop | 🟠 |

### Z2-09: Waveform
| Attack | Expected | Severity |
|--------|----------|----------|
| Load video with corrupt audio stream | Waveform shows empty or error, no crash | 🟠 |
| Load very long audio (1 hour) | Waveform renders progressively or shows overview | 🟠 |

---

## Z3: Left Sidebar

### Z3-01: Asset Info
| Attack | Expected | Severity |
|--------|----------|----------|
| Import video with metadata containing HTML/JS | Rendered as plain text | 🟠 |
| Import video with no metadata (raw stream) | Shows "Unknown" or fallback values | 🔵 |

### Z3-02: Transform Panel
| Attack | Expected | Severity |
|--------|----------|----------|
| Type `NaN` in X field | Reject, revert to 0 | 🟠 |
| Type `Infinity` in Scale | Reject, revert to 1 | 🟠 |
| Type `0` in Scale | Reject (zero-size clip) or clamp to 0.01 | 🟡 |
| Type `-1` in Scale | Either mirror (negative scale) or reject | 🟠 |
| Type `1e308` in X | Clamp to canvas bounds | 🟠 |
| Edit transform during playback | Live update without frame drops | 🟠 |
| Edit X, Y, Scale, Rot all at once rapidly | Each change is a separate undo entry, or batched intelligently | 🔵 |

### Z3-03/04: Effects/Presets Tabs
| Attack | Expected | Severity |
|--------|----------|----------|
| Switch tabs 100 times rapidly | Clean transitions, no memory leak | 🔵 |
| Switch tab during effect search | Search state preserved or reset cleanly | 🔵 |

### Z3-05: Preset Save
| Attack | Expected | Severity |
|--------|----------|----------|
| Save preset with empty name | Rejected or auto-named | 🔵 |
| Save preset with path traversal name `../../evil` | Sanitized | 🟠 |
| Save 1000 presets | Performance doesn't degrade | 🔵 |
| Save preset with 10 effects, load into project with 8 effects | Chain count check: reject if would exceed max, or load partial | 🟠 |

### Z3-06: Macro Knob
| Attack | Expected | Severity |
|--------|----------|----------|
| Map macro to deleted effect param | Graceful failure, no crash | 🟡 |
| Map macro to 50 params simultaneously | Performance cap or limit | 🟠 |

### Z3-07: Effect Search
| Attack | Expected | Severity |
|--------|----------|----------|
| Type `<script>alert(1)</script>` | Plain text, no XSS | 🔴 |
| Paste 100,000 character string | Input truncated or rejected, no hang | 🟡 |
| Type regex `.*` | Doesn't crash search engine | 🟠 |
| Type null byte `\0` | Ignored or stripped | 🟠 |
| Search while effects are loading (startup) | Shows "loading" or empty, no crash | 🔵 |

### Z3-08: Category Tags
| Attack | Expected | Severity |
|--------|----------|----------|
| Click all 22 tags simultaneously (programmatically) | Union of all = same as ALL | 🔵 |
| Click tag while effect list is scrolling | Scroll resets to top of filtered list | 🔵 |

### Z3-09: Effect List
| Attack | Expected | Severity |
|--------|----------|----------|
| Click same effect 100 times rapidly | Only adds up to max chain (10), no duplicates beyond that | 🟡 |
| Click effect while Python sidecar is disconnected | Effect added to chain store but preview shows error/stale frame | 🟠 |
| Click effect during active render | Queues addition, renders after current frame | 🟠 |

### Z3-10: + Add Text Track
| Attack | Expected | Severity |
|--------|----------|----------|
| Click 100 times | Creates Text 1 through Text 100, or caps at a limit | 🟠 |
| Add text track then immediately delete | Clean undo/redo cycle | 🔵 |

### Z3-13: Help Panel
| Attack | Expected | Severity |
|--------|----------|----------|
| Effect description contains HTML | Rendered as plain text | 🟠 |

---

## Z4: Preview Canvas

### Z4-01: Video Frame
| Attack | Expected | Severity |
|--------|----------|----------|
| Load corrupt MP4 (truncated, wrong codec) | Error message in preview, no crash | 🟡 |
| Load 8K video (7680x4320) | Downscale to preview size, or show memory warning | 🟡 |
| Load 0-byte video file | Error message, no crash | 🟡 |
| Load video with 0 frames | Handled gracefully | 🟠 |
| Load video from network path (slow/unreliable) | Timeout with error message | 🟠 |
| Preview while all effects return errors | Shows error frame or original, no infinite retry | 🟡 |
| Resize window to 1x1 pixel | Preview handles gracefully, no divide-by-zero | 🟠 |

### Z4-02: FPS Overlay
| Attack | Expected | Severity |
|--------|----------|----------|
| FPS reaches 0 (complete stall) | Shows "0 fps" or "stalled", no division by zero | 🟠 |

### Z4-03: Pop-Out Preview
| Attack | Expected | Severity |
|--------|----------|----------|
| Pop out, close main window | Pop-out closes too, or shows warning | 🟡 |
| Pop out to external monitor, disconnect monitor | Window recovers | 🟠 |
| Pop out during playback | Playback continues in pop-out seamlessly | 🟠 |
| Open pop-out twice | Second click brings existing pop-out to front, no duplicate | 🟠 |

### Z4-05: Before/After
| Attack | Expected | Severity |
|--------|----------|----------|
| Hold \ during effect parameter change | Shows original without new param, not stale state | 🟠 |
| Hold \ with 0 effects | No change (already showing original) | 🔵 |
| Hold \ during playback | Each frame shows original, release shows processed | 🟠 |

---

## Z5: Timeline

### Z5-01: Ruler
| Attack | Expected | Severity |
|--------|----------|----------|
| Click ruler at negative time (before 0) | Clamp to 0 | 🟠 |
| Click ruler past end of content | Playhead moves to clicked position, preview shows black/last frame | 🔵 |

### Z5-02: Playhead
| Attack | Expected | Severity |
|--------|----------|----------|
| Drag playhead during export | Export unaffected, playhead free to move | 🟠 |
| Drag playhead past timeline bounds | Clamp to 0..duration | 🟠 |

### Z5-03: Track (M/S/R)
| Attack | Expected | Severity |
|--------|----------|----------|
| Mute all tracks then play | Silent/black preview, no crash | 🟠 |
| Solo a track with no content | Empty preview, no crash | 🔵 |
| Mute during export | Export uses mute state at start of export | 🟠 |
| Delete the only track | Timeline returns to empty state with hint text | 🟠 |
| 50 tracks | Performance degrades gracefully, no crash | 🟡 |

### Z5-04: Clip
| Attack | Expected | Severity |
|--------|----------|----------|
| Drag clip to overlap another clip on same track | Defined behavior: shift, overwrite, or prevent | 🟠 |
| Drag clip to negative position (before 0s) | Clamp to 0 | 🟠 |
| Select clip, switch to different track, press delete | Correct clip deleted (not wrong track) | 🟡 |
| Select all (Cmd+A) then drag | All clips move together | 🟠 |
| Double-click clip | Should open some editor or select + seek to clip start | 🔵 |

### Z5-05: Clip Trimming
| Attack | Expected | Severity |
|--------|----------|----------|
| Trim clip to 1 frame | Allowed (minimum viable clip) | 🟠 |
| Trim clip to 0 frames | Prevented or clip auto-deletes | 🟡 |
| Trim during playback | Playback adjusts to new bounds | 🟠 |
| Trim right edge past original duration | Prevented (can't extend beyond source) | 🟠 |

### Z5-06: Split
| Attack | Expected | Severity |
|--------|----------|----------|
| Split at frame 0 (very start of clip) | Either no-op or creates 0-frame fragment (should be no-op) | 🟠 |
| Split at last frame | Either no-op or creates 0-frame fragment | 🟠 |
| Split, undo, split at different position, redo | Redo applies original split, not new position | 🟠 |
| Split 100 times rapidly (Cmd+K spam) | Each split creates a valid fragment, no crash | 🟡 |

### Z5-07: Clip Context Menu
| Attack | Expected | Severity |
|--------|----------|----------|
| Right-click during playback | Menu appears, playback pauses or continues | 🔵 |
| Right-click on overlap of two clips | Menu for top clip, or submenu to choose | 🟠 |
| Speed/Duration with speed = 0 | Rejected (infinite duration) | 🟡 |
| Speed/Duration with speed = 10000% | Capped or creates 1-frame clip | 🟠 |
| Reverse a 1-frame clip | No visible effect, no crash | 🔵 |
| Disable clip during export | Export skips disabled clip | 🟠 |

### Z5-08: Track Context Menu
| Attack | Expected | Severity |
|--------|----------|----------|
| Delete track during playback | Playback stops or continues on remaining tracks | 🟡 |
| Duplicate track 50 times | 50 tracks created, memory grows linearly not exponentially | 🟡 |
| Rename to empty string | Rejected, reverts to "Track N" | 🔵 |
| Rename to very long string (1000 chars) | Truncated in header | 🔵 |
| Rename with HTML `<b>bold</b>` | Plain text, no HTML rendering | 🟠 |
| Move Up on top track | Button grayed, no error | 🔵 |

### Z5-09: Markers
| Attack | Expected | Severity |
|--------|----------|----------|
| Add 1000 markers | Performance degrades gracefully | 🟠 |
| Add marker at same position as existing marker | Either merges or adds second (defined behavior) | 🔵 |
| Add marker at negative time | Clamped to 0 | 🔵 |

### Z5-10: Loop Region
| Attack | Expected | Severity |
|--------|----------|----------|
| Set loop in AFTER loop out (I at 4s, O at 2s) | Either swap in/out or clear the region | 🟠 |
| Set loop in = loop out (same position) | Disable loop or prevent (zero-length loop) | 🟡 |
| Loop region longer than clip | Loop plays clip then silence/black for remainder | 🟠 |

### Z5-11: Zoom
| Attack | Expected | Severity |
|--------|----------|----------|
| Zoom in 1000x past individual frames | Caps at maximum zoom | 🔵 |
| Zoom out past project bounds | Caps at minimum zoom (project fits) | 🔵 |
| Zoom during playback | Playhead remains visible, auto-scroll follows | 🟠 |
| Zoom to 1px per frame on 1-hour video | Memory for ruler/markers stays bounded | 🟡 |

---

## Z6: Device Chain

### Z6-01/02: Device Chain + Card
| Attack | Expected | Severity |
|--------|----------|----------|
| Scroll device chain horizontally with 10 cards | Smooth scroll, no clipping | 🔵 |
| Effect card text overflow (long effect name) | Truncated with ellipsis | 🔵 |

### Z6-03: Bypass
| Attack | Expected | Severity |
|--------|----------|----------|
| Bypass all 10 effects | Preview shows original, render time near 0 | 🔵 |
| Bypass during playback | Seamless transition, no frame drop | 🟠 |
| Bypass, change param, un-bypass | Changed param preserved | 🟠 |

### Z6-04: AB Switch
| Attack | Expected | Severity |
|--------|----------|----------|
| Toggle AB rapidly 50 times | Clean transitions, no state corruption | 🟡 |
| Toggle AB during render | Queues switch for next frame | 🟠 |
| Toggle AB then undo the param change that preceded it | A/B snapshots handle undo correctly | 🟡 |
| Delete effect while AB is active on B snapshot | Clean deletion, no orphaned B state | 🟡 |

### Z6-05: Remove (x)
| Attack | Expected | Severity |
|--------|----------|----------|
| Remove effect during playback | Preview updates immediately, no frame leak | 🟠 |
| Remove all 10 effects rapidly | Clean removal, count reaches 0/10, no crash | 🟡 |
| Remove effect then undo 50 times | Each undo/redo restores/removes cleanly | 🟡 |

### Z6-06: Rotary Knob
| Attack | Expected | Severity |
|--------|----------|----------|
| Drag at extreme speed (1000px/s) | Value changes rapidly but clamps at min/max | 🟠 |
| Drag while effect is being removed | No crash, drag cancels | 🟡 |
| Right-click reset during active drag | Reset takes priority, drag cancelled | 🟠 |
| Focus knob (tab), type number keys | Either enters value or ignored (depends on focus mode) | 🔵 |
| Two users controlling same knob (hypothetical multi-touch) | Last write wins, no corruption | 🟠 |

### Z6-07: Number Input
| Attack | Expected | Severity |
|--------|----------|----------|
| Type `1e999` | Clamped to param max or rejected | 🟠 |
| Type `-0` | Treated as 0 | 🔵 |
| Type `1/0` | Rejected (not a valid number) | 🟠 |
| Paste multi-line text | Only first line used, or rejected | 🔵 |

### Z6-08/09: ParamSlider + ParamToggle
| Attack | Expected | Severity |
|--------|----------|----------|
| Drag slider to exactly 0 or exactly 1 | Boundary values work correctly, no off-by-one | 🟠 |
| Toggle param that controls render-critical state (e.g. accumulate on datamosh) | Toggle mid-render is safe | 🟠 |

### Z6-10: ParamChoice (Dropdown)
| Attack | Expected | Severity |
|--------|----------|----------|
| Select option then immediately undo | Dropdown reverts to previous selection | 🟠 |
| Open dropdown then press Escape | Dropdown closes, no change | 🔵 |
| Select option on deleted effect | No crash (component unmounted) | 🟡 |

### Z6-12: Mix Slider
| Attack | Expected | Severity |
|--------|----------|----------|
| Drag to exactly 0% | Pure dry signal (original frame) | 🟠 |
| Drag to exactly 100% | Pure wet signal (full effect) | 🟠 |
| Rapidly drag 0→100→0→100 during playback | Preview updates each frame, no stale blends | 🟠 |

### Z6-13: Freeze
| Attack | Expected | Severity |
|--------|----------|----------|
| Freeze effect, change param, unfreeze | New param takes effect, no stale cached frame | 🟡 |
| Freeze during playback | Current frame cached, subsequent frames use cache | 🟠 |
| Freeze all effects | All render from cache, CPU near 0 | 🟠 |

### Z6-14: Max Chain
| Attack | Expected | Severity |
|--------|----------|----------|
| Set max chain to 0 in Preferences | All effects removed? Or setting rejected? | 🟡 |
| Set max chain to 1000 in Preferences | Should cap at reasonable limit (e.g. 50) | 🟡 |
| Add effects via Adjustments menu while at max | Same enforcement as sidebar | 🟠 |

---

## Z7: Automation

### Z7-01: Toolbar
| Attack | Expected | Severity |
|--------|----------|----------|
| Switch mode during active recording | Recording stops, mode switches cleanly | 🟡 |
| Clear automation then undo | Automation fully restored | 🟡 |
| Simplify with 0 points | No-op | 🔵 |
| Simplify with 1 point | No-op (nothing to simplify) | 🔵 |

### Z7-02: Automation Lane
| Attack | Expected | Severity |
|--------|----------|----------|
| Automation references deleted effect | Lane shows "missing target" or auto-removes | 🟡 |
| 1000 automation points on one lane | Performance degrades gracefully | 🟡 |
| Automation on muted track | Automation still records but doesn't affect output | 🟠 |

### Z7-03: Automation Node
| Attack | Expected | Severity |
|--------|----------|----------|
| Drag node past adjacent nodes (crossing) | Nodes swap order or clamp | 🟠 |
| Drag node to time < 0 | Clamp to 0 | 🟠 |
| Drag node to value outside param range | Clamp to param min/max | 🟠 |
| Delete node during playback | Curve updates, playback continues | 🟠 |

### Z7-04: Automation Draw
| Attack | Expected | Severity |
|--------|----------|----------|
| Draw in non-Draw mode | No effect (only D mode enables drawing) | 🔵 |
| Draw very rapidly (1000 points/second) | Points thinned or capped | 🟡 |

---

## Z8: Status Bar

### Z8-01: Engine Status
| Attack | Expected | Severity |
|--------|----------|----------|
| Kill Python sidecar 10 times in 30 seconds | Watchdog restarts each time, eventually succeeds | 🟡 |
| Kill sidecar during frame render | Partial frame discarded, reconnect, re-render | 🟡 |
| Block ZeroMQ port (firewall) | Timeout, shows disconnected, retries | 🟡 |
| Sidecar returns malformed JSON | Parse error handled, no crash | 🟡 |

---

## Z9: Operators

### All Operator Editors
| Attack | Expected | Severity |
|--------|----------|----------|
| LFO rate = 0 Hz | No modulation (DC), no divide-by-zero | 🟡 |
| LFO rate = 1,000,000 Hz | Capped or shows aliasing warning | 🟠 |
| Envelope attack = 0 | Instant attack, no divide-by-zero | 🟠 |
| Step sequencer with 0 steps | No-op or shows "add steps" | 🟠 |
| Step sequencer with 256 steps | Memory bounded, UI scrollable | 🟠 |
| Fusion with 0 sources | No output, no crash | 🟠 |
| Audio follower with no audio | Outputs 0, no crash | 🟠 |
| Video analyzer with no video | Outputs 0, no crash | 🟠 |
| Modulation matrix: map every param to every operator | Performance cap | 🟡 |
| Circular routing: A modulates B, B modulates A | Detected and prevented, or stable infinite loop with dampening | 🟡 |
| Delete operator that is a modulation source | All routing from it removed cleanly | 🟡 |

---

## Z10: Performance Mode

| Attack | Expected | Severity |
|--------|----------|----------|
| Enter perform mode with no mappings | All pads show empty, no crash | 🔵 |
| Trigger pad mapped to deleted effect | No crash, shows "target missing" | 🟡 |
| MIDI CC value 0 and 127 | Boundary values map correctly | 🟠 |
| MIDI Note On with velocity 0 | Treated as Note Off (per MIDI spec) | 🟠 |
| Connect 5 MIDI devices simultaneously | All recognized, no conflict | 🟠 |
| MIDI learn: move two controllers at once | First detected wins, or shows disambiguation | 🟠 |
| Send 10,000 MIDI messages per second | Rate-limited or handled without crash | 🟡 |

---

## Z11: Text Overlays

| Attack | Expected | Severity |
|--------|----------|----------|
| Text content `<script>alert(1)</script>` | Rendered as literal text on canvas (no HTML execution) | 🔴 |
| Text with 100,000 characters | Truncated or render performance degrades gracefully | 🟡 |
| Font size = 0 | No visible text, no crash | 🔵 |
| Font size = 10000px | Capped or clips to canvas bounds | 🟠 |
| Position text outside canvas bounds | Clipped or wrapped, no crash | 🔵 |
| Unicode text (Arabic RTL, CJK, emoji) | Renders correctly with proper direction | 🟠 |
| Delete text track while text is visible | Preview updates, text disappears | 🟠 |

---

## Dialogs

### Import
| Attack | Expected | Severity |
|--------|----------|----------|
| Import symlink to sensitive file | Rejected (not a video) or resolved safely | 🔴 |
| Import from /dev/urandom | Timeout or error, no infinite read | 🔴 |
| Import file with null bytes in filename | Sanitized or rejected | 🟡 |
| Import while another import is in progress | Queued or second import blocked | 🟠 |
| Import 100 files at once (drag batch) | Either imports all or shows "one at a time" | 🟠 |

### Save / Save As
| Attack | Expected | Severity |
|--------|----------|----------|
| Save to read-only directory | Error message, no crash | 🟠 |
| Save to full disk | Error message, previous save intact | 🟡 |
| Save As to same file as Open (overwrite while reading) | Atomic write (temp file + rename), no corruption | 🔴 |
| Save with 10 effects + 1000 automation points | File size bounded, save completes in <1s | 🟠 |
| Load a manually crafted .glitch with invalid JSON | Parse error, shows "corrupt file" message | 🟡 |
| Load .glitch with effectId referencing non-existent effect | Missing effects handled gracefully (removed or placeholder) | 🟡 |
| Load .glitch from older version | Version migration or "unsupported version" message | 🟠 |

### Export
| Attack | Expected | Severity |
|--------|----------|----------|
| Export to path with no write permission | Error message before rendering starts | 🟠 |
| Export with CRF = 0 (lossless, huge file) | Allowed but shows file size warning | 🟠 |
| Export GIF from 1-hour video | Shows warning about file size, or caps duration | 🟡 |
| Cancel export mid-render | Partial file deleted, state clean | 🟠 |
| Export during playback | Playback pauses or export uses separate render pipeline | 🟠 |
| Export with all effects bypassed | Exports original video (correct behavior) | 🔵 |

### Preferences
| Attack | Expected | Severity |
|--------|----------|----------|
| Set max chain length to 0 | Clamped to minimum (1) | 🟡 |
| Set auto-freeze threshold to negative | Clamped to 0 | 🟠 |
| Set paths to non-existent directory | Shows error or creates directory | 🔵 |
| Rebind shortcut to reserved system key (Cmd+Q) | Rejected or warning shown | 🟠 |
| Rebind two actions to same key | Second rebind overwrites first with warning | 🟠 |

### Crash Recovery
| Attack | Expected | Severity |
|--------|----------|----------|
| Autosave file is corrupt (truncated JSON) | Recovery dialog shows error, offers to discard | 🟡 |
| Autosave file is 500MB (huge project) | Loads slowly but doesn't crash | 🟠 |
| Two app instances open same autosave | File lock or second instance warns | 🟡 |

### Welcome Screen
| Attack | Expected | Severity |
|--------|----------|----------|
| Recent project file was deleted | Shows as grayed out or removed from list | 🔵 |
| Recent project file was moved | Shows path, clicking shows "file not found" error | 🔵 |
| 100 recent projects | List is scrollable or capped at N most recent | 🔵 |

---

## Cross-Component Attacks

| Attack | Expected | Severity |
|--------|----------|----------|
| Add effect → change param → delete effect → undo → redo → undo | Each state transition clean, no orphaned params | 🟡 |
| Import video → add 10 effects → export → undo export → undo all effects → redo all | Full state round-trip works | 🟡 |
| Save project with automation → load in new session → verify automation data | All automation persists correctly | 🟡 |
| Open two Entropic windows → edit same .glitch file | File lock prevents concurrent writes, or last-write-wins with warning | 🔴 |
| Python sidecar OOM (process killed) → watchdog restart → resume editing | App recovers, no data loss | 🟡 |
| macOS sleep → wake → resume editing | Engine reconnects, state intact | 🟠 |
| Rapidly switch between 5 open projects | Each project's state is independent, no cross-contamination | 🔴 |
| BPM change + quantize change + clip move + effect add in one undo group | Single Cmd+Z undoes all or each individually (defined behavior) | 🟠 |

---

## Code-Level Findings (from security + performance agents)

### IPC Security

| Finding | File | Severity | Details |
|---------|------|----------|---------|
| Context isolation correctly configured | main/index.ts:149-154 | PASS | contextIsolation: true, nodeIntegration: false, sandbox: true |
| ZMQ command allowlist enforced | main/zmq-relay.ts:34-54 | PASS | Renderer can't send arbitrary commands to Python |
| Auth token on every ZMQ message | backend/src/zmq_server.py:127-149 | PASS | uuid4 token, 127.0.0.1 only |
| File path validation | main/file-handlers.ts | PASS | isPathAllowed(), symlink rejection |
| TOCTOU on symlink check | main/file-handlers.ts:36 | 🔵 Low | Race between lstatSync and fs operation — requires local code execution |
| Effect params not per-field validated | backend/src/zmq_server.py:193-206 | 🟠 Medium | NaN/Infinity in effect params could crash NumPy. clamp_finite not applied to all param fields |
| No subprocess/eval in production | backend/src/ | PASS | All video probing via PyAV, no shell invocation |

### State Corruption

| Finding | Store | Severity | Details |
|---------|-------|----------|---------|
| Undo stack closures retain cross-store state | undo.ts pushToStack | 🟠 Medium | 500 entries × deep-cloned state = OOM on large projects. Future stack has NO cap. |
| No clip overlap prevention | timeline.ts moveClip/addClip | 🟠 Medium | moveClip sets position without checking for overlapping clips on same track |
| Automation references stale effect IDs | automation.ts | 🟡 High | If effect deleted, automation lanes referencing it become orphaned (no cleanup cascade) |

### Resource Exhaustion

| Finding | File | Severity | Details |
|---------|------|----------|---------|
| useFrameDisplay rAF spin loop | preview/useFrameDisplay.ts:32-41 | 🟠 Medium (latent) | Allocates 8MB/tick at 1080p. Not currently used by PreviewCanvas but dangerous if imported. |
| Base64 frame encoding bandwidth | ZMQ relay | 🟠 Medium | 1080p base64 = ~8MB/frame. At 30fps = 240MB/s over ZMQ. Backpressure exists but high memory pressure. |
| Undo future stack unbounded | undo.ts | 🟡 High | Rapid undo fills future stack with no MAX_REDO_ENTRIES cap |
