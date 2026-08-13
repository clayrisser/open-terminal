export interface HashMap<T = any> {
  [key: string]: T;
}

/**
 * How the command is escaped when it is substituted into a terminal's argv.
 *
 * `none` is correct whenever the placeholder occupies an argv element of its
 * own, because nothing re-parses it. `applescript` is needed when the
 * placeholder sits inside an AppleScript string literal.
 */
export type TerminalEscape = "none" | "applescript";

export interface TerminalDefinition {
  args: string[];
  escape?: TerminalEscape;
  /**
   * Command names resolved against PATH, or absolute paths (`~` allowed).
   * The terminal is usable when any one of them resolves. Defaults to
   * `args[0]`, which is wrong only for launchers such as `osascript` and
   * `cmd.exe /c start` that exist regardless of the app they open.
   */
  requires?: string | string[];
}

/**
 * A terminal is either a bare argv array or an argv array plus escaping and
 * availability rules. The bare-array form is what releases before 0.2 accepted
 * and still behaves identically.
 */
export type Terminal = string[] | TerminalDefinition;

export type Terminals = HashMap<Terminal[]>;

export interface Options {
  commandTemplate: string;
  cwd: string;
  /**
   * Terminate the host process once the terminal closes. The CLI sets this;
   * the library API leaves it off so that importing this package cannot kill
   * its caller.
   */
  exitProcess: boolean;
  /** How long to wait for the spawned terminal to appear in the process list. */
  spawnTimeout: number;
  /** How often to poll the process list while waiting on the terminal. */
  pollInterval: number;
  terminals: Terminals;
}
