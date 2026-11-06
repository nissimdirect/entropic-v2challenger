# Cross-reference reader brief (shared) — "all the way up, down and across"

Repo worktree: /Users/nissimagent/Development/entropic-spec-pass (branch docs/spec-pass). **READ-ONLY except your one output file.**
Owner instruction (verbatim): "Cross-reference all the plans, build them all the way up and all the way down and all the way across. Make sure that there's no contradictions, surface any issues."

## Rules (verbatim, binding)
1. "Every spec claim about current behavior cites file:line." Any claim about CODE carries a `file:line` you personally verified with grep/Read in this worktree. Any claim about a DOC carries `doc:line` and a verbatim quote (≤200 chars).
2. "No assumptions." If you cannot evidence it, say `unverified` — never infer "built" from a doc that says planned, and never infer "contradiction" from two docs of different dates when the later one explicitly supersedes the earlier (that is a supersede chain → record it, not a contradiction). A doc with a "⚠ SUPERSEDED" header is still a contradiction source ONLY for the parts the header does not cover.
3. `docs/frontend/RATIFIED-FOUNDATIONS.md` is law (D1–D13.1 + REAL-INVENTORY-ONLY + REAL-DIMENSIONS-ONLY); `docs/frontend/RECONCILIATIONS.md` R-rows are pending law. Doc or code contradicting law = severity `blocking`. **ID trap:** many proposals define their OWN local `D1`…`D10`, `OD-1`…, `PK.1`… — never read an unqualified `D5` in a proposal as law D5; check the table it lives in.
4. Don't duplicate known findings. Before emitting a contradiction, check `docs/spec/inventory/SEMANTIC.md` (§Contradictions) and `docs/spec/01-FEATURE-MAP.md` (§S1/§M). If already there, set `"known": "<where>"` and keep it only if you add new evidence.
5. Quote both sides; both sides must be genuinely incompatible *at the same time* (same object, same moment, same surface/context).

## The three directions (what "up/down/across" means here)
- **UP** — every plan item for your objects traces to a law row (D#/R#/REAL-*), an owner verdict (`docs/spec/STATE.md`, `openspec/DECISIONS-PENDING.md`, `docs/decisions/`), or is flagged `no-law` (a load-bearing decision nobody ratified).
- **DOWN** — every plan item traces to code `file:line` (or is honestly `planned`, zero code) and, where code exists, to a test (`frontend/src/__tests__/**`, `backend/tests/**`) or is flagged `no-test`. Every piece of user-facing code for your objects traces UP to a plan (else `orphan-code` = shipped without a plan, like A15 text tracks).
- **ACROSS** — (a) doc ↔ doc on the same object; (b) object ↔ object on a SHARED resource: hotkey, gesture (drag/alt-drag/right-click on the same surface), testid, store field, IPC command, surface slot (e.g. transport far-right), z-order/selection ownership, undo semantics; (c) phase-2 patterns (`docs/spec/patterns/*.md`) "Candidate additions" that would contradict a plan or law.

## Inputs
- `docs/spec/inventory/crossref.json` (generated): `objectDocs[Oxx]` = docs ranked by keyword hits for your objects (generous — prune); `hotkeys[]` = every doc line binding a key with the code-registry meaning; `idCollisions[]`; `lawRestatements[]`; `docs[]` per-doc metadata.
- `docs/spec/inventory/inventory.json` (code facts: components/mountedIn, store actions/refs, hotkeys, menu, drag/drop, context menus, testids).
- `docs/spec/inventory/SEMANTIC.md` + `semantic/*.json` (phase-1 feature rows per area A01–A23; AREAS.md maps A→O).
- `docs/spec/AREAS.md` (object definitions O01–O17), `docs/spec/patterns/*.md`.

## Output (ORACLE) — exactly one file: `docs/spec/inventory/crossref/<CLUSTER>.json`
```json
{"cluster":"<CLUSTER>","objects":["O02"],"docsRead":["path"],
 "trace":[{"object":"O02","item":"short name","law":"D2|R1|REAL-INVENTORY-ONLY|owner-verdict:<cite>|none","plan":"doc:line|null","packet":"doc:line|null","code":"file:line|null","test":"file:line|null","status":"traced|no-law|no-code|no-test|orphan-code|stale-plan","note":"≤200 chars"}],
 "contradictions":[{"id":"X-<CLUSTER>-n","topic":"...","objects":["O02","O03"],"axis":"doc-doc|doc-law|doc-code|object-object|pattern-plan","a":{"cite":"path:line","claim":"verbatim"},"b":{"cite":"path:line","claim":"verbatim"},"severity":"blocking|material|cosmetic","known":null,"recommendation":"≤200 chars, which side should win and why (cite law if any)"}],
 "gaps":[{"object":"O02","kind":"no-plan|no-code|no-law|no-test|unreachable|no-owner|double-owner","item":"...","evidence":"path:line + what you grepped"}],
 "sharedResources":[{"kind":"hotkey|gesture|testid|store-field|ipc|surface-slot|undo|selection","name":"...","claimants":[{"object":"O02","cite":"path:line","meaning":"..."}],"conflict":true,"note":"..."}],
 "supersedeChains":[{"topic":"...","chain":["older doc:line","newer doc:line"],"headerPresent":true}],
 "openQuestions":[{"objects":["O02"],"question":"...","cites":["path:line"]}]}
```
Validate before finishing:
`node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));for(const k of ["trace","contradictions","gaps","sharedResources","supersedeChains","openQuestions"]) if(!Array.isArray(j[k])) throw k; for(const c of j.contradictions){ if(!c.a?.cite||!c.b?.cite) throw "cite "+c.id }' <file>`

Write nothing else (no scratch files anywhere — use your head or /dev/stdout). Final line of your reply, exactly:
`DONE <path> trace=N contradictions=N (new=N blocking=N) gaps=N shared=N conflicts=N`
