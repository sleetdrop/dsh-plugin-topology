# AGENTS.md

Project instructions for agents working in this repository. DeepSeek Harness
loads this file into agent context automatically (`dsh-agent-instructions`), so
keep it short and actionable. Full process detail lives in
[`docs/RELEASING.md`](docs/RELEASING.md) and
[`docs/DSH-UPGRADE.md`](docs/DSH-UPGRADE.md).

## What this is

`@sleetdrop/dsh-plugin-topology` — an out-of-tree DeepSeek Harness plugin: a
Cordis host service that snapshots the live plugin fiber tree, a `graph_render`
model tool, and a global browser page that draws the topology.

It tracks DSH `rc` releases on its **own independent semver**. The mapping
between plugin version and validated DSH release is the compatibility table in
[`README.md`](README.md) — never infer it, never let it drift.

## Hard rules

1. **Do not tag or publish without a completed pre-release review, reported to
   the user first.** A tag is the canonical reference for a published artifact;
   a defect under a tag cannot be quietly corrected. This rule exists because
   0.5.0 shipped a stale module and a misleading README row — both were findable
   before the tag was cut.
2. **Do not tag before the user confirms the interactive smoke test.** A green
   build is not verification. Launch the profile, hand over the URL, and wait.
3. **`pnpm publish` is a human step** (interactive OTP). Prepare everything,
   then hand over the command. Never claim a release is complete on the strength
   of your own registry poll taken seconds after publishing (see traps).
4. **Finish reviewing before committing, and do not tag merely because work
   looks done.** Small post-release fixes are expected to land on `main`
   through a PR, untagged, and ride the next version — that is the documented
   policy, not a gap to be closed by cutting a version for every fix.

## Branch workflow — `main` is protected

GitHub branch protection is on for `main` and applies to admins: direct pushes
are rejected, force-push and deletion are blocked, every conversation must be
resolved, and a PR can merge only when `quality (node 22)` and
`quality (node 24)` are green on a branch up to date with `main`. Branches
merged through a PR are deleted automatically. Do not try
`git push origin main`; expect it to fail.

- Start every change on a short-lived branch off `main`: `feat/…`, `fix/…`,
  `docs/…`, `chore/…`; releases use `release/vX.Y.Z`.
- Open a PR (`gh pr create`) using the repository template, with commands and
  real output under Evidence. Wait for both checks — never merge red, never
  bypass protection.
- Keep the branch current by rebasing: `git fetch origin && git rebase
  origin/main`. Required checks are strict, so a stale branch cannot merge.
  `git push --force-with-lease` is allowed only on your own feature branch,
  never on `main`; never merge `main` back into a feature branch.
- Squash-merge (`gh pr merge --squash --delete-branch`) so one PR is one
  commit on a linear `main`.
- **Delete the branch when it merges — local and remote, every time.**
  `--delete-branch` covers the PR branch and the local checkout, but a branch
  merged by another path (or merged before the PR existed) is *not*
  auto-deleted: it lingers in `git branch -a` and in the remote and can be
  picked up as a stale base next time. Delete it explicitly
  (`git branch -d <branch>` and `git push origin --delete <branch>`) and run
  `git fetch --prune`. A branch whose tip is already an ancestor of
  `origin/main` (`git merge-base --is-ancestor <branch> origin/main`) holds no
  unique work and is always safe to delete. Before starting new work,
  `git branch -a` should show only `main` plus its `origin/` tracking refs.
- Tags are not branches: after the release PR merges, tag the squash-merged
  release commit and push the tag directly.

## Quality gates

`pnpm check` is the local equivalent of CI and must be green before reporting a
change done: typecheck → build → test → orphaned `lib/` → client externals →
DSH token audit → pack payload → README/RELEASING/peer compatibility →
provider-safe tool names. CI
(`.github/workflows/ci.yml`) runs the same on Node 22 and 24 and is the
authoritative gate; local green is necessary, not sufficient. Do not weaken a
check to make a change pass — fix the drift or update the documented baseline.

