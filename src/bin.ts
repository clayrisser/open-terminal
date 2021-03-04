import ora from 'ora';
import openDefaultTerminal from '~/index';

const spinner = ora();

export default (async () => {
  await openDefaultTerminal(process.argv.slice(2));
})().catch(spinner.fail);
