# Quality and drift

Status: **active**, phased. The first slice landed with 0.6.0.
This is a standing workstream, not a one-off release checklist: pull the next
small increment into a feature PR whenever the feature touches that area.

The goal is not "more process". It is to make the repository itself the source
of truth for an agent — runnable verification, explicit contracts, deterministic
gates, and cheap drift alarms — so an agent can close its own loop without a
human becoming the verifier for every change.

## What we borrowed, and from where

Recent Anthropic/OpenAI engineering writing converges on a few concrete ideas:

- **Give the agent a check it can run.** Verification is what turns "looks
  done" into a pass/fail loop ([Claude Code best
  practices](https://code.claude.com/docs/en/best-practices), [Building
  verification loops in Claude Code with
  skills](https://claude.com/blog/building-verification-loops-in-claude-code-with-skills),
  2026-07-22).
- **Separate generation from evaluation.** Agents reliably over-praise their own
  work; a fresh-context reviewer, hard thresholds, and a "report what you
  checked" rule are stronger than self-certification ([Harness design for
  long-running application
  development](https://www.anthropic.com/engineering/harness-design-long-running-apps),
  2026-03-24).
- **Use structured handoff artifacts.** Feature lists, progress notes, an
  `init.sh`, git history and a clean end state let the next session start
  without guessing ([Effective harnesses for long-running
  agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents),
  2025-11-26).
- **Context is a finite attention budget.** Keep the always-loaded instructions
  short; put domain detail behind progressive disclosure ([Effective context
  engineering for AI
  agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents),
  2025-09-29).
