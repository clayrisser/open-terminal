import { spawn } from "node:child_process";

/**
 * Decode a base64 shell command and run it.
 *
 * The encoding exists so that a command can travel through a terminal
 * emulator's argv, and sometimes an AppleScript string literal, without either
 * layer mangling its quoting. This shim is the point where it becomes a shell
 * command line again, which is exactly what the caller asked for.
 */
const script = Buffer.from(process.argv[2] || "", "base64").toString();
const child = spawn(script, { shell: true, stdio: "inherit" });

child.on("error", (error: Error) => {
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
  if (signal) {
    process.exit(1);
    return;
  }
  process.exit(code ?? 0);
});
