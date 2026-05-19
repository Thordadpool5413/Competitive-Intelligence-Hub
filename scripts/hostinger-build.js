const { spawnSync } = require('child_process');

const skipRealBuild = process.env.CIH_SKIP_DEPLOY_BUILD === '1' || process.env.HOSTINGER_SKIP_NEXT_BUILD === '1';

if (skipRealBuild) {
  console.log('Hostinger deploy build skipped because CIH_SKIP_DEPLOY_BUILD=1 or HOSTINGER_SKIP_NEXT_BUILD=1 was set. This should only be used if the platform does not require a .next directory after build.');
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
