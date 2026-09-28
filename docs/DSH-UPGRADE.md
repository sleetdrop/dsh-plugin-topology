# DSH Version Upgrade Workflow

DSH evolves rapidly and frequently introduces breaking changes. This document
describes the upgrade workflow distilled from past adaptations. It is
intentionally **principle-based rather than step-by-step**, because the specific
breakages are unpredictable — what broke last time will likely not be what
breaks next time.

## When to Upgrade

- Your local `dsh --version` reports a newer rc than your plugin's target.
- A community report or CI failure indicates incompatibility.
- You want to validate against the latest stable rc before a plugin release.

Skip alpha releases unless you have a specific reason; this plugin tracks rc
releases only.

## The Workflow

### 1. Discover the Target Version

Check your running DSH version (`dsh --version`) and query the registry for the
latest rc of each peer dependency. All `@deepseek-ai/*` client packages share
the same version number within a release line, so checking one suffices:

```sh
pnpm view @deepseek-ai/dsh-tools dist-tags.next
```

Also check `@deepseek-ai/cordis` separately — it has its own semver track.

### 2. Bump Dependencies

Update `package.json`:

- `"version"`: bump the plugin's own semver (minor for API-compatible refresh,
  major for breaking changes on our side).
- `peerDependencies`: widen the range to include the new target (e.g.
  `^0.1.7-rc.2`).
- `devDependencies`: pin to the exact new target version.
- `@deepseek-ai/cordis`: update both peer range and dev pin if a new patch
  exists.

Run `pnpm install` to resolve the lockfile. **Expect the `prepare` script to
fail** — this is normal and expected. The build failure *is* the signal that
tells you what broke.

### 3. Diagnose Breakages from Build Errors

Read the TypeScript errors carefully. They are the primary source of truth for
what changed. Common categories observed across multiple upgrades:

- **Type shape changes**: fields renamed, removed, or restructured in protocol
  types (e.g. `TypertCodec.schema` → `TypertCodec.create`). Fix by reading the
  new type definition in `node_modules/@deepseek-ai/<pkg>/lib/types/` and
  adapting.
- **Removed exports**: a function or type you import no longer exists. Check if
  it was renamed, moved to a different package, or replaced by a new API.
- **New required fields**: an interface gained mandatory properties. Add them
  with sensible defaults.
- **Signature changes**: function parameters or return types shifted. Adapt
  call sites.

If the build succeeds but tests fail, the breakage is behavioral rather than
structural — read the test failures and trace back to the changed runtime
contract.

### 4. Verify

```sh
pnpm run typecheck   # must pass clean
pnpm run build       # must produce lib/ and lib/client.js
pnpm test            # all tests must pass
```

Optionally smoke-test with a live profile:

```sh
dsh --profile pt-test --no-open --port 0
# open the printed token URL, verify the panel loads and functions
```

### 5. Update Documentation

- `README.md`: update the "Current release targets…" paragraph and add a row
  to the compatibility table. Note any code changes required (not just
  dependency bumps).
- `docs/RELEASING.md`: add a row to the tag policy table.

### 6. Commit, Tag, Push, Publish

Follow the standard release flow in `docs/RELEASING.md`. The commit message
should note what broke and how it was fixed, not just the version numbers:

```
chore: release X.Y.Z (targets dsh A.B.C-rc.N)

- <specific API migration or fix>
- cordis peer bumped to ^X.Y.Z
```

## Principles

1. **Let the compiler guide you.** Do not preemptively guess what changed. Bump
   first, then read the errors. TypeScript is the most reliable changelog DSH
   provides.

2. **Read the new types directly.** When a type changes, open the `.d.ts` file
   in `node_modules` and read the full definition. Do not rely on memory of
   the old shape or on external documentation that may lag.

3. **Zod schemas are usually safe.** Zod's `parse()` method satisfies the
   `TypertSchema` interface. When codec types change, the zod schema itself
   rarely needs modification — only the wrapper around it.

4. **Cordis internals are the highest risk.** The `snapshot()` method reads
   `root.registry`, `root.reflect.store`, and fiber fields that are not part
   of Cordis's stable API. These are the most likely to break silently (no
   type error, just wrong data). Always verify snapshot output after a cordis
   bump, even if the build passes.

5. **Client bundle externals should stay minimal.** After building, verify:
   ```sh
   grep -oE 'require\("[^"]+"\)' lib/client.js | sort -u
   ```
   Only platform-module rows (`react`, `@deepseek-ai/dsh-client-store`, etc.)
   should appear. Any new external require means the bundler configuration or
   imports need adjustment.

6. **Document what broke.** Future-you (and other maintainers) benefit from
   knowing *which* API changed and *how* it was adapted. The compatibility
   table's "Notes" column exists for this purpose.

## Historical Breakages

| From → To | What Broke | Fix |
|-----------|-----------|-----|
| 0.1.2-rc.1 → 0.1.5-rc.1 | Nothing | Pure dependency refresh |
| 0.1.5-rc.3 → 0.1.7-rc.2 | `TypertCodec.schema` removed; replaced by `create: () => TypertSchema` factory | Wrapped zod schemas in `create: () => schema`. **Two files** carry codecs: `src/client/remote-client.ts` (client-side) and `src/typert.ts` (host-side typert manifest). Both must be updated — the host manifest is easy to miss since it has no type-checking against `TypertCodec` at compile time. |

Add new entries as they occur. This table becomes the institutional memory of
how DSH tends to break.
