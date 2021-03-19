import execa, { ExecaError } from 'execa';

(async () => {
  try {
    await execa(Buffer.from(process.argv[2], 'base64').toString(), {
      shell: true,
      stdio: 'inherit'
    });
  } catch (err: any) {
    const { exitCode } = err as ExecaError;
    if (!exitCode) throw err;
    process.exit(exitCode);
  }
})().catch(console.error);
