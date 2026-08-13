import { spawn } from "node:child_process";
import fs from "node:fs/promises";

// Process tables get large on busy desktops; cap what we are willing to buffer
// rather than growing without bound.
const maxBuffer = 32 * 1024 * 1024;

export interface ProcessEntry {
  pid: number;
  /** Full command line, argv joined by single spaces. */
  cmd: string;
}

interface JsonRecord {
  [key: string]: unknown;
}

/**
 * Run a fixed argv and collect stdout. No shell is involved and every caller
 * passes a constant argv, so nothing here can be influenced by a command the
 * user asked us to run in a terminal.
 */
function readStdout(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    let length = 0;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      length += chunk.length;
      if (length > maxBuffer) {
        child.kill();
        reject(new Error(`${command} produced more than ${maxBuffer} bytes`));
        return;
      }
      stdout += chunk;
    });
    child.once("error", reject);
    child.once("close", (code: number | null) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

/**
 * `/proc/<pid>/cmdline` holds the NUL-delimited argv verbatim, so it is both
 * cheaper than shelling out and immune to any column truncation.
 */
async function linuxProcList(): Promise<ProcessEntry[]> {
  const entries = await fs.readdir("/proc");
  const processes = await Promise.all(
    entries.map(async (entry): Promise<ProcessEntry | undefined> => {
      const pid = Number(entry);
      if (!Number.isInteger(pid) || pid <= 0) return undefined;
      try {
        const cmdline = await fs.readFile(`/proc/${entry}/cmdline`, "utf8");
        return { pid, cmd: cmdline.replace(/\0+$/, "").split("\0").join(" ") };
      } catch {
        // The process exited between readdir and read, or is not ours to see.
        return undefined;
      }
    }),
  );
  return processes.filter((entry): entry is ProcessEntry => Boolean(entry));
}

export function parsePosixProcList(stdout: string): ProcessEntry[] {
  return stdout.split("\n").reduce((entries: ProcessEntry[], line: string) => {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (match) entries.push({ pid: Number(match[1]), cmd: match[2] });
    return entries;
  }, []);
}

/**
 * `-ww` disables ps's truncation at terminal width. Without it a uid buried
 * late in a long argv is silently invisible.
 */
async function posixProcList(): Promise<ProcessEntry[]> {
  return parsePosixProcList(await readStdout("ps", ["-axww", "-o", "pid=,command="]));
}

export function parseWindowsProcList(stdout: string): ProcessEntry[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed: unknown = JSON.parse(trimmed);
  // ConvertTo-Json emits a bare object rather than an array of one.
  return (Array.isArray(parsed) ? parsed : [parsed])
    .filter((entry: JsonRecord) => typeof entry?.ProcessId === "number")
    .map((entry: JsonRecord) => ({
      pid: entry.ProcessId as number,
      cmd: typeof entry.CommandLine === "string" ? entry.CommandLine : "",
    }));
}

/**
 * CIM replaces `wmic`, which Microsoft removed from Windows 11 24H2 onward.
 */
async function windowsProcList(): Promise<ProcessEntry[]> {
  return parseWindowsProcList(
    await readStdout("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
    ]),
  );
}

/**
 * List every visible process with its full command line.
 *
 * This replaces `node-sigar`, a native binding to Apache SIGAR that Apache
 * retired in 2017 and which no longer builds on supported Node releases.
 */
export default async function procList(
  platform: NodeJS.Platform = process.platform,
): Promise<ProcessEntry[]> {
  if (platform === "linux") return linuxProcList();
  if (platform === "win32") return windowsProcList();
  return posixProcList();
}

/**
 * Find the processes whose command line contains `marker`, never including the
 * caller's own.
 */
export async function pidsMatching(
  marker: string,
  platform: NodeJS.Platform = process.platform,
): Promise<number[]> {
  return (await procList(platform))
    .filter((entry: ProcessEntry) => entry.pid !== process.pid && entry.cmd.includes(marker))
    .map((entry: ProcessEntry) => entry.pid);
}

/**
 * Find the processes carrying `uid` in their argv. The library tags every
 * terminal it launches with a uid marker, which is the only handle that
 * survives terminals like gnome-terminal whose launcher exits immediately and
 * leaves the real window owned by a pre-existing daemon.
 *
 * This matches the whole chain the marker travels through, the terminal
 * launcher and any intervening shell as well as the command itself, which is
 * what you want when tearing the terminal down.
 */
export async function uidToPids(
  uid: string,
  platform: NodeJS.Platform = process.platform,
): Promise<number[]> {
  return pidsMatching(uid, platform);
}

export async function uidToPid(
  uid: string,
  platform: NodeJS.Platform = process.platform,
): Promise<number | undefined> {
  return (await uidToPids(uid, platform))[0];
}
