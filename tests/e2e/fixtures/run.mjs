// Drives the ESM entry point the way a consumer on `import` would, which also
// checks that the es/ subtree is resolved as ESM rather than as CommonJS.
import fs from "node:fs";
import openTerminal from "open-terminal";

const proof = process.env.PROOF_FILE || "/tmp/proof-esm.txt";

fs.rmSync(proof, { force: true });
const result = await openTerminal(`printf TERMINAL_RAN > ${proof} && sleep 1`, {
  pollInterval: 200,
  spawnTimeout: 20000,
});
console.log(`TERMINAL ${result.terminal}`);
console.log(`BACKGROUND ${result.background}`);
console.log(`PROOF ${fs.readFileSync(proof, "utf8")}`);
