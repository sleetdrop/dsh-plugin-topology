# DSH Upgrade Guide

This plugin tracks DeepSeek Harness rc releases. DSH is in early-stage rapid
development — every upgrade may break different things in unpredictable ways.
This document provides orientation, not a checklist. Adapt freely.

## Orientation

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

**Cordis internals are silent risks**: `snapshot()` reads non-public Cordis
APIs. These breakages produce no type errors — only wrong data at runtime.
After any cordis bump, verify snapshot output even if the build passes clean.

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

Add entries as they occur. Patterns emerge over time; premature generalization
does not.
