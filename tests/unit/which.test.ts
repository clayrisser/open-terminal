import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import which, { expandHome, pathExists } from "../../src/which.js";
import { createFakeTerminal, withEmptyPath, withPath } from "./helpers.js";

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup();
});

describe("which", () => {
  it("finds an executable on a shimmed PATH", async () => {
    const fake = await createFakeTerminal("kitty");
    cleanups.push(fake.cleanup, withPath(fake.bin));
    expect(await which("kitty")).toBe(path.join(fake.bin, "kitty"));
  });

  it("returns undefined when PATH holds nothing of that name", async () => {
    const fake = await createFakeTerminal("kitty");
    cleanups.push(fake.cleanup, withEmptyPath(fake.bin));
    expect(await which("alacritty")).toBeUndefined();
  });

  it("ignores a file without the execute bit", async () => {
    const fake = await createFakeTerminal("kitty");
    cleanups.push(fake.cleanup, withEmptyPath(fake.bin));
    await fs.writeFile(path.join(fake.bin, "foot"), "#!/bin/sh\n", { mode: 0o644 });
    expect(await which("foot")).toBeUndefined();
  });

  it("ignores a directory that shares the name", async () => {
    const fake = await createFakeTerminal("kitty");
    cleanups.push(fake.cleanup, withEmptyPath(fake.bin));
    await fs.mkdir(path.join(fake.bin, "wezterm"));
    expect(await which("wezterm")).toBeUndefined();
  });

  it("takes the first match in PATH order", async () => {
    const first = await createFakeTerminal("xterm");
    const second = await createFakeTerminal("xterm");
    cleanups.push(first.cleanup, second.cleanup);
    cleanups.push(withEmptyPath(`${first.bin}${path.delimiter}${second.bin}`));
    expect(await which("xterm")).toBe(path.join(first.bin, "xterm"));
  });

  it("resolves an explicit path without consulting PATH", async () => {
    const fake = await createFakeTerminal("ghostty");
    cleanups.push(fake.cleanup, withEmptyPath(""));
    expect(await which(path.join(fake.bin, "ghostty"))).toBe(path.join(fake.bin, "ghostty"));
  });
});

describe("expandHome", () => {
  it("expands a bare tilde", () => {
    expect(expandHome("~")).toBe(os.homedir());
  });

  it("expands a tilde prefix", () => {
    expect(expandHome("~/Applications/iTerm.app")).toBe(
      path.join(os.homedir(), "Applications/iTerm.app"),
    );
  });

  it("leaves everything else alone", () => {
    expect(expandHome("/Applications/iTerm.app")).toBe("/Applications/iTerm.app");
  });
});

describe("pathExists", () => {
  it("is true for a directory, which is what a macOS app bundle is", async () => {
    const fake = await createFakeTerminal("kitty");
    cleanups.push(fake.cleanup);
    expect(await pathExists(fake.bin)).toBe(true);
  });

  it("is false for a path that is not there", async () => {
    expect(await pathExists("/Applications/DefinitelyNotInstalled.app")).toBe(false);
  });
});
