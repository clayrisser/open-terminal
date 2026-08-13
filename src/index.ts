import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import moduleDir from "./moduleDir.js";
import { pidsMatching, uidToPids } from "./procList.js";
import {
  buildTerminalArgv,
  commandTemplate,
  defaultTerminals,
  normalizeTerminal,
  terminalName,
} from "./terminals.js";
import type { Options, Terminal, Terminals } from "./types.js";
import which, { pathExists } from "./which.js";

export const defaultOptions: Options = {
  commandTemplate,
  cwd: process.cwd(),
  exitProcess: false,
  pollInterval: 1000,
  spawnTimeout: 10000,
  terminals: defaultTerminals,
};

export interface OpenTerminalResult {
  /** The terminal that was used, or `undefined` when nothing was found. */
  terminal?: string;
  argv: string[];
  exitCode: number | null;
  /** True when no terminal was available and the command ran headless. */
  background: boolean;
}

export interface SafeCommand {
  /** Ready to spawn without a shell. */
  argv: string[];
  /** The same command as one shell-quoted line, for embedding in a terminal's argv. */
  line: string;
  /**
   * Identifies the shim process itself, and nothing else in the chain.
   *
   * The uid marker alone is not enough: it also appears in the argv of the
   * terminal launcher and of every shell between it and the command, because
   * they are all carrying the command onwards. Those all hold the *quoted*
   * form, so matching the unquoted argv as the shim itself will report it
   * picks out the one process that is actually running the command.
   */
  needle: string;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function quoteArgument(value: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") return `"${value.split('"').join('""')}"`;
  return `'${value.split("'").join(`'\\''`)}'`;
}

/** Absolute path to the base64 shim, alongside whichever build is running. */
export function shimPath(): string {
  return path.join(moduleDir, "shb64.js");
}

/**
 * Wrap the command so that it survives being passed through a terminal's argv
 * and then a shell.
 *
 * The command is base64 encoded, which leaves nothing for either layer to
 * misparse, and the uid marker is appended as a plain argv element so the
 * spawned process can be found again in the process list.
 */
export function createSafeCommand(
  uid: string,
  command: string,
  cwd: string,
  platform: NodeJS.Platform = process.platform,
  shim: string = shimPath(),
): SafeCommand {
  // cd is inside the encoded payload, so the path needs no further escaping at
  // the terminal layer. /d is required for cmd.exe to cross drive letters.
  const changeDirectory = platform === "win32" ? "cd /d" : "cd";
  const script = `${changeDirectory} ${quoteArgument(cwd, platform)} && ${command}`;
  const argv = [
    process.execPath,
    shim,
    Buffer.from(script).toString("base64"),
    `open-terminal:uid:${uid}`,
  ];
  return {
    argv,
    line: [
      quoteArgument(argv[0], platform),
      quoteArgument(argv[1], platform),
      argv[2],
      argv[3],
    ].join(" "),
    needle: argv.slice(1).join(" "),
  };
}

/**
 * The Debian alternatives symlink pointing at whichever terminal the desktop
 * considers default. Absent on distributions that do not use alternatives.
 */
export async function getDefaultTerminalCommand(): Promise<string | undefined> {
  const resolved = await which("x-terminal-emulator");
  if (!resolved) return undefined;
  try {
    return path.basename(await fs.realpath(resolved));
  } catch {
    return undefined;
  }
}

/**
 * Move the desktop's default terminal to the front, preserving the relative
 * order of everything else.
 */
export function sortTerminals(terminals: Terminal[], preferred?: string): Terminal[] {
  if (!preferred) return [...terminals];
  const matches = terminals.filter((terminal: Terminal) =>
    preferred.startsWith(terminalName(terminal)),
  );
  if (!matches.length) return [...terminals];
  return [...matches, ...terminals.filter((terminal: Terminal) => !matches.includes(terminal))];
}

export async function isTerminalAvailable(
  terminal: Terminal,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  for (const requirement of normalizeTerminal(terminal).requires) {
    const isPath = requirement.includes("/") || requirement.includes("\\");
    if (isPath ? await pathExists(requirement) : await which(requirement, platform)) return true;
  }
  return false;
}

/**
 * Kill whatever the uid marker points at when this process is interrupted.
 *
 * Registering before the wait is what makes this work at all; releases before
 * 0.2 installed these handlers after awaiting the terminal, by which time
 * there was nothing left to forward to.
 */
function forwardSignals(uid: string, child: ChildProcess, platform: NodeJS.Platform): () => void {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  const handler = (signal: NodeJS.Signals) => {
    void (async () => {
      for (const pid of await uidToPids(uid, platform)) {
        try {
          process.kill(pid, signal);
        } catch {
          // Already gone.
        }
      }
      if (child.pid) {
        try {
          process.kill(child.pid, signal);
        } catch {
          // Already gone.
        }
      }
      // Installing a handler suppresses Node's default termination, so the
      // exit has to be explicit.
      process.exit(signal === "SIGINT" ? 130 : 143);
    })();
  };
  for (const signal of signals) process.on(signal, handler);
  return () => {
    for (const signal of signals) process.off(signal, handler);
  };
}

function waitForLaunch(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once("close", resolve);
    child.once("error", reject);
  });
}

class TerminalLaunchError extends Error {
  constructor(terminal: string, exitCode: number) {
    super(`terminal ${terminal} exited with code ${exitCode} without opening`);
    this.name = "TerminalLaunchError";
  }
}

async function runTerminal(
  uid: string,
  terminal: Terminal,
  safeCommand: SafeCommand,
  options: Options,
  platform: NodeJS.Platform,
): Promise<OpenTerminalResult> {
  const argv = buildTerminalArgv(terminal, safeCommand.line, options.commandTemplate);
  const [command, ...args] = argv;
  const child = spawn(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
    // Windows only gives a child its own console window when it is detached.
    detached: platform === "win32",
    windowsHide: false,
  });
  const stopForwarding = forwardSignals(uid, child, platform);
  try {
    await waitForLaunch(child);
    const exited = waitForExit(child);
    let hasExited = false;
    let exitedAt = 0;
    let exitCode: number | null = null;
    const noteExit = (code: number | null) => {
      hasExited = true;
      exitedAt = Date.now();
      exitCode = code;
    };
    void exited.then(noteExit, () => noteExit(null));

    // Daemon-backed terminals such as gnome-terminal hand control back before
    // their window exists, which is the whole reason the tagged process is
    // tracked at all. Terminals that stay in the foreground have instead
    // already finished by the time their launcher exits, so once it is gone
    // only a short grace period is worth waiting: anything longer would stall
    // every short-lived command by the full spawn timeout.
    const appearGrace = Math.max(options.pollInterval * 3, 500);
    const deadline = Date.now() + options.spawnTimeout;
    let appeared = false;
    for (;;) {
      if ((await pidsMatching(safeCommand.needle, platform)).length) {
        appeared = true;
        break;
      }
      // A launcher that failed outright (no display, bad profile) should fall
      // through to the next terminal immediately.
      if (hasExited && (exitCode || Date.now() - exitedAt >= appearGrace)) break;
      if (Date.now() >= deadline) break;
      await delay(options.pollInterval);
    }

    // Then wait for it to finish.
    if (appeared) {
      while ((await pidsMatching(safeCommand.needle, platform)).length) {
        await delay(options.pollInterval);
      }
    }

    const finalExitCode = await exited;
    if (!appeared && finalExitCode) {
      throw new TerminalLaunchError(terminalName(terminal), finalExitCode);
    }
    return { terminal: terminalName(terminal), argv, exitCode: finalExitCode, background: false };
  } finally {
    stopForwarding();
  }
}

async function runInBackground(
  safeCommand: SafeCommand,
  options: Options,
): Promise<OpenTerminalResult> {
  const [command, ...args] = safeCommand.argv;
  const child = spawn(command, args, { cwd: options.cwd, stdio: "inherit" });
  await waitForLaunch(child);
  return {
    argv: safeCommand.argv,
    exitCode: await waitForExit(child),
    background: true,
  };
}

export function mergeDefaults(options?: Partial<Options>): Options {
  const terminals: Terminals = { ...defaultOptions.terminals };
  for (const [platform, overrides] of Object.entries(options?.terminals || {})) {
    // Dedupe by executable so a caller adding one terminal does not have to
    // restate the built-in list.
    terminals[platform] = (overrides || []).reduce((unique: Terminal[], terminal: Terminal) => {
      if (!unique.some((existing: Terminal) => terminalName(existing) === terminalName(terminal)))
        unique.push(terminal);
      return unique;
    }, []);
  }
  return {
    ...defaultOptions,
    ...options,
    cwd: options?.cwd || process.cwd(),
    terminals,
  };
}

/**
 * Open a terminal emulator window and run `command` inside it.
 *
 * Falls back through the platform's terminal list, and finally runs the
 * command headless if none of them is installed.
 */
export default async function openTerminal(
  command: string | string[],
  options?: Partial<Options>,
): Promise<OpenTerminalResult> {
  const fullOptions = mergeDefaults(options);
  const platform = process.platform;
  const terminals = fullOptions.terminals[platform];
  if (!terminals?.length) {
    throw new Error(`operating system ${platform} not supported`);
  }
  const uid = randomUUID();
  const safeCommand = createSafeCommand(
    uid,
    (Array.isArray(command) ? command : [command]).join(" "),
    fullOptions.cwd,
    platform,
  );
  const ordered = sortTerminals(
    terminals,
    platform === "linux" ? await getDefaultTerminalCommand() : undefined,
  );

  for (const terminal of ordered) {
    if (!(await isTerminalAvailable(terminal, platform))) continue;
    try {
      const result = await runTerminal(uid, terminal, safeCommand, fullOptions, platform);
      if (fullOptions.exitProcess) process.exit(result.exitCode ?? 0);
      return result;
    } catch (error) {
      // A terminal that is installed but refuses to start should not stop the
      // rest of the list from being tried.
      if (error instanceof TerminalLaunchError) continue;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "EACCES") continue;
      throw error;
    }
  }

  console.warn(
    `running process in background because no terminal could be found
try installing one of the following terminals to run correctly: ${ordered
      .map(terminalName)
      .join(", ")}`,
  );
  const result = await runInBackground(safeCommand, fullOptions);
  if (fullOptions.exitProcess) process.exit(result.exitCode ?? 0);
  return result;
}

export { defaultTerminals, commandTemplate, buildTerminalArgv, normalizeTerminal, terminalName };
export { pidsMatching, uidToPid, uidToPids } from "./procList.js";
export type { ProcessEntry } from "./procList.js";
export * from "./types.js";
