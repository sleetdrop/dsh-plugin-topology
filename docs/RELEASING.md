# Releasing

This plugin uses its **own independent semantic version** — it never mirrors
the DeepSeek Harness version. The only thing that tracks DSH is a documented
compatibility mapping: each plugin version states the DSH release it was
validated against (see the "Compatibility" table in
[`README.md`](../README.md#compatibility)).

Because publishing requires an interactive OTP (2FA), the final `pnpm publish`
step is run **by a human, by hand**. Everything before it is safe to script.

## Versioning Policy

Follow semver strictly based on **what changed for the plugin's users**, not
what changed upstream in DSH:

- **patch** (`0.x.Y`): DSH compatibility adaptation, dependency bumps, build
  fixes, documentation updates — nothing user-visible changed in behavior or
  API. This is the most common bump when tracking DSH releases.
- **minor** (`0.X.0`): new features, new tools, new UI capabilities, new
  exported APIs — backwards-compatible additions.
- **major** (`X.0.0`): breaking changes to the plugin's own public API or
  behavior.

A DSH upgrade that requires code changes but produces no user-visible
difference is still a **patch** bump. Do not inflate the version number just
because the upstream had a large jump or because the adaptation was difficult.

## Distribution Policy

- **npm registry** is the canonical distribution channel.
- **Git tags** (`v0.x.y`) are the canonical source reference.
- **GitHub Releases** are NOT used. Do not create them. Tags + npm suffice.

## Branch workflow

`main` is protected, admins included. Every change reaches it through a pull
request: `quality (node 22)` and `quality (node 24)` must pass on a branch that
is up to date with `main`, force-push and deletion are blocked, and merged
branches are deleted automatically. The full rules agents must follow are in
[`../AGENTS.md`](../AGENTS.md); the short version:

- branch off `main` (`feat/…`, `fix/…`, `docs/…`, `chore/…`; releases use
  `release/vX.Y.Z`), open a PR, wait for both checks, then
  `gh pr merge --squash --delete-branch`;
- delete the branch after merge, local and remote. Only branches merged
  through a PR are auto-deleted; a branch merged by another path (or merged
  before the PR existed) has to go explicitly with `git branch -d <branch>`,
  `git push origin --delete <branch>`, then `git fetch --prune`. A branch whose
  tip is already an ancestor of `origin/main` holds no unique work;
- rebase onto `origin/main` rather than merging `main` into the branch, since
  the required checks are strict;
- tags are not branches: tag the squash-merged release commit after the PR
  lands.

## One release, end to end

Pick a new plugin version using plain semver (e.g. `0.2.0`), and the DSH rc you
adapt to (e.g. `0.1.2-rc.1`). The two are independent.

**Order matters: nothing gets tagged until the pre-release review is complete
and the user has confirmed the smoke test.** A tag is the canonical reference
for a published artifact, so a tag cut too early cannot be quietly corrected —
0.5.0 was tagged while its work was still settling and the tag had to be
deleted.

```sh
# 1. Bump package.json:
#    - "version": the new plugin semver (independent of DSH).
#    - peerDependencies / devDependencies: every @deepseek-ai/* client package
#      pinned to the DSH rc you adapt to (cordis to ^4.0.x).

# 2. Full CI-equivalent gate (prepublishOnly runs it too, but run it now so
#    you publish with confidence). It includes typecheck, build, tests,
#    orphaned-lib, client externals, DSH token audit, pack payload and the
#    README/RELEASING/peer compatibility table.
pnpm install --frozen-lockfile
pnpm check

# 3. If you need to inspect the client externals manually (same check):
grep -oE 'require\("[^"]+"\)' lib/client.js | sort -u

# 4. Update the Compatibility table in README.md — it renders on the npm
#    package page, so it is this release's public face. `pnpm check` fails
#    until README, docs/RELEASING.md and the DSH peer ranges agree.

# 5. Run the pre-release review below. Every gate, and report the results.
#    `Release preflight` in GitHub Actions runs the same gates and uploads the
#    exact tarball artifact; it never tags or publishes.

# 6. Smoke-test in a web profile, and WAIT for the user's confirmation. The
#    pt-test profile links this checkout via a symlink, so rebuilds show up:
dsh --profile pt-test --no-open --port 0    # open the printed token URL

# 7. Only once 1–6 are done and reported: put the release commit on a branch,
#    open a PR, let both checks pass, squash-merge, then tag the merged commit.
git switch -c release/v<version>
git add -A
git commit -m "chore: release <version> (targets dsh <rc>)"
git push -u origin release/v<version>
gh pr create    # the template applies; fill Evidence + Release impact

# Wait for "quality (node 22)" and "quality (node 24)" to pass, then:
gh pr merge --squash --delete-branch
git switch main && git pull --ff-only
# Tag the squash commit; if main moved since the merge, use that commit's SHA.
git tag -a v<version> -m "dsh-plugin-topology v<version> — targets dsh <rc>"
git push origin v<version>
```

## Pre-release review — required before tagging

The full checklist and its commands live in [`../AGENTS.md`](../AGENTS.md),
which DeepSeek Harness injects into every agent session. The mechanical gates
are `pnpm check` and the manual `Release preflight` workflow. In short:

1. **Scope** — review the diff since the last tag, not just the last commit.
2. **Version** — correct semver level, and not already on the registry.
3. **Packaging** — inspect what actually ships (`pnpm pack --dry-run`) and
   confirm there is no orphaned `lib/` output for a deleted source. `lib/` is
   gitignored, so git cannot show you this; 0.5.0 shipped a dead
   `NodeDetailPanel.js` for exactly that reason.
4. **User-facing docs** — re-read the new compatibility row *as a reader*: is
   every claim unambiguous, and is each one true of this release?
5. **Gates** — `pnpm check` (install / typecheck / build / test / orphaned lib /
   client externals / DSH tokens / pack / compatibility).
6. **Smoke test** — user-confirmed.

Report what was actually checked. "All good" is not a review.

### 7. Publish — RUN BY HAND (OTP)

```sh
./scripts/publish.sh
```

The script guards the registry (must be `registry.npmjs.org`, never a read-only
mirror), checks login (starts an interactive `npm login` if needed), runs
`pnpm publish --access public --registry https://registry.npmjs.org/`, then
verifies the resulting dist-tags.

**Expect the login step to run even when you are already logged in.** The token
in `~/.npmrc` is a granular access token: it publishes fine, but `npm whoami`
answers `E401`, so the guard cannot tell it apart from a logged-out shell and
starts `npm login`. This is harmless — login and publish both require an OTP
anyway, so the extra round trip costs nothing — and it is not a sign that
anything is misconfigured. Do not "fix" it by dropping the guard: the guard is
the only thing that catches a genuinely missing login, and without it that
failure surfaces much later as a confusing `E404 Not Found` on `PUT`.

npm prompts for your OTP during login and/or publish — enter it in the terminal
(or approve the push on your device).

### 7b. Test builds — publish before the smoke test, under `next`

A fix that only the desktop can confirm (window compositing, vibrancy, focus)
cannot be smoke-tested from the repository copy, because the desktop profile
installs from npm. Publish it as a prerelease of the next patch instead:

```sh
# package.json "version": "0.9.0-test.0"
./scripts/publish.sh          # prerelease → --tag next, `latest` untouched
```

`latest` keeps serving the last validated release, and the desktop profile can
install the exact version:

```sh
cd ~/.dsh/profiles/desktop
pnpm add @sleetdrop/dsh-plugin-topology@0.9.0-test.0 --save-exact
```

pnpm's `minimumReleaseAge` (24 h in the desktop profile) refuses a build that
young, so add the exact version to `minimumReleaseAgeExclude` in the profile's
`pnpm-workspace.yaml` first. After the user confirms the smoke test, set
`"version": "0.8.1"`, add the README/RELEASING rows, run `pnpm check`, and
publish the stable version with `./scripts/publish.sh latest`; then tag.

A prerelease is exempt from the README-row check in `check-compat` (the row is
for released versions), but it must still agree with the last released row on
every DSH peer.

## Verification after publishing

```sh
curl -s "https://registry.npmjs.org/@sleetdrop%2fdsh-plugin-topology" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('dist-tags:',j['dist-tags']);console.log('versions:',Object.keys(j.versions).join(', '))})"
```

Expect `dist-tags.latest` to be the new version.

**A 404 immediately after publishing does not mean the publish failed.** The
registry serves both the package document and the per-version endpoint through a
CDN, so a just-published version can take a minute or two to appear: `GET
/@sleetdrop%2fdsh-plugin-topology/<version>` answers
`404 {"version not found"}`, a cache-busted packument still reports the old
`latest`, and `dist-tags` lags too. Treat the publisher's own success output as
the signal, then re-poll after a couple of minutes before investigating. `0.5.0`
was briefly misdiagnosed as a failed publish for exactly this reason; the fix is
patience, not a re-run.

## Carrying unreleased fixes

Small post-release fixes may land on `main` — through a PR, like everything
else — with no tag and no release; the next version picks them up. `main` then
sits ahead of the newest tag while `package.json` still holds the *published*
version. That is intentional, and it
doubles as a safety net: forgetting to bump means `pnpm publish` fails with
"version already exists" rather than silently re-publishing over a live version.

Bump before the next publish, and fold the carried changes into the new
compatibility row. (`0.5.0` shipped `lib/client/NodeDetailPanel.{js,d.ts}`, a
dead module `tsc` left behind after that source was deleted — the `build` script
now wipes `lib/` first, and the cleanup rides along in the next release rather
than earning a version bump of its own.)

## Tag policy recap

Plugin versions are independent semver; the table records which DSH release
each was validated against (Git tags carry a `v` prefix, npm versions do not).

| Plugin version | Targets DSH harness | model |
| --- | --- | --- |
| `0.1.0` | `0.1.1-rc.2` | old `dsh-client-runtime` browser model (frozen) |
| `0.2.0` | `0.1.2-rc.1` | Cordis-Context browser model |
| `0.3.0` | `0.1.5-rc.1` | dependency refresh; no code changes |
| `0.3.1` | `0.1.5-rc.3` | peer refresh to DSH 0.1.5-rc.3 |
| `0.4.0` | `0.1.7-rc.2` | TypertCodec API migration; cordis ^4.0.4 |
| `0.5.0` | `0.2.0-rc.2` | node detail popover + direction-scoped highlight; dark-theme color tokens; peer refresh |
| `0.6.0` | `0.2.0-rc.2` | Right-side inspector + breadcrumb/chips/search; quality gates (CI, drift checks, locale/inspector tests); no DSH source changes |
| `0.7.0` | `0.2.1-rc.2` | Service inspector, missing services, startup timeline; live topology doctor (loaded-only); DSH 0.2.1-rc.2 peer refresh |
| `0.8.0` | `0.2.1-rc.2` | Global main page on DSH layout/primitives; static 2px startup strip; row-driven hover pulse; merged groups; no DSH peer change |
