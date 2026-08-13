# Shared helpers for the bats e2e suite. POSIX sh.
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "${BATS_TEST_DIRNAME:-${BATS_SUITE_DIRNAME:-$(dirname -- "$0")}}/../.." && pwd)}"
IMAGE="${IMAGE:-open-terminal-e2e}"
CONTEXT="$PROJECT_ROOT/node_modules/.e2e-context"
export PROJECT_ROOT IMAGE CONTEXT

# --init is mandatory. xvfb-run signals readiness to itself with SIGUSR1, and
# the kernel discards signals sent to PID 1 unless that process installed a
# handler, so without a real init the wrapper waits forever.
xvfb() {
  docker run --init --rm "$IMAGE" \
    xvfb-run -a --server-args="-screen 0 1024x768x24" "$@"
}
