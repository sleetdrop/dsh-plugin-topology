# Releasing

This plugin adapts to DeepSeek Harness **rc** lines only (there is no beta
channel; `alpha` iterates too fast to follow). Every release is tagged against
the specific DSH rc it was validated on — see the "Release tagging vs. the DSH
cadence" table in [`README.md`](../README.md#compatibility).

Because publishing requires an interactive OTP (2FA), the final `pnpm publish`
step is run **by a human, by hand**. Everything before it is safe to script.

## One release, end to end

Pick the target DSH rc (e.g. `0.1.2-rc.1`) and a plugin version on that line
(e.g. `0.2.0-rc.1`). Then:

```sh
# 1. Bump the versions in package.json to the target dsh rc.
#    - peerDependencies / devDependencies: every @deepseek-ai/* client package
#      pinned to the rc you adapt to (cordis to ^4.0.x).
#    - "version": the new plugin prerelease.

# 2. Build + test + typecheck gate (prepublishOnly runs these too, but run
#    them now so you publish with confidence).
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm build
pnpm test

# 3. Verify the client bundle's external requires are only platform-module
#    rows (react, @deepseek-ai/cordis, dsh-client-store, dsh-client-ui-slots).
grep -oE 'require\("[^"]+"\)' lib/client.js | sort -u

# 4. Commit the source changes, then tag (annotated, matching the version).
git add -A
git commit -m "feat: adapt plugin to DeepSeek Harness <rc>"
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
cd /Users/jiangyuan/Documents/side-work/dsh-plugin-topology
pnpm publish --tag next --access public
```

`--tag next` attaches the prerelease to the npm `next` dist-tag so `latest`
keeps pointing at the last stable line; rc consumers opt in explicitly. npm
will prompt for your OTP — enter it in the terminal (or approve the push on
your device).

## Verification after publishing

```sh
curl -s "https://registry.npmjs.org/@sleetdrop%2fdsh-plugin-topology" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('dist-tags:',j['dist-tags']);console.log('versions:',Object.keys(j.versions).join(', '))})"
```

Expect `dist-tags.next` to be the new prerelease and `latest` unchanged.

## Tag policy recap

| Plugin version (Git + npm) | Targets DSH harness | model |
| --- | --- | --- |
| `v0.1.0` | `0.1.1-rc.2` | old `dsh-client-runtime` browser model (frozen) |
| `v0.2.0-rc.1` | `0.1.2-rc.1` | Cordis-Context browser model |