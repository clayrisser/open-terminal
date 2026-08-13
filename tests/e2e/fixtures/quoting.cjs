// Runs a command loaded with quoting hazards through a real terminal, to show
// the base64 shim survives the whole path rather than only the unit harness.
const fs = require("node:fs");
const openTerminal = require("open-terminal").default;

const proof = process.env.PROOF_FILE || "/tmp/proof-quoting.txt";
const payload = String.raw`he said "it's $HOME" & \ 100% (done); echo trailing`;

(async () => {
  fs.rmSync(proof, { force: true });
  await openTerminal(`printf '%s' '${payload.split("'").join(`'\\''`)}' > ${proof} && sleep 1`, {
    pollInterval: 200,
    spawnTimeout: 20000,
  });
  console.log(`PROOF ${fs.readFileSync(proof, "utf8")}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
