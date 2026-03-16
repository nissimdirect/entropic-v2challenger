# Entropic v2 — Release Checklist

## Automated (CI must be green on main)

- [ ] Backend tests pass: `cd backend && python -m pytest -x -n auto --tb=short`
- [ ] Frontend tests pass: `cd frontend && npx vitest run`
- [ ] E2E tests pass: `cd frontend && npx playwright test`
- [ ] Nuitka binary builds and responds to ZMQ ping
- [ ] No TypeScript errors: `cd frontend && npx tsc --noEmit`

## Manual (human, 30 minutes)

- [ ] Install from built .dmg on a clean macOS machine (no dev tools)
- [ ] Import 3 test videos: small (480p, 5s), medium (1080p, 30s), large (4K, 10s)
- [ ] Build effect chain with 5+ effects, adjust parameters
- [ ] Scrub timeline, verify preview updates
- [ ] Export H.264 — verify file plays in QuickTime Player
- [ ] Export ProRes — verify file plays in QuickTime Player
- [ ] Test keyboard shortcuts: Space (play/pause), Cmd+Z (undo), Cmd+S (save)
- [ ] Resize window to minimum — no UI elements overlap or disappear
- [ ] Close app during export — verify no orphan Python processes (Activity Monitor)
- [ ] Reopen app — verify welcome screen appears, no crash recovery dialog
- [ ] Open a saved project — verify effects + timeline restore correctly

## Before Tagging Release

- [ ] Version bumped in package.json + pyproject.toml
- [ ] CHANGELOG.md updated
- [ ] All CI checks green on the release commit
- [ ] Git tag created: `git tag -a v1.0.0 -m "v1.0.0"`
