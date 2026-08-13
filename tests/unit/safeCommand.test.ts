import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSafeCommand, quoteArgument, shimPath } from "../../src/index.js";

/** Run a shell command line the way the shim ultimately will. */
function runInShell(line: string): string {
  const result = spawnSync("sh", ["-c", line], { encoding: "utf8" });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout;
}

function decode(safeCommandArgv: string[]): string {
  return Buffer.from(safeCommandArgv[2], "base64").toString();
}

/**
 * Anything a user might reasonably hand to `open-terminal`. Each of these
 * would be mangled by at least one layer if it were interpolated as text
 * instead of base64 encoded.
 */
const tricky: Record<string, string> = {
  plain: "echo hello",
  spaces: 'echo "hello    world"',
  "double quotes": 'echo "she said \\"hi\\""',
  "single quotes": "echo 'it'\\''s fine'",
  "mixed quotes": `echo "outer 'inner' outer"`,
  "shell metacharacters": "echo a && echo b | cat; echo c",
  "redirection and globs": 'echo "*.ts > /dev/null"',
  backslashes: String.raw`echo "back\\slash"`,
  "dollar and backtick literals": "echo 'literal $HOME and `whoami`'",
  subshell: 'echo "$(echo nested)"',
  unicode: 'echo "héllo → wörld ✓"',
  "parentheses and braces": 'echo "(a){b}[c]"',
  "exclamation and hash": 'echo "wow! # not a comment"',
};

describe("createSafeCommand base64 round trip", () => {
  for (const [name, command] of Object.entries(tricky)) {
    it(`survives ${name}`, () => {
      const safe = createSafeCommand("uid-1", command, "/tmp", "linux");
      // The payload decodes back to exactly what we asked to run.
      expect(decode(safe.argv)).toBe(`cd '/tmp' && ${command}`);
      // And running it produces the same output as running it directly.
      expect(runInShell(decode(safe.argv))).toBe(runInShell(command));
    });
  }

  it("produces a base64 payload free of characters any layer could misparse", () => {
    for (const command of Object.values(tricky)) {
      const safe = createSafeCommand("uid-1", command, "/tmp", "linux");
      expect(safe.argv[2]).toMatch(/^[A-Za-z0-9+/=]+$/);
    }
  });

  it("tags the command with a findable uid marker", () => {
    const safe = createSafeCommand("abc-123", "echo hi", "/tmp", "linux");
    expect(safe.argv[3]).toBe("open-terminal:uid:abc-123");
    expect(safe.line).toContain("open-terminal:uid:abc-123");
  });

  it("uses a needle that matches the shim but not the chain carrying it", () => {
    for (const platform of ["linux", "darwin", "win32"] as NodeJS.Platform[]) {
      const safe = createSafeCommand("uid-1", "echo hi", "/tmp", platform);
      // The shim's own argv, joined the way a process list reports it.
      expect(safe.argv.join(" ")).toContain(safe.needle);
      // Every shell still carrying the command holds the quoted form, so the
      // needle must not appear there or the launcher looks like the command.
      expect(safe.line).not.toContain(safe.needle);
    }
  });

  it("runs node from execPath rather than trusting the terminal PATH", () => {
    const safe = createSafeCommand("uid-1", "echo hi", "/tmp", "linux");
    expect(safe.argv[0]).toBe(process.execPath);
  });

  it("points at the shim next to the running build", () => {
    const safe = createSafeCommand("uid-1", "echo hi", "/tmp", "linux");
    expect(safe.argv[1]).toBe(shimPath());
    expect(path.basename(safe.argv[1])).toBe("shb64.js");
  });
});

describe("cwd handling", () => {
  it("embeds cd inside the payload, so the path needs no terminal-level quoting", () => {
    const safe = createSafeCommand("uid-1", "echo hi", "/tmp/it's here", "linux");
    expect(decode(safe.argv)).toBe(`cd '/tmp/it'\\''s here' && echo hi`);
  });

  it("uses cd /d on windows so drive letters are crossed", () => {
    const safe = createSafeCommand("uid-1", "echo hi", "C:\\work", "win32");
    expect(decode(safe.argv)).toBe('cd /d "C:\\work" && echo hi');
  });

  it("actually lands in a cwd containing spaces and a quote", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "open-terminal-cwd-'x "));
    try {
      // -P resolves symlinks, which matters because macOS puts the temp dir
      // behind /var -> /private/var.
      const safe = createSafeCommand("uid-1", "pwd -P", directory, "linux");
      expect(runInShell(decode(safe.argv)).trim()).toBe(await fs.realpath(directory));
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});

describe("quoteArgument", () => {
  it("single quotes for posix, escaping embedded single quotes", () => {
    expect(quoteArgument("it's", "linux")).toBe(`'it'\\''s'`);
  });

  it("double quotes for windows, doubling embedded double quotes", () => {
    expect(quoteArgument('say "hi"', "win32")).toBe('"say ""hi"""');
  });

  it("round trips a quoted path through a real shell", () => {
    expect(runInShell(`printf %s ${quoteArgument(`a 'b' c`, "linux")}`)).toBe(`a 'b' c`);
  });
});

describe("the built shim", () => {
  let built = true;

  beforeAll(async () => {
    try {
      await fs.access(shimPath());
    } catch {
      built = false;
    }
  });

  afterAll(() => {
    expect(built, "run `make build` before the unit suite").toBe(true);
  });

  for (const [name, command] of Object.entries(tricky)) {
    it(`decodes and executes ${name}`, () => {
      const safe = createSafeCommand("uid-1", command, process.cwd(), process.platform);
      const result = spawnSync(safe.argv[0], safe.argv.slice(1), { encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(runInShell(command));
    });
  }

  it("propagates the exit code of the command it ran", () => {
    const safe = createSafeCommand("uid-1", "exit 42", process.cwd(), process.platform);
    expect(spawnSync(safe.argv[0], safe.argv.slice(1)).status).toBe(42);
  });
});
