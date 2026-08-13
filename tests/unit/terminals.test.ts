import { describe, expect, it } from "vitest";
import {
  buildTerminalArgv,
  commandTemplate,
  defaultTerminals,
  normalizeTerminal,
  terminalName,
} from "../../src/terminals.js";

const command = "node /pkg/shb64.js Y2Q= open-terminal:uid:abc";

/**
 * The exact argv each supported terminal must be invoked with, in the order
 * the table declares them. Anything that changes these is a behaviour change
 * for that terminal, so they are spelled out rather than derived, and the
 * ordering is asserted because it decides which terminal wins.
 */
const expectedArgv: Record<string, Array<[string, string[]]>> = {
  darwin: [
    [
      "iTerm2",
      [
        "osascript",
        "-e",
        `tell app "iTerm" to create window with default profile command "${command}"`,
      ],
    ],
    ["Terminal.app", ["osascript", "-e", `tell app "Terminal" to do script "${command}"`]],
  ],
  linux: [
    ["gnome-terminal", ["gnome-terminal", "--", "sh", "-c", command]],
    ["konsole", ["konsole", "-e", "sh", "-c", command]],
    ["ghostty", ["ghostty", "-e", "sh", "-c", command]],
    ["kitty", ["kitty", "sh", "-c", command]],
    ["wezterm", ["wezterm", "start", "--", "sh", "-c", command]],
    ["alacritty", ["alacritty", "-e", "sh", "-c", command]],
    ["foot", ["foot", "sh", "-c", command]],
    ["terminator", ["terminator", "-u", "-e", command]],
    ["xterm", ["xterm", "-e", "sh", "-c", command]],
  ],
  win32: [
    ["windows terminal", ["wt.exe", "cmd.exe", "/c", command]],
    [
      "powershell",
      ["cmd.exe", "/c", "start", "", "powershell.exe", "-NoExit", "-Command", command],
    ],
    ["cmd", ["cmd.exe", "/c", "start", "", "cmd.exe", "/k", command]],
  ],
};

describe("default terminal table", () => {
  it("covers darwin, linux and win32", () => {
    expect(Object.keys(defaultTerminals).toSorted()).toEqual(["darwin", "linux", "win32"]);
  });

  it("adds the 2020s terminal emulators on linux", () => {
    const names = defaultTerminals.linux.map(terminalName);
    for (const name of ["alacritty", "kitty", "wezterm", "foot", "ghostty"]) {
      expect(names).toContain(name);
    }
  });

  it("keeps every terminal the 0.1 releases supported", () => {
    const names = defaultTerminals.linux.map(terminalName);
    for (const name of ["gnome-terminal", "xterm", "konsole", "terminator"]) {
      expect(names).toContain(name);
    }
  });

  it("orders xterm last, since it is a fallback rather than a preference", () => {
    const names = defaultTerminals.linux.map(terminalName);
    expect(names[names.length - 1]).toBe("xterm");
  });
});

describe("buildTerminalArgv", () => {
  for (const [platform, terminals] of Object.entries(expectedArgv)) {
    describe(platform, () => {
      it("declares exactly the expected terminals, in order", () => {
        expect(defaultTerminals[platform]).toHaveLength(terminals.length);
      });

      terminals.forEach(([name, expected]: [string, string[]], index: number) => {
        it(`builds the argv for ${name}`, () => {
          expect(buildTerminalArgv(defaultTerminals[platform][index], command)).toEqual(expected);
        });
      });
    });
  }

  it("escapes quotes and backslashes inside the AppleScript literal", () => {
    const iterm = defaultTerminals.darwin[1];
    const argv = buildTerminalArgv(iterm, String.raw`say "hi" \ bye`);
    expect(argv[2]).toBe(String.raw`tell app "Terminal" to do script "say \"hi\" \\ bye"`);
  });

  it("leaves the command untouched when it occupies its own argv element", () => {
    const argv = buildTerminalArgv(defaultTerminals.linux[0], String.raw`say "hi" \ bye`);
    expect(argv[argv.length - 1]).toBe(String.raw`say "hi" \ bye`);
  });

  it("accepts the bare string[] form used before 0.2", () => {
    expect(buildTerminalArgv(["myterm", "-e", commandTemplate], "echo hi")).toEqual([
      "myterm",
      "-e",
      "echo hi",
    ]);
  });
});

describe("normalizeTerminal", () => {
  it("defaults the requirement to the executable", () => {
    expect(normalizeTerminal(["kitty", "sh"]).requires).toEqual(["kitty"]);
  });

  it("keeps an explicit requirement, for launchers that always exist", () => {
    const powershell = defaultTerminals.win32[1];
    expect(normalizeTerminal(powershell).requires).toEqual(["powershell.exe"]);
    expect(terminalName(powershell)).toBe("cmd.exe");
  });

  it("points the iTerm entry at the app bundle rather than at osascript", () => {
    expect(normalizeTerminal(defaultTerminals.darwin[0]).requires).toEqual([
      "/Applications/iTerm.app",
      "~/Applications/iTerm.app",
    ]);
  });

  it("defaults escaping to none", () => {
    expect(normalizeTerminal(["xterm"]).escape).toBe("none");
  });
});
