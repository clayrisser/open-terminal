import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import procList, {
  parsePosixProcList,
  parseWindowsProcList,
  uidToPid,
  uidToPids,
} from "../../src/procList.js";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor<T>(
  probe: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeout = 10000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await probe();
    if (predicate(value)) return value;
    if (Date.now() >= deadline) throw new Error("timed out waiting for the process list to settle");
    await delay(50);
  }
}

describe("procList", () => {
  it("lists processes with pids and command lines", async () => {
    const processes = await procList();
    expect(processes.length).toBeGreaterThan(0);
    for (const entry of processes.slice(0, 20)) {
      expect(Number.isInteger(entry.pid)).toBe(true);
      expect(entry.pid).toBeGreaterThan(0);
      expect(typeof entry.cmd).toBe("string");
    }
  });

  it("includes the process running the tests", async () => {
    const processes = await procList();
    expect(processes.some((entry) => entry.pid === process.pid)).toBe(true);
  });
});

describe("uidToPid against a real process", () => {
  let child: ChildProcess | undefined;

  afterEach(() => {
    child?.kill("SIGKILL");
    child = undefined;
  });

  it("finds a spawned process by a uid buried in its argv", async () => {
    const uid = randomUUID();
    // Padding pushes the marker far enough into argv that any tool truncating
    // at terminal width would miss it.
    child = spawn(
      process.execPath,
      ["-e", "setTimeout(() => {}, 60000)", "x".repeat(200), `open-terminal:uid:${uid}`],
      { stdio: "ignore" },
    );
    await new Promise((resolve, reject) => {
      child!.once("spawn", resolve);
      child!.once("error", reject);
    });

    const pid = await waitFor(
      () => uidToPid(uid),
      (value) => value !== undefined,
    );
    expect(pid).toBe(child.pid);

    child.kill("SIGKILL");
    const pids = await waitFor(
      () => uidToPids(uid),
      (value) => value.length === 0,
    );
    expect(pids).toEqual([]);
  });

  it("returns undefined for a uid that is not running", async () => {
    expect(await uidToPid(randomUUID())).toBeUndefined();
  });

  it("never reports the calling process", async () => {
    // Match on something guaranteed to be in our own command line.
    const pids = await uidToPids("node");
    expect(pids).not.toContain(process.pid);
  });
});

describe("parsePosixProcList", () => {
  it("splits the pid from the rest of the line", () => {
    expect(
      parsePosixProcList(["  123 /usr/bin/node server.js", "4567 sh -c echo hi", ""].join("\n")),
    ).toEqual([
      { pid: 123, cmd: "/usr/bin/node server.js" },
      { pid: 4567, cmd: "sh -c echo hi" },
    ]);
  });

  it("keeps spacing inside the command line intact", () => {
    expect(parsePosixProcList("1 sh -c echo   a    b")[0].cmd).toBe("sh -c echo   a    b");
  });

  it("ignores header rows and blank lines", () => {
    expect(parsePosixProcList("  PID COMMAND\n\n  7 init\n")).toEqual([{ pid: 7, cmd: "init" }]);
  });
});

describe("parseWindowsProcList", () => {
  it("reads the array form", () => {
    const stdout = JSON.stringify([
      { ProcessId: 10, CommandLine: "node a.js" },
      { ProcessId: 11, CommandLine: "cmd.exe /c b" },
    ]);
    expect(parseWindowsProcList(stdout)).toEqual([
      { pid: 10, cmd: "node a.js" },
      { pid: 11, cmd: "cmd.exe /c b" },
    ]);
  });

  it("reads the bare object ConvertTo-Json emits for a single result", () => {
    expect(
      parseWindowsProcList(JSON.stringify({ ProcessId: 10, CommandLine: "node a.js" })),
    ).toEqual([{ pid: 10, cmd: "node a.js" }]);
  });

  it("tolerates the null CommandLine of processes it cannot read", () => {
    expect(parseWindowsProcList(JSON.stringify([{ ProcessId: 4, CommandLine: null }]))).toEqual([
      { pid: 4, cmd: "" },
    ]);
  });

  it("returns nothing for empty output", () => {
    expect(parseWindowsProcList("   ")).toEqual([]);
  });
});
