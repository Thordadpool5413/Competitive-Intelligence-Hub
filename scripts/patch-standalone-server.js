const { existsSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const root = process.cwd();
const standaloneServerPath = join(root, '.next', 'standalone', 'server.js');
const requiredServerFilesPath = join(root, '.next', 'required-server-files.json');
const marker = 'hostinger-standalone-bootstrap-2026-05-19-03';

if (!existsSync(standaloneServerPath)) {
  console.log('No Next standalone server found; skipping Hostinger standalone patch.');
  process.exit(0);
}

let embeddedConfig = null;

try {
  const requiredServerFiles = JSON.parse(readFileSync(requiredServerFilesPath, 'utf8'));
  embeddedConfig = requiredServerFiles.config || null;
} catch (error) {
  console.warn(`Could not read required-server-files.json: ${error.message}`);
}

const serverSource = `const { createServer } = require('http');
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

process.env.NODE_ENV = 'production';
process.chdir(__dirname);

const dir = __dirname;
const port = Number.parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOSTNAME || process.env.HOST || '0.0.0.0';
const startedAt = new Date().toISOString();
const deploymentMarker = '${marker}';
const embeddedConfig = ${JSON.stringify(embeddedConfig)};

let nextReady = false;
let nextPrepareError = null;
let nextPreparing = false;
let handle = null;
let bootstrapPhase = 'waiting';

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function readNextConfig() {
  if (embeddedConfig) return embeddedConfig;

  try {
    const configPath = join(dir, '.next', 'required-server-files.json');
    const requiredServerFiles = JSON.parse(readFileSync(configPath, 'utf8'));
    return requiredServerFiles.config || null;
  } catch {
    return null;
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
  res.end(\`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>\${htmlEscape(title)}</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}main{max-width:980px;margin:auto;background:#fff;border:1px solid #dbe3ef;border-radius:24px;padding:28px;box-shadow:0 20px 50px rgba(15,23,42,.1)}h1{margin-top:0}pre{white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:18px;border-radius:16px;overflow:auto}.badge{display:inline-block;background:#dbeafe;color:#1e40af;border-radius:999px;padding:6px 10px;font-weight:700}</style></head><body><main><span class="badge">Runtime diagnostic</span><h1>\${htmlEscape(title)}</h1><p>\${htmlEscape(message)}</p><pre>\${htmlEscape(details)}</pre></main></body></html>\`);
}

function runtimePayload(extra = {}) {
  return {
    app: 'Competitive Intelligence Hub',
    deploymentMarker,
    ok: nextReady,
    status: nextReady ? 'Next.js ready' : 'Standalone Node server is listening while Next.js prepares',
    nodeVersion: process.version,
    nodeEnv: process.env.NODE_ENV,
    hostname,
    port,
    cwd: dir,
    buildExists: existsSync(join(dir, '.next', 'BUILD_ID')),
    bootstrapPhase,
    nextPreparing,
    nextPrepareError: nextPrepareError ? String(nextPrepareError.stack || nextPrepareError.message || nextPrepareError) : null,
    startedAt,
    guidance: [
      'This is the Hostinger standalone bootstrap generated after next build.',
      'It binds the Node listener before preparing Next.js so deploy restarts return diagnostics instead of Hostinger 503.',
      'If this marker appears, Hostinger is using the patched standalone server.'
    ],
    ...extra
  };
}

async function prepareNext() {
  if (nextPreparing || nextReady) return;

  nextPreparing = true;
  bootstrapPhase = 'loading-next';

  try {
    const nextConfig = readNextConfig();
    if (nextConfig) {
      process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);
    }

    const next = require('next');
    const app = next({
      dev: false,
      dir,
      hostname,
      port,
      conf: nextConfig || undefined
    });

    await app.prepare();
    handle = app.getRequestHandler();
    nextReady = true;
    nextPrepareError = null;
    bootstrapPhase = 'ready';
    console.log('Competitive Intelligence Hub standalone Next.js app prepared successfully.');
  } catch (error) {
    nextReady = false;
    nextPrepareError = error;
    bootstrapPhase = 'next-prepare-failed';
    console.error('Competitive Intelligence Hub standalone Next.js app failed to prepare.', error);
  } finally {
    nextPreparing = false;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', \`http://\${req.headers.host || 'localhost'}\`);

  if (url.pathname === '/__startup' || url.pathname === '/api/runtime') {
    return sendJson(res, 200, runtimePayload({ route: url.pathname, method: req.method }));
  }

  if (!nextReady || !handle) {
    prepareNext();

    if (url.pathname.startsWith('/api/')) {
      return sendJson(res, 200, runtimePayload({
        route: url.pathname,
        method: req.method,
        message: 'Standalone bootstrap API guard is active while Next.js prepares.'
      }));
    }

    return sendHtml(
      res,
      200,
      'Competitive Intelligence Hub is starting',
      'The Hostinger standalone Node process is alive. Next.js is preparing behind this diagnostic page.',
      JSON.stringify(runtimePayload(), null, 2)
    );
  }

  return handle(req, res);
});

server.on('error', (error) => {
  console.error('Competitive Intelligence Hub standalone server failed to bind.', error);
  process.exit(1);
});

server.listen(port, hostname, () => {
  console.log(\`Competitive Intelligence Hub standalone bootstrap listening on \${hostname}:\${port} with \${deploymentMarker}\`);
  prepareNext();
});
`;

writeFileSync(standaloneServerPath, serverSource);
console.log(`Patched Next standalone server for Hostinger: ${standaloneServerPath}`);
