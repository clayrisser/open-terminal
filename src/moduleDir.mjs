// Copied to es/moduleDir.js by the build. See src/moduleDir.d.ts.
import path from "node:path";
import { fileURLToPath } from "node:url";

export default path.dirname(fileURLToPath(import.meta.url));
