import execa, { ExecaError } from 'execa';
import ora from 'ora';
import { Options, Terminals, Terminal } from '~/types';

const spinner = ora();
const COMMAND = '([{<COMMAND>}])';

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
      ['terminator', '-e', COMMAND],
      ['gnome-terminal', '-e', COMMAND],
      ['xterm', '-e', COMMAND],
      ['konsole', '-e', COMMAND]
    ]
  }
};

export default async function openDefaultTerminal(
  command: string | string[],
  options?: Partial<Options>,
  _i = 0
) {
  const fullOptions = mergeDefaults(options);
  const terminals = fullOptions.terminals[process.platform];
  if (!terminals) {
    throw new Error(`operating system ${process.platform} not supported`);
  }
  const terminal = terminals[_i];
  if (!terminal) {
    spinner.warn(
      `running process in background because terminal could not be found
try installing on of the following terminals to run correctly: ${terminals
        .map((terminal: Terminal) => terminal[0])
        .join(', ')}
`
    );
    const result = await execa(
      Array.isArray(command) ? command.join(' ') : command,
      {
        cwd: fullOptions.cwd,
        shell: true,
        stdio: 'inherit'
      }
    );
    return result;
  }
  try {
    const result = await openTerminal(terminal, command, fullOptions);
    if (!result) {
      return openDefaultTerminal(command, options, ++_i);
    }
    return result;
  } catch (err) {
    const error: ExecaError = err;
    if (error.command && error.failed) {
      return openDefaultTerminal(command, options, ++_i);
    }
    throw err;
  }
}

export async function openTerminal(
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
  const p = execa(cmd, args, { stdio: 'inherit', cwd });
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
