#!/bin/sh
set -e

. "$(dirname -- "$0")/helper.sh"

[ -n "$KEEP_STACK" ] && exit 0

rm -rf "$CONTEXT"
docker image rm --force "$IMAGE" >/dev/null 2>&1 || true
