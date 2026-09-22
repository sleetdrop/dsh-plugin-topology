#!/usr/bin/env bash
#
# Publish @sleetdrop/dsh-plugin-topology to the public npm registry.
# Run from anywhere — the script resolves the repository root from its own
# location, so it has no hard-coded machine paths.
#
# Steps: registry guard → login guard (interactive OTP) → publish → verify.
#
set -euo pipefail

REGISTRY="https://registry.npmjs.org/"
PACKAGE="@sleetdrop/dsh-plugin-topology"

# Repository root is this script's parent directory (../).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. Registry guard — publishing must hit the public registry, never a
#    read-only mirror (e.g. npmmirror), which would fail with a 404.
ACTUAL_REGISTRY="$(pnpm config get registry 2>/dev/null || true)"
if [ "${ACTUAL_REGISTRY%/}" != "${REGISTRY%/}" ]; then
  echo "error: pnpm registry is '$ACTUAL_REGISTRY', expected '$REGISTRY'" >&2
  echo "       fix with: pnpm config set registry $REGISTRY" >&2
  exit 1
fi

# 2. Login guard — confirm an authenticated identity, or start an interactive
#    npm login (browser OAuth / OTP). Publishing still requires a human for
#    the OTP step, which is intentional.
if ! npm whoami --registry "$REGISTRY" >/dev/null 2>&1; then
  echo "Not logged in — starting npm login..." >&2
  npm login --registry "$REGISTRY"
fi

WHOAMI="$(npm whoami --registry "$REGISTRY")"
VERSION="$(node -e "console.log(require('./package.json').version)")"

echo "Publishing $PACKAGE@$VERSION as $WHOAMI ..."
pnpm publish --access public --registry "$REGISTRY"

# 3. Verify the registry reports the new version on latest.
echo "Verifying $PACKAGE dist-tags ..."
sleep 2
curl -s "${REGISTRY}@sleetdrop%2fdsh-plugin-topology" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('dist-tags:',JSON.stringify(j['dist-tags']));console.log('versions:',Object.keys(j.versions||{}).join(', '))})"
