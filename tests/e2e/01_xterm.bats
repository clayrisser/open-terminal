#!/usr/bin/env bats
load helper.sh

@test "installs from the packed tarball without a build toolchain" {
  run docker run --init --rm "$IMAGE" node -e "console.log(typeof require('open-terminal').default)"
  [ "$status" -eq 0 ]
  [ "$output" = "function" ]
}

@test "ships no runtime dependencies" {
  run docker run --init --rm "$IMAGE" \
    node -e "console.log(JSON.stringify(require('open-terminal/package.json').dependencies||{}))"
  [ "$status" -eq 0 ]
  [ "$output" = "{}" ]
}

@test "an X server and a real terminal emulator are present" {
  run xvfb sh -c 'xdpyinfo >/dev/null && command -v xterm'
  [ "$status" -eq 0 ]
}

@test "opens a real xterm under Xvfb and runs the command in it" {
  run xvfb node fixtures/run.cjs
  [ "$status" -eq 0 ]
  echo "$output"
  # The command genuinely executed inside the terminal.
  [ "$(echo "$output" | grep '^PROOF ')" = "PROOF TERMINAL_RAN" ]
  # And it went through a terminal window, not the headless fallback.
  [ "$(echo "$output" | grep '^BACKGROUND ')" = "BACKGROUND false" ]
  [ "$(echo "$output" | grep '^TERMINAL ')" = "TERMINAL xterm" ]
}

@test "the esm entry point works against the same install" {
  run xvfb node fixtures/run.mjs
  [ "$status" -eq 0 ]
  echo "$output"
  [ "$(echo "$output" | grep '^PROOF ')" = "PROOF TERMINAL_RAN" ]
  [ "$(echo "$output" | grep '^TERMINAL ')" = "TERMINAL xterm" ]
}

@test "quoting survives the terminal and the shell" {
  run xvfb node fixtures/quoting.cjs
  [ "$status" -eq 0 ]
  echo "$output"
  [ "$(echo "$output" | grep '^PROOF ')" = 'PROOF he said "it'"'"'s $HOME" & \ 100% (done); echo trailing' ]
}

@test "the bundled cli opens a terminal too" {
  run xvfb sh -c 'node_modules/.bin/open-terminal "printf CLI_RAN > /tmp/cli.txt" && cat /tmp/cli.txt'
  [ "$status" -eq 0 ]
  echo "$output"
  [ "$(echo "$output" | tail -n 1)" = "CLI_RAN" ]
}

@test "falls back to running headless when no terminal is installed" {
  run docker run --init --rm --env PATH=/usr/local/bin:/usr/bin:/bin "$IMAGE" \
    sh -c 'rm -f /usr/bin/xterm /usr/bin/x-terminal-emulator && node fixtures/run.cjs 2>&1'
  [ "$status" -eq 0 ]
  echo "$output"
  [ "$(echo "$output" | grep '^PROOF ')" = "PROOF TERMINAL_RAN" ]
  [ "$(echo "$output" | grep '^BACKGROUND ')" = "BACKGROUND true" ]
}
