const { spawnSync } = require('child_process');

const runRealBuild = process.env.CIH_DEPLOY_BUILD === '1' || process.env.HOSTINGER_RUN_NEXT_BUILD === '1';

if (!runRealBuild) {
  console.log('Hostinger deploy build skipped on purpose. The runtime server starts immediately and performs the real Next.js build after it is already responding to traffic. Set CIH_DEPLOY_BUILD=1 to force next build during deploy.');
  process.exit(0);
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['next', 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1'
  }
});

process.exit(typeof result.status === 'number' ? result.status : 1);
