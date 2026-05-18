const { createServer } = require('http');
const { existsSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');
const next = require('next');

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

const port = Number.parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOST || '0.0.0.0';
const dev = process.env.NODE_ENV === 'development';

function ensureProductionBuild() {
  if (dev) return;
  const buildIdPath = join(process.cwd(), '.next', 'BUILD_ID');
  if (existsSync(buildIdPath)) return;

  console.warn('Production build was not found at .next/BUILD_ID. Running next build before startup.');
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' }
  });

  if (result.status !== 0) {
    throw new Error(`next build failed during startup with exit code ${result.status}`);
  }
}

try {
  ensureProductionBuild();
} catch (error) {
  console.error('Competitive Intelligence Hub could not prepare the production build.', error);
  process.exit(1);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    return handle(req, res);
  }).listen(port, hostname, () => {
    console.log(`Competitive Intelligence Hub running on ${hostname}:${port} in ${dev ? 'development' : 'production'} mode`);
  });
}).catch((error) => {
  console.error('Competitive Intelligence Hub failed to start', error);
  process.exit(1);
});
