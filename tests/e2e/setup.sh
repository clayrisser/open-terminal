#!/bin/sh
set -e

. "$(dirname -- "$0")/helper.sh"

rm -rf "$CONTEXT"
mkdir -p "$CONTEXT"

# Pack the tarball that would be published, so the container installs exactly
# what a consumer would get. The destination is given rather than parsed out of
# pnpm's stdout, which is relative to the caller's directory.
(cd "$PROJECT_ROOT" && pnpm pack --pack-destination "$CONTEXT" >/dev/null)
mv "$CONTEXT"/*.tgz "$CONTEXT/open-terminal.tgz"

cp "$PROJECT_ROOT/docker/Dockerfile" "$CONTEXT/Dockerfile"
cp -R "$PROJECT_ROOT/tests/e2e/fixtures" "$CONTEXT/fixtures"

docker build --tag "$IMAGE" "$CONTEXT"
