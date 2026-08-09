# Review Configuration

Rules for automated reviewers (Claude Code review Actions, /code-review) on this repo.

## Severity + noise control
- Report at most 5 nit-level findings; summarize the rest as a count.
- Every finding must cite `file:line` and a concrete failure scenario. No citation = don't post.
- Do not re-report findings already posted on this PR that remain unresolved.

## Skip paths
- `node_modules/`, `dist/`, `build/`, `release/`, `coverage/`, generated files, lockfiles.
- Test fixtures and snapshot files (report only if a fixture hides a real behavior change).

## Elevated attention
- IPC boundaries (Electron main <-> renderer <-> Python sidecar): flag any new unvalidated input crossing a trust boundary as Important.
- State management: derived Zustand state not recomputed, asymmetric setup/cleanup.
- Audio-path regressions: blocking calls or allocation on the real-time path.
