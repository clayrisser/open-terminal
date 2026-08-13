import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function pathExtensions(platform: NodeJS.Platform): string[] {
  if (platform !== "win32") return [""];
  return ["", ...(process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)];
}

async function isExecutable(candidate: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    if (!(await fs.stat(candidate)).isFile()) return false;
    // Windows has no execute bit; presence on PATH with a PATHEXT suffix is
    // the whole test.
    if (platform === "win32") return true;
    await fs.access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolve `~` against the home directory, which `fs` will not do itself. */
export function expandHome(target: string): string {
  if (target === "~") return os.homedir();
  if (target.startsWith("~/")) return path.join(os.homedir(), target.slice(2));
  return target;
}

/**
 * Locate an executable on PATH, returning its absolute path.
 *
 * This replaces the `which` package so that the whole library stays
 * dependency-free, and so tests can steer resolution purely through PATH.
 */
export default async function which(
  command: string,
  platform: NodeJS.Platform = process.platform,
): Promise<string | undefined> {
  const target = expandHome(command);
  const extensions = pathExtensions(platform);
  if (target.includes("/") || (platform === "win32" && target.includes("\\"))) {
    for (const extension of extensions) {
      const candidate = path.resolve(target + extension);
      if (await isExecutable(candidate, platform)) return candidate;
    }
    return undefined;
  }
  for (const entry of (process.env.PATH || "").split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(entry, target + extension);
      if (await isExecutable(candidate, platform)) return candidate;
    }
  }
  return undefined;
}

/** True when the path exists at all, used for macOS `.app` bundles. */
export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(expandHome(target));
    return true;
  } catch {
    return false;
  }
}
