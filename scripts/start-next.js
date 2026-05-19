const { spawn } = require('child_process');

const port = process.env.PORT || '3000';
const host = '0.0.0.0';
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['next', 'start', '-H', host, '-p', port];

console.log(`Starting Next.js with: ${command} ${args.join(' ')}`);

const child = spawn(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'production',
    NEXT_TELEMETRY_DISABLED: '1'
  },
  shell: false,
  windowsHide: true
});

child.on('error', (error) => {
  console.error('Failed to start Next.js.', error);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(typeof code === 'number' ? code : 1);
});
