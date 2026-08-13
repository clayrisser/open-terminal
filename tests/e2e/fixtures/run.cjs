// Drives the CommonJS entry point the way a consumer on `require` would.
const fs = require("node:fs");
const openTerminal = require("open-terminal").default;

const proof = process.env.PROOF_FILE || "/tmp/proof.txt";

(async () => {
  fs.rmSync(proof, { force: true });
  const result = await openTerminal(`printf TERMINAL_RAN > ${proof} && sleep 1`, {
    pollInterval: 200,
    spawnTimeout: 20000,
  });
  console.log(`TERMINAL ${result.terminal}`);
  console.log(`BACKGROUND ${result.background}`);
  console.log(`PROOF ${fs.readFileSync(proof, "utf8")}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
