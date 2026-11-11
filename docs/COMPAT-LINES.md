# Multi-line compatibility maintenance

How this repository keeps a usable plugin version for every DeepSeek Harness
release line its users are still on. Read this before cutting a release or
answering a "plugin does not show up on DSH X.Y.Z" report.

## The constraint that drives everything

One plugin build can target **exactly one DSH line**. Two things couple the
plugin to a line:

- `peerDependencies` on `@deepseek-ai/dsh-*` — the harness's
  `evaluatePluginCompatibility` accepts or rejects a plugin version against
  the running DSH version by evaluating these ranges, so a plugin version is
  *installable* on exactly the lines its peers admit.
- Code surfaces that drift between lines — Cordis internals read by
  `snapshot()` (`Fiber.store` vs `Fiber.committed`), slot contracts,
  typert codecs, sidebar/layout APIs.

A peer range like `^0.2.1-rc.2` admits every later rc of the same line
(`0.2.1-rc.5` included) and the next line's prereleases are excluded — so the
*range* is line-shaped, while the *validation* is point-shaped: a release is
validated against one concrete DSH release. The gap between "admitted" and
"validated" is where users get silently stuck. This document closes that gap
with a branch model, a release matrix, and a scripted validation harness.

## Vocabulary

- **Line** — one DSH minor release family, e.g. `0.2.1`. Its rcs
  (`0.2.1-rc.2 … 0.2.1-rc.5`) are point releases of the line. DSH's release
  cadence is `alpha` → `rc`; this plugin follows stable `rc` releases only.
- **Target** — the single DSH release a plugin version was validated against
  and peers to. Recorded in the README compatibility row.
- **Maintained lines** — the newest line (always) plus the previous line while
  it still has users. Older lines are frozen (status quo: the 0.1.x line's
  browser model row is marked frozen).

## Branch model

```
main                        → newest DSH line (feature work + releases)
compat/dsh-0.2.1.x          → maintained older line (compat patch releases only)
compat/dsh-0.2.0.x          → archived once no users remain (rows marked frozen)
```

- `main` keeps today's rules: protected, PR-only, squash-merge, quality gates.
- A **compat branch is cut from the last release commit that targeted the
  line**, at the moment the next line becomes `main`'s target. Example: when
  `v0.9.1` (target `0.2.2-rc.1`) landed, `compat/dsh-0.2.1.x` was cut from
  `v0.9.0` (the last `0.2.1`-targeting release). The branch carries the
  line's peer pins and any line-specific source deltas (`src/index.ts` on the
  branch keeps `Fiber.store`; `main` has `Fiber.committed`).
- **Compat branch rules**:
  - patch-level releases only (`0.x.Y`); no features, no minor/major bumps —
    a feature lands on `main` first and is released for the newest line.
  - every release is validated on the line's target with
    `scripts/validate-dsh.mjs` before tagging (same hard rule as `main`).
  - branches are long-lived, protected like `main`, and get the same
    `quality (node 22)` / `quality (node 24)` gates.
- **Freezing a line**: when the line has no remaining users, mark its rows
  frozen in the README, archive the branch (close it; do not delete —
  re-opening a frozen line happens and history is the cheapest context).

## Version numbering

One strictly increasing counter across all branches (`0.9.1`, `0.9.2`, …),
never reused, never re-published. Interleaved releases from two branches
(`main` releasing a `0.2.2`-target and `compat/dsh-0.2.1.x` releasing a
`0.2.1`-target) are fine: the README compatibility matrix is the single
source of truth mapping number → target, and the release checklist verifies
against the registry (`pnpm view … versions`) that the number is
unpublished before tagging. `check-compat` keeps each branch's
package.json / README / RELEASING.md / peers consistent *locally*, so a
release always ships with a matching row.

## The matrix

The README compatibility table **is** the matrix. Every row states the exact
validated DSH release:

| Plugin version | Targets DSH harness | Notes |
| --- | --- | --- |
| `0.9.0` | `0.2.1-rc.2` | … |
| `0.9.1` | `0.2.2-rc.1` | … |
| `0.9.2` | `0.2.1-rc.5` | compat branch re-validation; rc.2→rc.5 delta was additive |

Users pick the row whose target matches their harness. The peer range of a
release is line-shaped (`^` of the target rc), so an unlisted rc of the same
line still installs; whether it has been validated is answered by the
DSH-UPGRADE audit log, not by the range.

## Handling rc drift inside a line

A user on `0.2.1-rc.5` installing a release validated on `0.2.1-rc.2` is the
scenario this whole document exists for. The reaction is always the same:

1. **Reproduce, don't guess**: run the harness against the user's exact DSH
   release (`node scripts/validate-dsh.mjs --dsh 0.2.1-rc.5 …`).
2. **Green** → the code is fine; the report is environmental (wrong profile,
   stale app state, cache). Diagnose the user's environment, and if the rc is
   past the validated row, re-validate and record a new row + release only
   when the user base justifies it (a validation-only release like `0.9.2` is
   a legitimate patch bump — precedent `0.3.1`).
3. **Red** → fix on the compat branch (or on main if it's the newest line),
   release a patch, update the row and the DSH-UPGRADE audit entry.

## Validation harness

`scripts/validate-dsh.mjs` assembles a disposable DSH installation of an
arbitrary published version from npm, boots its headless web server with a
fresh profile, and verifies the plugin end to end:

- **Stage 1 (no browser)**: the boot graph served in `__DSH_BOOT__` contains
  the plugin client entry with the expected inject list; the bundle route
  answers 200.
- **Stage 2 (browser)**: with puppeteer-core + a Chrome headless shell, the
  sidebar renders the `Plugin topology` row, clicking it renders the topology
  page (metrics + SVG graph), and the console stays clean.

Prerequisites: `pnpm`, `node >= 22`, network. The chrome shell is downloaded
once into a cache directory (npmmirror mirror, Google fallback). See the
script header for exact usage. Every maintained line's current target should
pass the harness before any release is tagged.

`--plugin <dir>` installs a `file:` dependency, which pnpm copies at install
time rather than symlinking: rebuild the checkout, then re-run the harness
(each run gets a fresh sandbox, so this is automatic). To validate the exact
shipping artifact instead, pack it (`pnpm pack`) and pass the `.tgz` path as
`--plugin`.

## Answering user reports

A "no panel on DSH $V" report is handled in this order:

1. Confirm the plugin version's peer range admits $V and the row's validated
   target matches or predates $V — if not, point the user at the right
   version first.
2. Run the harness at $V against the reported plugin version; produce the
   PASS/FAIL evidence.
3. **Green**: the plugin is not the breakage. Ask for the served profile
   identity (`dsh --dump-config` / which profile the opened UI belongs to —
   typically the *profile mismatch* case: the plugin was installed into a
   CLI-managed profile while the UI the user browses is served by another
   profile), the boot log, and the console output (DevTools). The plugin's
   own client logs its mount failures to the console, never silently.
4. **Red**: fix on the right branch (compat branch if the line is older),
   release, update rows.

## Release checklist deltas per location

| Step | main (newest line) | compat/dsh-<line>.x |
| --- | --- | --- |
| Version bump | minor/patch per policy | patch only |
| Peers | next line's rc | the line's newest validated rc |
| Harness validation | required | required |
| PR + gates + squash | required | required |
| Tag + publish | per RELEASING.md | per RELEASING.md, announce row in README matrix |

Everything else (pre-release review, smoke test, OTP publish, registry traps)
is unchanged — see `docs/RELEASING.md`.