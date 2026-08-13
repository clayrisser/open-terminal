import type { Terminal, TerminalDefinition, Terminals } from "./types.js";

export const commandTemplate = "([{<COMMAND>}])";

/**
 * Every entry keeps the placeholder in an argv element of its own wherever the
 * terminal allows it, so the command is handed over verbatim and no quoting is
 * required. The two exceptions are terminator, whose `-e` takes one string it
 * splits itself, and the macOS entries, whose command sits inside an
 * AppleScript string literal.
 */
export const defaultTerminals: Terminals = {
  darwin: [
    {
      args: [
        "osascript",
        "-e",
        `tell app "iTerm" to create window with default profile command "${commandTemplate}"`,
      ],
      escape: "applescript",
      // osascript always exists, so availability has to key off the app bundle.
      requires: ["/Applications/iTerm.app", "~/Applications/iTerm.app"],
    },
    {
      args: ["osascript", "-e", `tell app "Terminal" to do script "${commandTemplate}"`],
      escape: "applescript",
    },
  ],
  linux: [
    { args: ["gnome-terminal", "--", "sh", "-c", commandTemplate] },
    { args: ["konsole", "-e", "sh", "-c", commandTemplate] },
    { args: ["ghostty", "-e", "sh", "-c", commandTemplate] },
    { args: ["kitty", "sh", "-c", commandTemplate] },
    { args: ["wezterm", "start", "--", "sh", "-c", commandTemplate] },
    { args: ["alacritty", "-e", "sh", "-c", commandTemplate] },
    { args: ["foot", "sh", "-c", commandTemplate] },
    // terminator's -e takes a single string which it splits with shlex, so the
    // placeholder cannot be given its own argv element here.
    { args: ["terminator", "-u", "-e", commandTemplate] },
    // Last resort: rarely anyone's preferred terminal, but it is the one that
    // is almost always installed.
    { args: ["xterm", "-e", "sh", "-c", commandTemplate] },
  ],
  win32: [
    { args: ["wt.exe", "cmd.exe", "/c", commandTemplate] },
    // `start` is what actually detaches a new console window; cmd.exe is only
    // the launcher, so availability has to key off the real terminal.
    {
      args: [
        "cmd.exe",
        "/c",
        "start",
        "",
        "powershell.exe",
        "-NoExit",
        "-Command",
        commandTemplate,
      ],
      requires: "powershell.exe",
    },
    { args: ["cmd.exe", "/c", "start", "", "cmd.exe", "/k", commandTemplate] },
  ],
};

export function normalizeTerminal(terminal: Terminal): Required<TerminalDefinition> {
  const definition: TerminalDefinition = Array.isArray(terminal) ? { args: terminal } : terminal;
  const requires = definition.requires ?? definition.args[0] ?? "";
  return {
    args: definition.args,
    escape: definition.escape ?? "none",
    requires: Array.isArray(requires) ? requires : [requires],
  };
}

/** The executable a terminal entry is identified by, used for logs and sorting. */
export function terminalName(terminal: Terminal): string {
  return normalizeTerminal(terminal).args[0] ?? "";
}

function escapeApplescript(command: string): string {
  return command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Substitute the command into a terminal's argv, escaping as the entry requires. */
export function buildTerminalArgv(
  terminal: Terminal,
  command: string,
  template: string = commandTemplate,
): string[] {
  const { args, escape } = normalizeTerminal(terminal);
  const value = escape === "applescript" ? escapeApplescript(command) : command;
  return args.map((arg: string) => arg.split(template).join(value));
}
