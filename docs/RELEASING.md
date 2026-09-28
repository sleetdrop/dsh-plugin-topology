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

## One release, end to end

Pick a new plugin version using plain semver (e.g. `0.2.0`), and the DSH rc you
adapt to (e.g. `0.1.2-rc.1`). The two are independent.

```sh
# 1. Bump package.json:
#    - "version": the new plugin semver (independent of DSH).
#    - peerDependencies / devDependencies: every @deepseek-ai/* client package
#      pinned to the DSH rc you adapt to (cordis to ^4.0.x).

# 2. Build + test + typecheck gate (prepublishOnly runs these too, but run
#    them now so you publish with confidence).
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm build
pnpm test

# 3. Verify the client bundle's external requires are only platform-module
#    rows (react, @deepseek-ai/cordis, dsh-client-store, dsh-client-ui-slots).
grep -oE 'require\("[^"]+"\)' lib/client.js | sort -u

# 4. Update the Compatibility table in README.md, then commit + tag.
git add -A
git commit -m "chore: release <version> (targets dsh <rc>)"
git tag -a v<version> -m "dsh-plugin-topology v<version> — targets dsh <rc>"
git push origin main
git push origin v<version>

# 5. Smoke-test headlessly (node half), then verify the browser panel in a web
#    profile before publishing. The pt-test profile links this checkout via a
#    symlink, so rebuilds show up immediately:
dsh --profile pt-test --no-open --port 0    # open the printed token URL
```

### 6. Publish — RUN BY HAND (OTP)

```sh
./scripts/publish.sh
```

The script guards the registry (must be `registry.npmjs.org`, never a read-only
mirror), checks login (starts an interactive `npm login` if needed), runs
`pnpm publish --access public --registry https://registry.npmjs.org/`, then
verifies the resulting dist-tags. npm prompts for your OTP during login and/or
publish — enter it in the terminal (or approve the push on your device).

## Verification after publishing

```sh
curl -s "https://registry.npmjs.org/@sleetdrop%2fdsh-plugin-topology" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('dist-tags:',j['dist-tags']);console.log('versions:',Object.keys(j.versions).join(', '))})"
```

Expect `dist-tags.latest` to be the new version.

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
