# open-terminal

[![GitHub stars](https://img.shields.io/github/stars/clayrisser/open-terminal.svg?style=social&label=Stars)](https://github.com/clayrisser/open-terminal)

> cross platform open terminal and run command

Please ★ this repo if you found it useful ★ ★ ★

Opens an actual terminal emulator window and runs a command inside it. This is
different from spawning a process (`cross-spawn`, `nano-spawn`, `node-pty`) and
different from opening a file or URL (`open`) — the point is a visible window
the user can watch or type into, which is what dev tooling wants when it needs
to surface a live log or an interactive session.

**No runtime dependencies.**

## Installation

```sh
pnpm add open-terminal
```

Or globally, for the CLI:

```sh
pnpm add -g open-terminal
```

## Usage

### from the terminal

```sh
open-terminal "echo 'Hello, world!' && tail -f /dev/null"
```

### from the nodejs api

```js
import openTerminal from 'open-terminal';

await openTerminal("echo 'Hello, world!' && tail -f /dev/null");
```

`require('open-terminal').default` works too; both entry points are shipped.

The promise resolves once the command running inside the terminal has finished.

## Supported terminals

The first terminal found is used. On Linux the desktop's own default is tried
first when `x-terminal-emulator` is configured, otherwise the list is walked in
order.

| platform | terminals, in order |
| --- | --- |
| linux | gnome-terminal, konsole, ghostty, kitty, wezterm, alacritty, foot, terminator, xterm |
| darwin | iTerm2 (if installed), Terminal.app |
| win32 | Windows Terminal (`wt.exe`), PowerShell, `cmd.exe` |

If none is installed the command still runs, headless, and a warning is
printed.

### Platform support, honestly

- **Linux** is covered by an automated test that launches a real `xterm` under
  Xvfb in a container and asserts the command ran.
- **macOS** is exercised by the unit suite, but opening a window needs a
  desktop session, so the AppleScript path is not covered by an automated test.
- **Windows** support is new in 0.2 and is **implemented but unverified on a
  real Windows host**. The argv each entry produces is unit tested, and the
  quoting rules (`cd /d`, doubled `"`) are unit tested, but nobody has watched
  a window open. Treat it as best effort and please report what happens.

## Options

```js
await openTerminal('htop', {
  cwd: process.cwd(),
  exitProcess: false,
  pollInterval: 1000,
  spawnTimeout: 10000
});
```

| option | default | meaning |
| --- | --- | --- |
| `cwd` | `process.cwd()` | Directory the command runs in. |
| `exitProcess` | `false` | Exit the host process when the terminal closes. The CLI sets this; the library API does not. |
| `pollInterval` | `1000` | How often the process list is checked while waiting. |
| `spawnTimeout` | `10000` | How long to wait for the terminal to appear before giving up on tracking it. |
| `commandTemplate` | `([{<COMMAND>}])` | Placeholder replaced by the command in a terminal's argv. |
| `terminals` | see above | Per-platform terminal table. |

### Adding your own terminal

Overriding a platform replaces its list, so include whatever else you want to
keep:

```js
await openTerminal('htop', {
  terminals: {
    linux: [
      ['urxvt', '-e', 'sh', '-c', '([{<COMMAND>}])'],
      ['xterm', '-e', 'sh', '-c', '([{<COMMAND>}])']
    ]
  }
});
```

An entry is either a bare argv array, as above, or an object when it needs more
than that:

```js
{
  args: ['cmd.exe', '/c', 'start', '', 'powershell.exe', '-Command', '([{<COMMAND>}])'],
  // What must exist for this entry to be usable. Defaults to args[0], which is
  // wrong for launchers like cmd.exe and osascript that exist regardless of
  // the terminal they open. A value containing a separator is treated as a
  // path, so macOS app bundles work.
  requires: 'powershell.exe',
  // 'applescript' escapes the command for an AppleScript string literal.
  // Defaults to 'none', which is correct whenever the placeholder has an argv
  // element to itself.
  escape: 'none'
}
```

## How it works

1. The command is base64 encoded, so neither the terminal's argument parsing
   nor the shell inside it can mangle the quoting.
2. A `shb64` shim decodes and runs it. It is invoked through `process.execPath`
   rather than a bare `node`, because a terminal launched from a desktop
   session often has a different PATH.
3. A uuid is embedded in the shim's argv. Polling the process list for it is
   the only way to follow terminals like gnome-terminal, whose launcher exits
   immediately and leaves the window owned by a pre-existing daemon.
4. `SIGINT` and `SIGTERM` are forwarded to whatever the uuid points at.

## Dependencies

- [NodeJS](https://nodejs.org) >= 18

## Development

```sh
make prepare      # one-time: toolchain and dependencies
make build        # compile lib/ (cjs) and es/ (esm)
make test         # unit tests with coverage
make test/e2e     # xterm under Xvfb, in docker
make format lint
```

## Support

Submit an [issue](https://github.com/clayrisser/open-terminal/issues/new)

## Contributing

Review the [guidelines for contributing](https://github.com/clayrisser/open-terminal/blob/master/CONTRIBUTING.md)

## License

[MIT License](https://github.com/clayrisser/open-terminal/blob/master/LICENSE)

[Clay Risser](https://clayrisser.com) © 2021

## Changelog

Review the [changelog](https://github.com/clayrisser/open-terminal/blob/master/CHANGELOG.md)

## Credits

- [Clay Risser](https://clayrisser.com) - Author

## Support on Liberapay

A ridiculous amount of coffee ☕ ☕ ☕ was consumed in the process of building this project.

[Add some fuel](https://liberapay.com/clayrisser/donate) if you'd like to keep me going!

[![Liberapay receiving](https://img.shields.io/liberapay/receives/clayrisser.svg?style=flat-square)](https://liberapay.com/clayrisser/donate)
[![Liberapay patrons](https://img.shields.io/liberapay/patrons/clayrisser.svg?style=flat-square)](https://liberapay.com/clayrisser/donate)
