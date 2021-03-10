import execa, { ExecaError } from 'execa';
import fs from 'fs-extra';
import ora from 'ora';
import os from 'os';
import path from 'path';
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
      ['terminator', '-e', `sh -c "${COMMAND}"`]
      //   ['gnome-terminal', '--', `sh -c "${COMMAND}"`],
      //     ['xterm', '-e', `sh -c "${COMMAND}"`],
      //      ['konsole', '-e', `sh -c "${COMMAND}"`]
    ]
  }
};

export default async function openTerminal(
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
  const tmpPath = await fs.mkdtemp(`${os.tmpdir()}/`);
  const scriptPath = path.resolve(tmpPath, 'script.sh');
  await fs.mkdirs(tmpPath);
  console.log('command', command);
  await fs.writeFile(
    scriptPath,
    `#!/bin/sh
${Array.isArray(command) ? command.join(' ') : command}`
  );
  if (!terminal) {
    spinner.warn(
      `running process in background because terminal could not be found
try installing on of the following terminals to run correctly: ${terminals
        .map((terminal: Terminal) => terminal[0])
        .join(', ')}
`
    );
    try {
      const result = await execa('sh', [scriptPath], {
        cwd: fullOptions.cwd,
        stdio: 'inherit'
      });
      await fs.remove(tmpPath);
      return result;
    } catch (err) {
      await fs.remove(tmpPath);
      throw err;
    }
  }
  try {
    const result = await tryOpenTerminal(
      terminal,
      ['sh', scriptPath],
      fullOptions
    );
    if (!result) return openTerminal(command, options, ++_i);
    return result;
  } catch (err) {
    await fs.remove(tmpPath);
    const error: ExecaError = err;
    if (error.command && error.failed) {
      return openTerminal(command, options, ++_i);
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
  console.log(fs.readFileSync(command[1]).toString());
  console.log([cmd, ...args].join(' '));
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
