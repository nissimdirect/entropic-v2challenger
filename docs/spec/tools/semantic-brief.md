# Phase-1 semantic reader brief (shared by all cluster readers)

Repo worktree: /Users/nissimagent/Development/entropic-spec-pass (branch docs/spec-pass = origin/main 4dc01de). READ-ONLY except your one output file.

## Rules (verbatim, binding)
1. "Every spec claim about current behavior cites file:line." — every item you emit carries a `doc:line` cite; any claim about CODE carries a `file:line` you personally verified with grep/Read in this worktree.
2. "No assumptions." — if status cannot be evidenced, use status "unclear"; never infer "built" from a doc saying it was planned.
3. RATIFIED-FOUNDATIONS.md (docs/frontend/) is law. A doc or code contradicting a ratified row = severity "blocking". Read it first (31 lines). Also read docs/spec/AREAS.md (area ids A01–A23) and use those ids.
4. Quote claims verbatim (≤200 chars). Do not paraphrase a contradiction into existence: both sides must be quoted and genuinely incompatible (not just different phases/dates where the later one explicitly supersedes — record those under supersededDocs instead).

## Helpers
- Generated inventory: docs/spec/inventory/inventory.json — keys: components[] (name, at, mountedIn), orphanComponents[], stores[].actions[] (name, at, refs = files referencing it outside its store; empty = unreferenced), hotkeys.registry[], menu.items[], docs[] (per-doc staleCites, openSample). Use it to detect half-built items (doc says shipped, component is orphan / action unreferenced / no UI entry point).
- "Half-built" = backend or store exists but no UI entry point mounts it, OR UI exists but is dead/orphaned, OR a plan packet marked done whose oracle code is absent.

## Output (ORACLE)
Write exactly one file: docs/spec/inventory/semantic/<CLUSTER>.json with this shape:
{"cluster":"<CLUSTER>","docsRead":["path",...],
 "features":[{"area":"A04","name":"...","source":"doc:line","status":"built|half-built|planned|superseded|abandoned|unclear","codeEvidence":"file:line|null","notes":"≤200 chars"}],
 "halfBuilt":[{"area":"A..","item":"...","docSays":"doc:line","codeShows":"file:line","gap":"..."}],
 "contradictions":[{"topic":"...","a":{"cite":"doc:line","claim":"verbatim"},"b":{"cite":"doc-or-code:line","claim":"verbatim"},"severity":"blocking|material|cosmetic"}],
 "openDecisions":[{"area":"A..","id":"OD-x|null","cite":"doc:line","question":"..."}],
 "supersededDocs":[{"doc":"path","supersededBy":"path|decision","cite":"doc:line"}]}
Validate before finishing: node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1]));for(const k of ["features","halfBuilt","contradictions","openDecisions","supersededDocs"]) if(!Array.isArray(j[k])) throw k' <file>
Every docs file in your slice must appear in docsRead (skim mechanical/UAT logs; read plans/specs/proposals fully).
Final line of your reply, exactly: DONE <path> features=N halfBuilt=N contradictions=N openDecisions=N