- **Move from traces to repeatable evals.** Inspect traces while debugging,
  then turn what "good" means into datasets/eval runs so regressions are
  measurable ([OpenAI — Evaluate agent
  workflows](https://developers.openai.com/api/docs/guides/agent-evals), [Testing
  Agent Skills Systematically with
  Evals](https://developers.openai.com/blog/eval-skills)).
- **The SDLC has to be re-cut, not just sped up.** Gates, review and ownership
  move rather than disappear ([The AI-native SDLC
  playbook](https://claude.com/blog/the-ai-native-sdlc-playbook), 2026-08-21).
- **A harness encodes assumptions.** Every scaffold component assumes something
  the model cannot do on its own; re-test and remove it as models improve
  (Harness design, above).

`openai.com/index/harness-engineering` (the "repository as the harness" piece)
is on the watchlist below; its direct page blocks this environment, so it is
listed but not yet mined.

## Principles → this repository

| Principle | Concrete practice here |
| --- | --- |
| Verification loop | `pnpm check`; CI on Node 22/24; tests + screenshots + user smoke; never "looks done". |
| Independent evaluator | CI is deterministic; a fresh-context review or the user smoke checks UI; the PR template asks for evidence, not claims. |
| Contracts before code | Design docs (`docs/design/`), the release compatibility table, acceptance criteria in the PR. |
| Structured handoff | `AGENTS.md` (short), `docs/RELEASING.md`, `docs/DSH-UPGRADE.md`, `NEXT-STEPS.md`, this file, git history. |
| Context discipline | AGENTS.md stays short; detail lives in linked docs; no giant always-loaded prompt. |
| Evals | Pure model tests (`test/inspector-model.test.ts`), locale parity, the `graph_render` path covered by host tests; the next slice adds tool contract evals. |
| Deterministic gates | CI + scripts, not prose. The release checklist now runs the same commands as CI. |
| Drift is a defect class | Orphaned `lib/`, unknown `--dsw-*` tokens, locale skew, README/RELEASING/peer skew, payload drift. |
| Human for irreversible steps | Tag and `pnpm publish` (OTP) stay human; user confirms the interactive smoke. |
| Re-examine the harness | Each phase item is additive and removable; no gate exists "because process". |

## Baseline: what was missing

| Area | Before the first slice | First slice (this branch) | Next |
| --- | --- | --- | --- |
| Tests | 1 host test file (16 tests), no client coverage | + inspector model (merged labels, state order, filter, npm URL) + locale parity → **26 tests** | React component tests, keyboard/a11y, coverage threshold |
| CI | none | GitHub Actions, Node 22 + 24, `pnpm check`; `main` protected (PR required, both checks) | DSH-version matrix |
| Lint/format | none | — | Biome or ESLint + Prettier (avoid a mass reformat mid-release) |
| Drift | manual six-step review | 5 scripts + locale test, wired into `pnpm check` and CI | generated docs, changelog check |
| Packaging | manual `pnpm pack --dry-run` | `check-pack` + release-preflight artifact | provenance/signature if the registry supports it |
| Security | none | Dependabot version updates + alerts/security updates (npm + Actions; DSH version bumps manual) | CodeQL / dependency audit |
| Evals | manual UI smoke | pure model + locale tests; host graph tests | `graph_render` contract/golden evals; scripted UI acceptance |
| Observability | none | — | trace grading for the model tool / failure cases |
| Docs | AGENTS, RELEASING, DSH-UPGRADE | this playbook + PR template | changelog, docs link check |
| Release | manual checklist | `Release preflight` workflow (no tag/publish) | keep tag/publish human |

## First slice in this branch

- `.github/workflows/ci.yml` — `pnpm check` on Node 22 and 24.
- `.github/workflows/release-preflight.yml` — manual; full gates + the exact
  tarball as an artifact; never tags or publishes.
- `.github/dependabot.yml` — weekly npm + GitHub Actions updates; DSH peer
  bumps filtered out because they move as one coordinated rc line, and
  security updates stay enabled (the `ignore` version levels do not filter
  them).
- `.github/pull_request_template.md` — definition-of-done checklist and evidence.
- `scripts/check-lib-orphans.mjs` — the 0.5.0 stale-module failure mode.
- `scripts/check-client-externals.mjs` — the frozen loader table is a contract.
- `scripts/check-css-tokens.mjs` — `--dsw-*`/`--ds-*` against the pinned theme, `--dsh-*` against the theme/local declarations/host-frame allowlist, and every checked `--dsw-alias-*` fallback that maps directly to a theme token against the light value.
- `scripts/check-graph-classes.mjs` — every dynamic `topo-*` class added to the SVG is reset by `clearHighlight` (or explicitly allowlisted).
- `scripts/check-pack.mjs` — the exact shipping payload, not the repo tree.
- `scripts/check-compat.mjs` — package.json ↔ README ↔ RELEASING ↔ DSH peers.
- `test/locales.test.ts` — en/zh key + placeholder parity.
- `test/inspector-model.test.ts` — the new rail's pure model (merged labels,
  state severity, unresolved counts, local filter, npm URL).
- `pnpm check` — the local equivalent of CI.

## Drift checks

| Check | Command | Catches |
| --- | --- | --- |
| Orphaned build output | `node scripts/check-lib-orphans.mjs` | a removed source's `lib/*.js` still shipping |
| Client externals | `node scripts/check-client-externals.mjs` | a require the DSH loader cannot answer |
| DSH tokens | `node scripts/check-css-tokens.mjs` | a guessed/misspelled `--dsw-*`/`--ds-*`/`--dsh-*`, or a fallback literal the theme never chose, silently painting |
| Graph highlight classes | `node scripts/check-graph-classes.mjs` | a new `topo-*` class outliving a selection change |
| Shipping payload | `node scripts/check-pack.mjs` | missing entry points or `src/`, `test/`, `docs/` in the tarball |
| Compatibility | `node scripts/check-compat.mjs` | package version, README row, RELEASING row, DSH peer ranges disagreeing |
| Locales | `pnpm test` (`test/locales.test.ts`) | en/zh key or placeholder skew |
| Inspector model | `pnpm test` (`test/inspector-model.test.ts`) | merged-label / state-order regressions |

`check-css-tokens` reads the pinned `@deepseek-ai/dsh-client-ui-theme` package and recognizes our local `--dsh-tl-*` declarations plus the host `--dsh-frame-*` family.
On a DSH upgrade, bump that devDependency with the other DSH packages; the audit
then follows the new theme automatically.

## Definition of done

A change is done when all of these are true, not when the build "looks green":

1. `pnpm check` is green; CI is the authoritative run.
2. New behavior has a deterministic test, or the PR states why it cannot and
   gives a reproducible manual check.
3. UI: a screenshot or smoke URL, and both themes when styling changed.
4. Any new string exists in **both** en and zh.
5. Any new CSS variable comes from the pinned theme; no guessed names.
6. No orphaned `lib/`; the package payload is intentional.
7. If version/DSH changed: README compatibility row, `docs/RELEASING.md` row,
   and peer ranges agree.
8. Docs touched: design doc / `NEXT-STEPS.md` / this file as appropriate.
9. Evidence is in the PR; UI changes get the user's interactive smoke.
10. No tag or publish before the pre-release review and user smoke.

## Roadmap

**Phase 0 — first slice (this branch).** CI, drift scripts, locale/inspector
tests, Dependabot, PR template, release preflight; run the same checks on the
current branch and on `v0.5.0`.

**Phase 1 — next feature touches (0.7).**
- Lint/format as a separate, mechanical commit (not entangled with a feature).
- React component tests (jsdom + testing-library) and a coverage floor.
- Playwright visual/keyboard/a11y smoke against the pt-test profile.
- `graph_render` contract/golden evals: schema, DOT/SVG invariants, cycles,
  unresolved, rankdir; failure-case fixtures.
- DSH-version compatibility matrix (install the previous rc alongside).

**Phase 2 — hardening / scale.**
- Mutation or property-based tests for the analysis/graph boundaries.
- Performance budgets for the SVG/analysis path (larger synthetic graphs).
- CodeQL / dependency audit, with a documented exception policy.
- Trace grading/observability for the model tool and UI failure modes.
- Changelog and docs-link checks; release provenance.

## Baseline runs

To be filled by the runs recorded in this branch:

- **0.6.0 pre-release baseline:** `pnpm check` — 26 tests, 21 built JS files,
  3 client externals, 18 `--dsw-*` tokens, 48 packed files. The baseline ran
  before the version bump at 0.5.0; the 0.6.0 release moves the package, README
  row and RELEASING row together to 0.6.0 → DSH 0.2.0-rc.2, and `check-compat`
  enforces that all three sync points move together.
- **v0.5.0 tag (detached worktree):** install/build pass; **16 host tests**;
  the copied locale test brings it to **19**; 18 built JS files, no orphans in a
  clean checkout; 3 client externals; 14 `--dsw-*` tokens across 4 CSS files;
  42 packed files; compatibility 0.5.0 → DSH 0.2.0-rc.2. The tag predates the
  `build` clean step, so this only proves a clean checkout; it cannot prove the
  published artifact.
- **Published 0.5.0 tarball:** contains
  `package/lib/client/NodeDetailPanel.{js,d.ts}` while the v0.5.0 source tree has
  no `NodeDetailPanel` — the stale-module incident. Running the new
  `check-lib-orphans` against the published `lib/` plus the v0.5.0 `src/` flags
  it immediately. The 0.6 branch builds with `clean` first, CI runs the orphan
  check after every build, and the release preflight builds from a clean
  checkout; the dead module cannot recur through the normal path.

## Industry watch

Review this list when a release or a DSH upgrade lands, and at least quarterly.
Add an item only when it maps to a concrete practice or check in this repo;
otherwise it is a link, not a gate.

| Source | Why it matters | Status |
| --- | --- | --- |
| [Anthropic — Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps) (2026-03-24) | Planner/generator/evaluator; sprint contracts; hard thresholds; Playwright QA; self-evaluation bias | adopted: independent gates, contracts, evidence |
| [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) (2025-11-26) | Feature list, progress notes, init script, clean handoff | adopted: AGENTS/docs/release table; next: feature checklist |
| [Anthropic — Building verification loops in Claude Code with skills](https://claude.com/blog/building-verification-loops-in-claude-code-with-skills) (2026-07-22) | Turn manual checks into repeatable skills/verifiers | adopted: `pnpm check`; next: a repo verification skill |
| [Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (2025-09-29) | Attention budget; progressive disclosure; just-in-time context | adopted: short AGENTS + linked docs |
| [Anthropic — The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) (2026-08-21) | Stage-by-stage SDLC change; measurement matters | watch: compare our gates each release |
| [Claude Code — Best practices](https://code.claude.com/docs/en/best-practices) | Give a check; show evidence; fresh-context/adversarial review | adopted: PR evidence + review; next: subagent review |
| [OpenAI — Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals) | Traces → datasets → repeatable evals; regressions | next: `graph_render` evals; trace grading later |
| [OpenAI — Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills) | Systematic eval of skills/agents | next: turn smoke steps into an eval set |
| [OpenAI — Using skills to accelerate OSS maintenance](https://developers.openai.com/blog/skills-agents-sdk) | Skills as maintenance workflows | watch |
| [OpenAI — Harness engineering](https://openai.com/index/harness-engineering/) | Repository as the agent's harness/system of record | watch: direct page blocked here |
| [Anthropic — Writing tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) | Tool contracts, token-efficient responses | next: `graph_render` contract review |

## Maintenance notes

- **DSH upgrade:** bump `@deepseek-ai/dsh-client-ui-theme` with the other DSH
  devDependencies; `pnpm check` re-audits tokens and compat automatically.
- **New UI string:** add to en and zh; the locale test fails otherwise.
- **New CSS:** use a token declared by the pinned theme; the token check fails
  otherwise.
- **Delete a source file:** `pnpm build` cleans `lib/`; the orphan check proves
  it.
- **Release:** run the `Release preflight` workflow, inspect the artifact, then
  the human tag/publish sequence in `docs/RELEASING.md`.
- **Weakening a gate:** don't. Fix the drift, or update the documented baseline
  and this file in the same PR.
