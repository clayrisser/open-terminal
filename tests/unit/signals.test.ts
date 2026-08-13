import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import procList from "../../src/procList.js";
import { createFakeTerminal, withPath } from "./helpers.js";

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup();
});

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pidsMatching(marker: string): Promise<number[]> {
  return (await procList())
    .filter((entry) => entry.pid !== process.pid && entry.cmd.includes(marker))
    .map((entry) => entry.pid);
}

async function waitFor(probe: () => Promise<boolean>, timeout = 15000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await probe()) return true;
    if (Date.now() >= deadline) return false;
    await delay(100);
  }
}

/**
 * `openTerminal` installs process-wide signal handlers and exits, so the only
 * way to observe them is from outside: run it in a child, signal that child,
 * and inspect what is left behind.
 */
async function runUntilStarted(name: string) {
  const fake = await createFakeTerminal(name, "run");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "open-terminal-signal-"));
  const started = path.join(directory, "started");
  cleanups.push(fake.cleanup, withPath(fake.bin));
  cleanups.push(async () => {
    // The command's own `sleep` is a grandchild of the tracked processes, so
    // it outlives them; reap it rather than leaking it into the next test.
    for (const pid of await pidsMatching(directory)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
    await fs.rm(directory, { recursive: true, force: true });
  });

  const host = spawn(
    process.execPath,
    [
      path.resolve(import.meta.dirname, "fixtures/signal.cjs"),
      name,
      `printf up > ${started} && sleep 30`,
    ],
    { stdio: "ignore" },
  );
  cleanups.push(() => {
    host.kill("SIGKILL");
  });
  const exited = new Promise<number | null>((resolve) => host.once("close", resolve));

  const up = await waitFor(async () => {
    try {
      await fs.access(started);
      return (await pidsMatching(fake.bin)).length > 0;
    } catch {
      return false;
    }
  });
  expect(up, "the fake terminal never started").toBe(true);

  return { fake, host, exited };
}

describe("signal forwarding", () => {
  // Releases before 0.2 installed these handlers only after awaiting the
  // terminal, so they never had anything to forward to.
  const cases: Array<[NodeJS.Signals, number]> = [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ];

  for (const [signal, expectedCode] of cases) {
    it(`kills the terminal and exits ${expectedCode} on ${signal}`, async () => {
      const { fake, host, exited } = await runUntilStarted(`signalterm-${signal}`);

      host.kill(signal);

      // Getting the conventional code at all means our handler ran, rather
      // than the default disposition simply terminating the process.
      expect(await exited).toBe(expectedCode);
      expect(
        await waitFor(async () => (await pidsMatching(fake.bin)).length === 0),
        "the terminal survived the signal",
      ).toBe(true);
    }, 40000);
  }
});
