import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import openTerminal, {
  createSafeCommand,
  isTerminalAvailable,
  mergeDefaults,
  sortTerminals,
} from "../../src/index.js";
import { commandTemplate, terminalName } from "../../src/terminals.js";
import type { Terminal } from "../../src/types.js";
import { createFakeTerminal, withEmptyPath, withPath } from "./helpers.js";

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup();
  vi.restoreAllMocks();
});

// Poll fast so the suite is not dominated by the default one second interval.
const fastPolling = { pollInterval: 100, spawnTimeout: 15000 };

// The timing assertions below allow 5000ms, which is exactly vitest's default
// test timeout, so a slow machine hit the harness limit first and reported an
// opaque timeout instead of the assertion. The harness needs headroom above the
// budget for the assertion to be what reports the failure.
const timingBudget = 5000;
const timingHeadroom = { timeout: timingBudget * 3 };

async function scratchFile(name: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "open-terminal-out-"));
  cleanups.push(() => fs.rm(directory, { recursive: true, force: true }));
  return path.join(directory, name);
}

describe("openTerminal end to end through a fake terminal", () => {
  it("launches the terminal and runs the command inside it", async () => {
    const fake = await createFakeTerminal("faketerm", "run");
    cleanups.push(fake.cleanup, withPath(fake.bin));
    const proof = await scratchFile("proof");

    const result = await openTerminal(`printf ran > ${proof} && sleep 1`, {
      ...fastPolling,
      terminals: { [process.platform]: [["faketerm", "-e", "sh", "-c", commandTemplate]] },
    });

    expect(result.terminal).toBe("faketerm");
    expect(result.background).toBe(false);
    // The terminal really executed the command.
    expect(await fs.readFile(proof, "utf8")).toBe("ran");
    // And it was handed exactly the argv we expect.
    const argv = await fake.argv();
    expect(argv.slice(0, 3)).toEqual(["-e", "sh", "-c"]);
    expect(argv[3]).toContain("open-terminal:uid:");
    expect(argv[3]).toContain("shb64.js");
  });

  it("waits for the command to finish before returning", async () => {
    const fake = await createFakeTerminal("faketerm", "run");
    cleanups.push(fake.cleanup, withPath(fake.bin));
    const proof = await scratchFile("proof");

    const started = Date.now();
    await openTerminal(`sleep 1 && printf late > ${proof}`, {
      ...fastPolling,
      terminals: { [process.platform]: [["faketerm", "-e", "sh", "-c", commandTemplate]] },
    });

    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(await fs.readFile(proof, "utf8")).toBe("late");
  });

  it("skips terminals that are not installed and uses the first that is", async () => {
    const fake = await createFakeTerminal("secondterm", "run");
    cleanups.push(fake.cleanup, withPath(fake.bin));
    const proof = await scratchFile("proof");

    const result = await openTerminal(`printf ran > ${proof}`, {
      ...fastPolling,
      spawnTimeout: 2000,
      terminals: {
        [process.platform]: [
          ["definitely-not-installed", "-e", "sh", "-c", commandTemplate],
          ["secondterm", "-e", "sh", "-c", commandTemplate],
        ],
      },
    });

    expect(result.terminal).toBe("secondterm");
    expect(await fs.readFile(proof, "utf8")).toBe("ran");
  });

  it("moves on when a terminal is installed but refuses to start", timingHeadroom, async () => {
    const broken = await createFakeTerminal("brokenterm", "fail");
    const working = await createFakeTerminal("workingterm", "run");
    cleanups.push(broken.cleanup, working.cleanup);
    cleanups.push(withPath(broken.bin), withPath(working.bin));
    const proof = await scratchFile("proof");

    const started = Date.now();
    const result = await openTerminal(`printf recovered > ${proof}`, {
      ...fastPolling,
      terminals: {
        [process.platform]: [
          ["brokenterm", "-e", "sh", "-c", commandTemplate],
          ["workingterm", "-e", "sh", "-c", commandTemplate],
        ],
      },
    });

    expect(result.terminal).toBe("workingterm");
    expect(await fs.readFile(proof, "utf8")).toBe("recovered");
    // The failure has to be noticed from the exit code rather than by waiting
    // out the spawn timeout.
    expect(Date.now() - started).toBeLessThan(timingBudget);
    // The broken terminal really was attempted first.
    expect((await broken.argv())[0]).toBe("-e");
  });

  it("runs the command headless when no terminal is installed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    cleanups.push(withEmptyPath(""));
    const proof = await scratchFile("proof");

    const result = await openTerminal(`printf headless > ${proof}`, {
      ...fastPolling,
      terminals: { [process.platform]: [["definitely-not-installed", "-e", commandTemplate]] },
    });

    expect(result.background).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(await fs.readFile(proof, "utf8")).toBe("headless");
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("definitely-not-installed");
  });

  it(
    "returns promptly for a command that finishes before the first poll",
    timingHeadroom,
    async () => {
      const fake = await createFakeTerminal("faketerm", "run");
      cleanups.push(fake.cleanup, withPath(fake.bin));
      const proof = await scratchFile("proof");

      const started = Date.now();
      await openTerminal(`printf quick > ${proof}`, {
        pollInterval: 100,
        // A long timeout must not become the floor for a short command.
        spawnTimeout: 30000,
        terminals: { [process.platform]: [["faketerm", "-e", "sh", "-c", commandTemplate]] },
      });

      expect(await fs.readFile(proof, "utf8")).toBe("quick");
      expect(Date.now() - started).toBeLessThan(timingBudget);
    },
  );

  it("accepts an argv array as well as a string", async () => {
    const fake = await createFakeTerminal("faketerm", "run");
    cleanups.push(fake.cleanup, withPath(fake.bin));
    const proof = await scratchFile("proof");

    await openTerminal(["printf", "array", ">", proof], {
      ...fastPolling,
      terminals: { [process.platform]: [["faketerm", "-e", "sh", "-c", commandTemplate]] },
    });

    expect(await fs.readFile(proof, "utf8")).toBe("array");
  });

  it("rejects a platform with no terminal list", async () => {
    await expect(
      openTerminal("echo hi", { terminals: { [process.platform]: [] } }),
    ).rejects.toThrow(`operating system ${process.platform} not supported`);
  });
});

