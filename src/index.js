import spawn from 'cross-spawn';
import { os } from 'js-info';

export default function openTerminal(command) {
  if (os.mac) {
    return spawn('osascript', [
      '-e',
      `tell application "Terminal" to do script "${command}"`
    ]);
  }
  process.stderr.write('operating system not supported\n');
  return process.exit(1);
}
