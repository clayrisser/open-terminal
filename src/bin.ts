import openTerminal from "./index.js";

const command = process.argv.slice(2);

if (!command.length) {
  console.error("usage: open-terminal <command>");
  process.exit(2);
}

// The CLI, unlike the library API, is expected to end when the terminal does.
openTerminal(command, { exitProcess: true }).catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
