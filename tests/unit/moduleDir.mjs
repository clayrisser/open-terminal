// Stands in for src/moduleDir.js during tests so the suite exercises the built
// shim in lib/ rather than the TypeScript sources. See vitest.config.ts.
import path from "node:path";
import { fileURLToPath } from "node:url";

export default path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../lib");
