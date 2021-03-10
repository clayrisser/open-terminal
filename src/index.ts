import execa, { ExecaError } from 'execa';
import fs from 'fs-extra';
import ora from 'ora';
import which from 'which';
import { Options, Terminals, Terminal } from '~/types';

const COMMAND = '([{<COMMAND>}])';
const spinner = ora();

export const defaultOptions: Options = {
  commandTemplate: COMMAND,
  cwd: process.cwd(),
  terminals: {
    darwin: [
      [
        'osascript',
        '-e',
        `tell application "Terminal" to do script "${COMMAND}"`
      ]
    ],
    linux: [
      ['gnome-terminal', '--', `sh -c "${COMMAND}"`],
      ['xterm', '-e', `sh -c "${COMMAND}"`],
      ['konsole', '-e', `sh -c "${COMMAND}"`],
      ['terminator', '-u', '-e', `sh -c "${COMMAND}"`]
    ]
  }
};

export async function getDefaultTerminalCommand(): Promise<string | undefined> {
  try {
    const REGEX = /[^/]+$/g;
    const terminalPath = await fs.realpath(await which('x-terminal-emulator'));
    const command = [...(terminalPath.match(REGEX) || [])]?.[0];
    return command;
  } catch (err) {
    if (err.message.indexOf('not found') > -1) return undefined;
    throw err;
  }
}

function createSafeCommand(command: string) {
  const encodedCommand = Buffer.from(command).toString('base64');
  return `node -e 'process.stdout.write(Buffer.from(\\\`${encodedCommand}\\\`,\\\`base64\\\`))' | sh`;
}

export async function hasTerminal(terminal: Terminal | string) {
  const command = Array.isArray(terminal) ? terminal?.[0] || '' : terminal;
  try {
    await which(command);
    return true;
  } catch (err) {
    if (err.message.indexOf('not found') > -1) return false;
    throw err;
  }
}

export default async function openTerminal(
  command: string | string[],
  options?: Partial<Options>,
  _terminals?: Terminal[],
  _i = 0
) {
  const fullOptions = mergeDefaults(options);
  if (!_terminals) {
    const terminals = fullOptions.terminals[process.platform];
    if (!terminals) {
      throw new Error(`operating system ${process.platform} not supported`);
    }
    const defaultTerminalCommand = await getDefaultTerminalCommand();
    _terminals = terminals.sort((a: Terminal) => {
      if ((a[0] || '').indexOf(defaultTerminalCommand || '') > -1) return -1;
      return 1;
    });
  }
  const safeCommand = createSafeCommand(
    (Array.isArray(command) ? command : [command]).join(' ')
  );
  const terminal = _terminals[_i];
  if (!terminal) {
    spinner.warn(
      `running process in background because terminal could not be found
try installing on of the following terminals to run correctly: ${_terminals
        .map((terminal: Terminal) => terminal[0])
        .join(', ')}
`
    );
    const result = await execa(safeCommand, {
      cwd: fullOptions.cwd,
      shell: true,
      stdio: 'inherit'
    });
    return result;
  }
  if (!(await hasTerminal(terminal))) {
    return openTerminal(command, options, _terminals, ++_i);
  }
  try {
    const result = await tryOpenTerminal(terminal, safeCommand, fullOptions);
    if (!result) return openTerminal(command, options, _terminals, ++_i);
    return result;
  } catch (err) {
    const error: ExecaError = err;
    if (error.command && error.failed) {
      return openTerminal(command, options, _terminals, ++_i);
    }
    throw err;
  }
}

async function tryOpenTerminal(
  terminal: Terminal,
  command: string | string[],
  options?: Options
) {
  const { commandTemplate, cwd } = mergeDefaults(options);
  const [cmd] = terminal;
  if (!cmd) {
    throw new Error(`terminal ${terminal[0]} not found`);
  }
  const [, ...args] = terminal.map((arg: string) =>
    arg.replace(
      commandTemplate,
      Array.isArray(command) ? command.join(' ') : command
    )
  );
  const p = execa(cmd, args, {
    stdio: 'inherit',
    cwd
  });
  const result = await p;
  return result;
}

export function mergeDefaults(options?: Partial<Options>): Options {
  return {
    ...defaultOptions,
    ...(options || {}),
    terminals: {
      ...defaultOptions.terminals,
      ...Object.entries(options?.terminals || {}).reduce(
        (osTerminals: Terminals, [os, terminals]: [string, Terminal[]]) => {
          osTerminals[os] = (terminals || []).reduce(
            (terminals: Terminal[], terminal: Terminal) => {
              if (
                !terminals.find((existingTerminal: Terminal) => {
                  return existingTerminal[0] === terminal[0];
                })
              ) {
                terminals.push(terminal);
              }
              return terminals;
            },
            []
          );
          return osTerminals;
        },
        {}
      )
    }
  };
}
