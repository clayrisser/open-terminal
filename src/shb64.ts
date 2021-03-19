import execa from 'execa';

execa(Buffer.from(process.argv[2], 'base64').toString(), {
  shell: true,
  stdio: 'inherit'
}).catch(console.error);
