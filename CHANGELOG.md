# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [0.2.0]

### Fixed

- The package is installable again. It depended on `node-sigar`, a native
  binding to Apache SIGAR, a project Apache retired in 2017 and which no longer
  builds on supported Node releases. It was used for one thing, matching a
  process by its argv, which is now done by reading `/proc` on Linux, `ps` on
  macOS and `Get-CimInstance` on Windows.
- `SIGINT` and `SIGTERM` are actually forwarded. The handlers were installed
  after awaiting the terminal, so by the time they existed there was nothing
  left to forward to.
- The wait loop no longer passes its timeout in as its poll interval, which
  made the timeout meaningless.
- Terminal ordering uses a real comparison. The previous sort callback took a
  single argument, so it was not a valid comparator.
- The library API no longer calls `process.exit` on its caller. The CLI opts
  into that with the new `exitProcess` option.
- `cwd` is honoured on every platform, not just macOS.
- The shim is invoked through `process.execPath` instead of a bare `node`, so
  it works from terminals whose PATH does not include the running Node.

### Added

- Windows support: Windows Terminal (`wt.exe`), with PowerShell and `cmd.exe`
  fallbacks. Implemented and unit tested, but not yet verified on a real
  Windows host.
- Linux terminals: alacritty, kitty, wezterm, foot and ghostty.
- macOS: iTerm2, used when the app is installed.
- `requires` on a terminal entry, so entries launched through `osascript` or
  `cmd.exe /c start` can declare what actually has to be installed.
- `escape` on a terminal entry, for commands embedded in an AppleScript string.
- An e2e suite that launches a real `xterm` under Xvfb in a container and
  asserts the command ran.

### Changed

- No runtime dependencies. `execa`, `fs-extra`, `ora`, `uuid`, `which`,
  `core-js` and `@babel/runtime` were replaced with the Node standard library,
  and the unused `node-pstree` dependency was dropped.
- Built with `tsc` instead of babel and webpack; `lib/` stays CommonJS and
  `es/` is now genuinely ESM, each carrying type declarations in its own module
  format so an ESM consumer no longer resolves CommonJS types.
- `xterm` moved to the end of the Linux list. It is usually installed as
  somebody else's dependency rather than chosen, so it makes a better fallback
  than a preference.
- Tooling moved to pnpm, oxfmt, oxlint and vitest, with a Makefile following
  the house conventions.
- Minimum Node is 18.

## [0.0.1] - 2021-03-03

### Added

- Initial release