describe("isTerminalAvailable", () => {
  it("finds a linux terminal on PATH", async () => {
    const fake = await createFakeTerminal("alacritty");
    cleanups.push(fake.cleanup, withEmptyPath(fake.bin));
    expect(await isTerminalAvailable(["alacritty", "-e", commandTemplate], "linux")).toBe(true);
    expect(await isTerminalAvailable(["kitty", "-e", commandTemplate], "linux")).toBe(false);
  });

  it("checks the declared requirement, not the launcher", async () => {
    const fake = await createFakeTerminal("powershell.exe");
    cleanups.push(fake.cleanup, withEmptyPath(fake.bin));
    // cmd.exe is absent, but the entry is gated on powershell.exe, which is not.
    expect(
      await isTerminalAvailable(
        { args: ["cmd.exe", "/c", "start", "", "powershell.exe"], requires: "powershell.exe" },
        "win32",
      ),
    ).toBe(true);
  });

  it("treats a requirement containing a separator as a path, for macOS bundles", async () => {
    const fake = await createFakeTerminal("irrelevant");
    cleanups.push(fake.cleanup, withEmptyPath(""));
    expect(await isTerminalAvailable({ args: ["osascript"], requires: fake.bin }, "darwin")).toBe(
      true,
    );
    expect(
      await isTerminalAvailable(
        { args: ["osascript"], requires: "/Applications/NotInstalled.app" },
        "darwin",
      ),
    ).toBe(false);
  });

  it("is satisfied when any one of several candidate paths exists", async () => {
    const fake = await createFakeTerminal("irrelevant");
    cleanups.push(fake.cleanup, withEmptyPath(""));
    expect(
      await isTerminalAvailable(
        { args: ["osascript"], requires: ["/Applications/NotInstalled.app", fake.bin] },
        "darwin",
      ),
    ).toBe(true);
  });
});

describe("sortTerminals", () => {
  const terminals: Terminal[] = [["gnome-terminal"], ["konsole"], ["kitty"], ["xterm"]];

  it("moves the desktop default to the front", () => {
    expect(sortTerminals(terminals, "kitty").map(terminalName)).toEqual([
      "kitty",
      "gnome-terminal",
      "konsole",
      "xterm",
    ]);
  });

  it("matches the wrapper names x-terminal-emulator resolves to", () => {
    expect(terminalName(sortTerminals(terminals, "gnome-terminal.wrapper")[0])).toBe(
      "gnome-terminal",
    );
  });

  it("preserves the original order when there is no default", () => {
    expect(sortTerminals(terminals).map(terminalName)).toEqual([
      "gnome-terminal",
      "konsole",
      "kitty",
      "xterm",
    ]);
  });

  it("preserves the original order when the default is not in the list", () => {
    expect(sortTerminals(terminals, "urxvt").map(terminalName)).toEqual([
      "gnome-terminal",
      "konsole",
      "kitty",
      "xterm",
    ]);
  });
});

describe("mergeDefaults", () => {
  it("keeps the built-in table for platforms that were not overridden", () => {
    const merged = mergeDefaults({ terminals: { linux: [["kitty"]] } });
    expect(merged.terminals.linux).toEqual([["kitty"]]);
    expect(merged.terminals.darwin.length).toBeGreaterThan(0);
    expect(merged.terminals.win32.length).toBeGreaterThan(0);
  });

  it("drops duplicate terminals within an override", () => {
    const merged = mergeDefaults({
      terminals: { linux: [["kitty", "-e"], ["kitty", "--other"], ["foot"]] },
    });
    expect(merged.terminals.linux).toEqual([["kitty", "-e"], ["foot"]]);
  });

  it("resolves cwd at call time rather than at import time", () => {
    expect(mergeDefaults().cwd).toBe(process.cwd());
    expect(mergeDefaults({ cwd: "/somewhere" }).cwd).toBe("/somewhere");
  });

  it("leaves the library API in charge of its own process", () => {
    expect(mergeDefaults().exitProcess).toBe(false);
  });
});

describe("createSafeCommand platform handling", () => {
  it("quotes for the target platform, not the host", () => {
    expect(createSafeCommand("u", "echo hi", "/tmp", "linux").line).toContain(`'/tmp/`.slice(0, 1));
    expect(createSafeCommand("u", "echo hi", "C:\\x", "win32").line).toContain('"');
  });
});
