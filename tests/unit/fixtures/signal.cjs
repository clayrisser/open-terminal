// Runs openTerminal in a process of its own so a real SIGINT can be delivered
// to it without taking the test runner down with it.
const openTerminal = require("../../../lib/index.js").default;

const [terminal, command] = process.argv.slice(2);

openTerminal(command, {
  pollInterval: 100,
  spawnTimeout: 20000,
  terminals: { [process.platform]: [[terminal, "-e", "sh", "-c", "([{<COMMAND>}])"]] },
}).then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