The phased quality/drift workstream, its sources and the definition of done
live in [`docs/QUALITY.md`](docs/QUALITY.md). Add new industry practices there
instead of leaving them only in a chat.

## Pre-release review

Walk all six and **report what you actually checked**, before running
`git tag`. "All good" is not a report.

1. **Scope** — read the diff since the last tag, not just the last commit:
   ```sh
   git log --oneline $(git describe --tags --abbrev=0)..HEAD
   git diff --stat $(git describe --tags --abbrev=0)..HEAD
   ```
   Confirm every change is intended for this release and nothing is missing.
2. **Version** — correct semver level (patch: DSH compat, deps, docs; minor:
   features; major: breaking), and not already published:
   ```sh
   pnpm view @sleetdrop/dsh-plugin-topology versions --json
   ```
3. **Packaging — inspect the tarball, never the repo tree.** `lib/` is
   gitignored and `tsc` never deletes the output of a removed source, so stale
   modules are invisible to git but ship anyway. `npm pack` is broken in this
   environment (see traps); use pnpm:
   ```sh
   pnpm build
   pnpm pack --dry-run          # exact shipping payload, leaves no artifact
   ```
   `pnpm check` runs the orphan, externals, token, pack and compatibility
   checks automatically. To inspect by hand:
   ```sh
   for f in $(find lib -name '*.js' ! -name 'client.js' ! -name '*.map'); do
     base="${f#lib/}"; base="${base%.js}"
     [ -f "src/$base.ts" ] || [ -f "src/$base.tsx" ] || echo "ORPHAN: $f"
   done
   ```
4. **User-facing docs** — the README renders on the npm package page, so it is
   the release's public face. Re-read the new compatibility row **as a reader,
   not as its author**: is every claim unambiguous, and is each one actually
   true of *this* release? Keep the sync points aligned: `package.json`,
   `README.md`, `docs/RELEASING.md`, and the `docs/DSH-UPGRADE.md` history table
   when upstream moved.
5. **Gates** — `pnpm install --frozen-lockfile` → `pnpm check` (typecheck,
   build, tests, orphaned `lib/`, client externals, DSH token audit, pack,
   compatibility table). CI is the authoritative run; local green is
   necessary, not sufficient.
6. **Smoke test** — `dsh --profile pt-test --no-open --port 0`, then wait for
   the user's confirmation.

Only after 1–6 are reported: release commit on a `release/vX.Y.Z` branch → PR
→ squash-merge → tag the merged commit → push the tag. Publishing follows
separately, by hand.

## Known traps

- **Registry propagation lag.** The packument, the per-version endpoint and
  `dist-tags` are all CDN-served, so a just-published version answers
  `404 {"version not found"}` for a minute or two. Trust the publisher's own
  success output, re-poll after a couple of minutes, and do not re-run the
  publish. 0.5.0 was briefly misdiagnosed as a failed publish for this reason.
- **`npm whoami` returns 401** with the granular token in `~/.npmrc`, even
  though that token publishes correctly. `scripts/publish.sh`'s login guard
  therefore fires every time; that is intended, and the guard must stay because
  it is what catches a genuinely missing login.
- **`~/.npm` contains root-owned files**, so plain `npm` commands fail with
  `EPERM` / "cache folder contains root-owned files" and silently skip writing
  debug logs. Prefer `pnpm` subcommands (`pnpm view`, `pnpm pack --dry-run`).
  If npm is genuinely needed, redirect the cache:
  `npm_config_cache="$PWD/.npm-probe" npm <cmd>`. The permanent fix is a
  one-time `sudo chown -R $(id -u):$(id -g) ~/.npm`.
- **The panel breaks silently when a `--dsw-*` variable is misspelled.** An
  undefined CSS variable resolves to its fallback with no error. `pnpm check`
  audits every `var(--dsw-*)` in `src/client/*.css` against the pinned
  `@deepseek-ai/dsh-client-ui-theme`; the theme covers both light and dark.
  Bump that devDependency with the other DSH packages on upgrade.
