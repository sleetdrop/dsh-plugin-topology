## Summary

<!-- What changed, for whom, and why. Link the design doc or issue. -->

## Verification

- [ ] `pnpm check` is green locally
- [ ] New behavior has a deterministic test, or the PR states why it cannot
- [ ] UI changes: screenshot / smoke URL + notes (and both themes if styling)
- [ ] Locale keys added to **both** en and zh
- [ ] `--dsw-*` tokens come from the pinned theme; no guessed names
- [ ] `lib/` has no orphaned output; `pnpm pack --dry-run` payload is intentional
- [ ] README / `docs/RELEASING.md` compatibility rows updated if version or DSH changed
- [ ] Independent review (fresh context, diff + criteria) and user smoke for UI

## Evidence

<!-- Paste the commands and the meaningful output, not "all good". -->

## Release impact

- [ ] No version bump needed (carried fix)
- [ ] Version bump: <!-- x.y.z, semver reason -->
- [ ] DSH compatibility row changed: <!-- old -> new, why -->
