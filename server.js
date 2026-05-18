const { spawn } = require('child_process');
const { createServer } = require('http');
const {
  existsSync,
  readdirSync,
  statSync
} = require('fs');
const { join } = require('path');

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

const port = Number.parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOST || '0.0.0.0';
const dev = process.env.NODE_ENV === 'development';
const startedAt = new Date().toISOString();
const projectRoot = process.cwd();
const buildIdPath = join(projectRoot, '.next', 'BUILD_ID');
const deploymentMarker = 'hostinger-auto-rebuild-2026-05-18-03';
const autoInstallEnabled = process.env.CIH_AUTO_INSTALL !== '0';
const autoBuildEnabled = process.env.CIH_AUTO_BUILD !== '0';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let nextReady = false;
let nextPrepareError = null;
let handle = null;
let bootstrapRunning = false;
let bootstrapStartedAt = null;
let bootstrapFinishedAt = null;
let bootstrapPhase = 'waiting';
let bootstrapError = null;
let installNeeded = false;
let buildNeeded = false;
let installAttempted = false;
let buildAttempted = false;
let lastCommand = null;
let lastCommandExitCode = null;
let commandLog = [];

function rememberLog(line) {
  const cleanLine = String(line || '').trimEnd();
  if (!cleanLine) return;
  commandLog.push(cleanLine);
  if (commandLog.length > 120) {
    commandLog = commandLog.slice(commandLog.length - 120);
  }
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeStat(pathname) {
  try {
    return statSync(pathname);
  } catch {
    return null;
  }
}

function mtimeMs(pathname) {
  const stats = safeStat(pathname);
  return stats ? stats.mtimeMs : 0;
}

function latestMtimeInDirectory(pathname) {
  const stats = safeStat(pathname);
  if (!stats) return 0;
  if (stats.isFile()) return stats.mtimeMs;
  if (!stats.isDirectory()) return 0;

  let latest = stats.mtimeMs;
  for (const entry of readdirSync(pathname, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules') continue;

    const child = join(pathname, entry.name);
    if (entry.isDirectory()) {
      latest = Math.max(latest, latestMtimeInDirectory(child));
      continue;
    }

    if (entry.isFile()) {
      latest = Math.max(latest, mtimeMs(child));
    }
  }
  return latest;
}

function latestSourceMtime() {
  const sourcePaths = [
    'app',
    'lib',
    'public',
    'package.json',
    'package-lock.json',
    'next.config.mjs',
    'tsconfig.json',
    'jsconfig.json',
    'server.js'
  ];

  return sourcePaths.reduce((latest, sourcePath) => {
    return Math.max(latest, latestMtimeInDirectory(join(projectRoot, sourcePath)));
  }, 0);
}

function detectInstallNeeded() {
  const nextPackage = join(projectRoot, 'node_modules', 'next', 'package.json');
  const nodeModulesLock = join(projectRoot, 'node_modules', '.package-lock.json');
  const packageLock = join(projectRoot, 'package-lock.json');
  const packageJson = join(projectRoot, 'package.json');

  if (!existsSync(nextPackage)) return true;
  if (existsSync(packageLock) && existsSync(nodeModulesLock)) {
    return mtimeMs(packageLock) > mtimeMs(nodeModulesLock) + 1000;
  }
  if (existsSync(packageLock) && mtimeMs(packageLock) > mtimeMs(nextPackage) + 1000) {
    return true;
  }
  if (existsSync(packageJson) && mtimeMs(packageJson) > mtimeMs(nextPackage) + 1000) {
    return true;
  }
  return false;
}

function detectBuildNeeded() {
  if (dev) return false;
  if (process.env.CIH_FORCE_BUILD === '1') return true;
  if (!existsSync(buildIdPath)) return true;
  return latestSourceMtime() > mtimeMs(buildIdPath) + 1000;
}

function runNpm(args, phase) {
  return new Promise((resolve, reject) => {
    bootstrapPhase = phase;
    lastCommand = `${npmCommand} ${args.join(' ')}`;
    lastCommandExitCode = null;
    rememberLog(`[${new Date().toISOString()}] ${lastCommand}`);

    const child = spawn(npmCommand, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        npm_config_audit: 'false',
        npm_config_fund: 'false'
      },
      shell: false,
      windowsHide: true
    });

    child.stdout.on('data', (chunk) => {
      String(chunk).split(/\r?\n/).forEach(rememberLog);
    });

    child.stderr.on('data', (chunk) => {
      String(chunk).split(/\r?\n/).forEach(rememberLog);
    });

    child.on('error', (error) => {
      lastCommandExitCode = 'spawn-error';
      reject(error);
    });

    child.on('close', (code) => {
      lastCommandExitCode = code;
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${lastCommand} exited with code ${code}`));
    });
  });
}

function runNextBuild(phase) {
  return runNpm(['run', 'build:next'], phase);
}

async function prepareNext() {
  bootstrapPhase = 'loading-next';

  try {
    const next = require('next');
    const app = next({ dev, hostname, port });
    await app.prepare();
    handle = app.getRequestHandler();
    nextReady = true;
    nextPrepareError = null;
    bootstrapError = null;
    bootstrapPhase = 'ready';
    rememberLog(`[${new Date().toISOString()}] Next.js prepared successfully.`);
    return true;
  } catch (error) {
    nextReady = false;
    nextPrepareError = error;
    bootstrapError = error;
    bootstrapPhase = 'next-prepare-failed';
    rememberLog(`[${new Date().toISOString()}] Next.js prepare failed: ${String(error && (error.stack || error.message) || error)}`);
    return false;
  }
}

async function bootstrapNext() {
  if (bootstrapRunning || nextReady) return;

  bootstrapRunning = true;
  bootstrapStartedAt = new Date().toISOString();
  bootstrapFinishedAt = null;
  bootstrapError = null;

  try {
    installNeeded = detectInstallNeeded();
    buildNeeded = detectBuildNeeded();

    if (!dev && autoInstallEnabled && installNeeded) {
      installAttempted = true;
      await runNpm(['install', '--include=dev', '--no-audit', '--no-fund'], 'installing-dependencies');
    }

    if (!dev && autoBuildEnabled && (buildNeeded || installNeeded)) {
      buildAttempted = true;
      await runNextBuild('building-next-app');
    }

    const prepared = await prepareNext();
    if (!prepared && !dev && autoBuildEnabled && !buildAttempted) {
      buildAttempted = true;
      await runNextBuild('rebuilding-after-prepare-failure');
      await prepareNext();
    }
  } catch (error) {
    bootstrapError = error;
    nextPrepareError = error;
    bootstrapPhase = 'bootstrap-failed';
    rememberLog(`[${new Date().toISOString()}] Bootstrap failed: ${String(error && (error.stack || error.message) || error)}`);
  } finally {
    bootstrapFinishedAt = new Date().toISOString();
    bootstrapRunning = false;
  }
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-cih-runtime', deploymentMarker);
  res.end(JSON.stringify(payload, null, 2));
}

function sendHtml(res, statusCode, title, message, details) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-cih-runtime', deploymentMarker);
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)}</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}main{max-width:980px;margin:auto;background:#fff;border:1px solid #dbe3ef;border-radius:24px;padding:28px;box-shadow:0 20px 50px rgba(15,23,42,.1)}h1{margin-top:0}pre{white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:18px;border-radius:16px;overflow:auto}.badge{display:inline-block;background:#dbeafe;color:#1e40af;border-radius:999px;padding:6px 10px;font-weight:700}</style></head><body><main><span class="badge">Runtime diagnostic</span><h1>${htmlEscape(title)}</h1><p>${htmlEscape(message)}</p><pre>${htmlEscape(details)}</pre></main></body></html>`);
}

function runtimePayload(extra = {}) {
  return {
    app: 'Competitive Intelligence Hub',
    deploymentMarker,
    ok: nextReady,
    status: nextReady ? 'Next.js ready' : 'Node server is listening while the app prepares',
    nodeVersion: process.version,
    nodeEnv: process.env.NODE_ENV,
    hostname,
    port,
    cwd: projectRoot,
    buildIdPath,
    buildExists: existsSync(buildIdPath),
    autoInstallEnabled,
    autoBuildEnabled,
    installNeeded,
    buildNeeded,
    installAttempted,
    buildAttempted,
    bootstrapRunning,
    bootstrapPhase,
    bootstrapStartedAt,
    bootstrapFinishedAt,
    bootstrapError: bootstrapError ? String(bootstrapError.stack || bootstrapError.message || bootstrapError) : null,
    nextPrepareError: nextPrepareError ? String(nextPrepareError.stack || nextPrepareError.message || nextPrepareError) : null,
    lastCommand,
    lastCommandExitCode,
    commandLog,
    startedAt,
    guidance: [
      'This response is generated by server.js, which means Hostinger is reaching the Node process.',
      'The server binds before loading Next.js, so GitHub pulls should not cause a Hostinger 503 while dependencies or builds refresh.',
      'Hostinger deploy build can exit quickly, while server.js uses npm run build:next for the real runtime Next.js build.',
      'If node_modules/next is missing or package-lock.json is newer than node_modules, the bootstrap will run npm install unless CIH_AUTO_INSTALL=0.',
      'Use /api/runtime or /__startup to see live bootstrap progress.'
    ],
    ...extra
  };
}

function apiRouteProbe(pathname, method) {
  return runtimePayload({
    route: pathname,
    method,
    message: 'server.js API JSON guard is active while Next.js prepares.'
  });
}

function readRequestBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total <= maxBytes) chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/__startup' || url.pathname === '/api/runtime') {
    return sendJson(res, 200, runtimePayload({ route: url.pathname, method: req.method }));
  }

  if (!nextReady || !handle) {
    bootstrapNext();

    if (url.pathname.startsWith('/api/')) {
      return sendJson(res, 200, apiRouteProbe(url.pathname, req.method || 'GET'));
    }

    return sendHtml(
      res,
      200,
      'Competitive Intelligence Hub is starting',
      'The Node process is alive. Hostinger should stop showing 503 while dependencies, build output, or Next.js prepare in the background.',
      JSON.stringify(runtimePayload(), null, 2)
    );
  }

  if (req.method === 'POST' && url.pathname === '/api/analyze' && url.searchParams.get('runtimeProbe') === '1') {
    const body = await readRequestBody(req);
    return sendJson(res, 200, runtimePayload({
      route: url.pathname,
      method: req.method,
      bodyBytesReceived: Buffer.byteLength(body),
      message: 'POST /api/analyze reached server.js and returned JSON. Remove runtimeProbe=1 to run the real Next API analysis route.'
    }));
  }

  if (req.method === 'HEAD' && url.pathname.startsWith('/api/')) {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('x-cih-runtime', deploymentMarker);
    res.end();
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    res.setHeader('x-cih-api-guard', deploymentMarker);
  }

  return handle(req, res);
});

server.on('error', (listenError) => {
  console.error('Competitive Intelligence Hub server failed to bind.', listenError);
  process.exit(1);
});

server.listen(port, hostname, () => {
  console.log(`Competitive Intelligence Hub bootstrap server listening on ${hostname}:${port} in ${dev ? 'development' : 'production'} mode with ${deploymentMarker}`);
  bootstrapNext();
});
