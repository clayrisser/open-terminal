import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * A stand-in for a terminal emulator.
 *
 * `record` only writes the argv it was handed, which is enough to assert what
 * the library constructed. `run` additionally executes the command, which
 * makes the fake behave like a real terminal: the tagged process genuinely
 * appears in the process list, so the uid polling and the wait loop are
 * exercised for real without needing a display.
 *
 * Every entry in the built-in Linux table puts the command last, so the shim
 * can find it without knowing which terminal it is impersonating.
 */
export type FakeTerminalMode = "record" | "run" | "fail";

export interface FakeTerminal {
  /** Directory to prepend to PATH. */
  bin: string;
  /** File the shim writes its argv to, one element per line. */
  argvFile: string;
  argv(): Promise<string[]>;
  cleanup(): Promise<void>;
}

export async function createFakeTerminal(
  name: string,
  mode: FakeTerminalMode = "record",
): Promise<FakeTerminal> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "open-terminal-test-"));
  const bin = path.join(root, "bin");
  const argvFile = path.join(root, "argv");
  await fs.mkdir(bin);
  // Deliberately not `exec`: keeping the shim process alive leaves the fake
  // terminal's own path visible in the process list, which is how the signal
  // test observes whether the terminal was killed.
  const bodies: Record<FakeTerminalMode, string> = {
    record: "",
    run: `
last=""
for arg in "$@"; do last="$arg"; done
sh -c "$last"
`,
    // Installed but unable to start, the way a terminal behaves with no
    // display available.
    fail: `
echo "cannot open display" >&2
exit 1
`,
  };
  const runCommand = bodies[mode];
  await fs.writeFile(
    path.join(bin, name),
    `#!/bin/sh
printf '%s\\n' "$@" > "${argvFile}"
${runCommand}`,
    { mode: 0o755 },
  );
  return {
    bin,
    argvFile,
    async argv(): Promise<string[]> {
      const contents = await fs.readFile(argvFile, "utf8");
      return contents.split("\n").slice(0, -1);
    },
    async cleanup(): Promise<void> {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

/** Prepend a directory to PATH for the duration of a test. */
export function withPath(directory: string): () => void {
  const original = process.env.PATH;
  process.env.PATH = `${directory}${path.delimiter}${original ?? ""}`;
  return () => {
    process.env.PATH = original;
  };
}

/** Replace PATH entirely, so nothing installed on the host can be found. */
export function withEmptyPath(directory?: string): () => void {
  const original = process.env.PATH;
  process.env.PATH = directory ?? "";
  return () => {
    process.env.PATH = original;
  };
}
