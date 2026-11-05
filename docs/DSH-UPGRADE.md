# DSH Upgrade Guide

This plugin tracks DeepSeek Harness rc releases. DSH is in early-stage rapid
development — every upgrade may break different things in unpredictable ways.
This document provides orientation, not a checklist. Adapt freely.

## Orientation

**Instrumentation strategy (2026-11)**: this plugin exists to *observe the
assembly itself* — a runtime-global view of the live Cordis fiber tree and its
service dependency graph. That requires reading Cordis internals that are not
part of its stable public API, and that is a **deliberate design commitment,
not a risk to be engineered around**. We follow the installed `@deepseek-ai/cordis`
version closely and absorb its internal reworks as a normal maintenance cost —
each reshuffle of `root.registry` / `root.reflect.store` / fiber fields lands as
a small `snapshot()` patch, with the exact field mapping recorded in the
Historical Breakages table below. No isolation layer is maintained between
`snapshot()` and Cordis internals: a facade would not prevent the field renames
(it still must name them), and today the reads already live in one method, so
the cheapest future-churn insurance is keeping the mapping notes current, not
adding indirection.

**What this plugin touches in DSH**: Cordis internals (`root.registry`,
`root.reflect.store`, fiber fields) for snapshot; `dsh-typert-protocol` for
host and client Remote descriptors; `dsh-tools` for tool registration;
`dsh-client-ui-*` packages for the browser panel. Any of these surfaces can
change between releases.

**Where to look when things break**: TypeScript errors from `pnpm install`
(prepare script) or `pnpm run build` are the primary signal. DSH does not
maintain a changelog — the type definitions in
`node_modules/@deepseek-ai/<pkg>/lib/types/` are the most reliable source of
truth for what changed. Read them directly rather than guessing.

**Two codec files**: Both `src/client/remote-client.ts` (client-side Remote
contribution) and `src/typert.ts` (host-side typert manifest) carry
`TypertCodec` descriptors. The host manifest has no compile-time type checking
against `TypertCodec`, so it can silently drift. Always check both when codec
types change.

**Cordis internals stay an operational caution**: because `snapshot()` reads
non-public Cordis APIs (by design — see the strategy note above), an internal
change can in principle corrupt snapshot *output* at runtime even when the build
passes clean. The insulating good news is that field renames/removals surface as
bare `TS2339` errors (`fiber.store`, `impl.fiber` did in 4.1.0). Still, after any
cordis bump, verify snapshot output even if the build passes clean.

**Theme tokens are silent risks too**: the panel styles itself against DSH
design tokens, and a token that does not exist just resolves to whatever
fallback the declaration carries — no error, no warning, no type check. Names
are easy to guess wrong; `--dsw-surface`, `--dsw-text-primary` and
`--dsw-border` do not exist, while the real families are
`--dsw-alias-bg-layer-1/2/3`, `--dsw-alias-label-primary/secondary/tertiary`,
and `--dsw-alias-border-l1..l4`. When touching any `src/client/*.css`, audit
every `var(--dsw-*)` against what the installed `dsh-client-ui-theme` actually
declares (its bundle also contains a `name: "--dsw-…"` token list). Check both
themes: a stale light fallback only shows up in dark, and vice versa.

## Compatibility Tracking

Three places must stay in sync after every upgrade:

1. `package.json` — peer/dev dependency versions
2. `README.md` — "Current release targets…" paragraph + compatibility table
3. `docs/RELEASING.md` — tag policy table

The compatibility table's Notes column should record *what broke and how it was
fixed*, not just version numbers. This is institutional memory for future
upgrades.

## Verification Before Publish

`typecheck` → `build` → `test` must all pass. Then smoke-test with a live
profile (`dsh --profile pt-test --no-open --port 0`) before publishing. The
user verifies interactively; do not publish without their confirmation.

After building, confirm the client bundle externals are still minimal:
```sh
grep -oE 'require\("[^"]+"\)' lib/client.js | sort -u
```
Only platform-module rows should appear.

## Historical Breakages

| From → To | What Broke | How It Was Fixed |
|-----------|-----------|-----------------|
| 0.1.2-rc.1 → 0.1.5-rc.1 | Nothing | Pure dependency refresh |
| 0.1.5-rc.3 → 0.1.7-rc.2 | `TypertCodec.schema` → `create: () => TypertSchema` factory | Wrapped zod schemas in `create: () => schema` in both `src/client/remote-client.ts` and `src/typert.ts` |
| 0.1.7-rc.2 → 0.2.0-rc.2 | Nothing | Pure dependency refresh, despite the minor-version jump |
| 0.2.0-rc.2 → 0.2.1-rc.2 | Nothing (typecheck/build/test green) | DSH peer refresh; the installed app is 0.2.1-rc.2 (npm `latest` still 0.2.0-rc.2). `@deepseek-ai/dsh-invariants` has no 0.2.1-rc.2 release and stays 0.2.0-rc.2, recorded as an explicit `check-compat` exception. |
| 0.2.1-rc.2 → 0.2.2-rc.1 | Cordis internals reworked: `Fiber.store` → `Fiber.committed`, `Impl.fiber` dropped | `snapshot()` reads cordis internals, so the two renamed fields surfaced as bare TS `2339` errors in `src/index.ts`. `Fiber.store?.[name]` (inject snapshot) → `Fiber.committed?.[name]`; `impl.fiber` (provider fiber) → `impl.ctx.fiber`. `Fiber.committed` retains required impls through dependent teardown, matching the old `store` semantics; the new `Impl.dependents` set (fibers retaining an impl during teardown) is not the snapshot source for a providing fiber — `committed` and `impl.ctx.fiber` are. Note `@deepseek-ai/cordis` is now `4.1.0` while the dsh packages are all `0.2.2-rc.1` — the registry `next` on `cordis` is alpha, so the cordis pin resolves from the installed app, not the tag. |

Add entries as they occur. Patterns emerge over time; premature generalization
does not.
