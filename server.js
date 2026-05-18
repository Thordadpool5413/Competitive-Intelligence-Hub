const { createServer } = require('http');
const { existsSync } = require('fs');
const { join } = require('path');
const next = require('next');

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

const port = Number.parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOST || '0.0.0.0';
const dev = process.env.NODE_ENV === 'development';
const startedAt = new Date().toISOString();
const buildIdPath = join(process.cwd(), '.next', 'BUILD_ID');

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload, null, 2));
}

function sendHtml(res, statusCode, title, message, details) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}main{max-width:980px;margin:auto;background:#fff;border:1px solid #dbe3ef;border-radius:24px;padding:28px;box-shadow:0 20px 50px rgba(15,23,42,.1)}h1{margin-top:0}pre{white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:18px;border-radius:16px;overflow:auto}.badge{display:inline-block;background:#fee2e2;color:#991b1b;border-radius:999px;padding:6px 10px;font-weight:700}</style></head><body><main><span class="badge">Startup diagnostic</span><h1>${title}</h1><p>${message}</p><pre>${details}</pre></main></body></html>`);
}

function diagnosticPayload(reason, error) {
  return {
    ok: false,
    app: 'Competitive Intelligence Hub',
    reason,
    error: error ? String(error.stack || error.message || error) : null,
    nodeVersion: process.version,
    nodeEnv: process.env.NODE_ENV,
    hostname,
    port,
    cwd: process.cwd(),
    buildIdPath,
    buildExists: existsSync(buildIdPath),
    startedAt,
    guidance: [
      'Confirm Hostinger application root is the repository root.',
      'Confirm build command is npm install && npm run build.',
      'Confirm start command is npm start and startup file is server.js.',
      'Do not manually set PORT unless Hostinger explicitly requires it.',
      'If buildExists is false, Hostinger did not create or preserve the .next production build.'
    ]
  };
}

function startDiagnosticServer(reason, error) {
  const payload = diagnosticPayload(reason, error);
  const server = createServer((req, res) => {
    const url = req.url || '/';
    if (url.startsWith('/__startup') || url.startsWith('/api/health') || url.startsWith('/api/version')) {
      return sendJson(res, 503, payload);
    }
    return sendHtml(res, 503, 'Competitive Intelligence Hub did not start', 'The Node process is alive, but Next.js could not start. The diagnostic details below are from server.js.', JSON.stringify(payload, null, 2));
  });

  server.on('error', (listenError) => {
    console.error('Diagnostic server failed to bind.', listenError);
    process.exit(1);
  });

  server.listen(port, hostname, () => {
    console.error('Competitive Intelligence Hub started diagnostic server instead of Next.js.', payload);
  });
}

if (!dev && !existsSync(buildIdPath)) {
  startDiagnosticServer('Missing .next production build. Next.js cannot start without a completed npm run build.', null);
} else {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  app.prepare().then(() => {
    const server = createServer((req, res) => {
      if (req.url === '/__startup') {
        return sendJson(res, 200, {
          ok: true,
          app: 'Competitive Intelligence Hub',
          status: 'Next.js prepared successfully',
          nodeVersion: process.version,
          nodeEnv: process.env.NODE_ENV,
          hostname,
          port,
          cwd: process.cwd(),
          buildExists: existsSync(buildIdPath),
          startedAt
        });
      }
      return handle(req, res);
    });

    server.on('error', (listenError) => {
      console.error('Competitive Intelligence Hub server failed to bind.', listenError);
      process.exit(1);
    });

    server.listen(port, hostname, () => {
      console.log(`Competitive Intelligence Hub running on ${hostname}:${port} in ${dev ? 'development' : 'production'} mode`);
    });
  }).catch((error) => {
    console.error('Competitive Intelligence Hub failed to prepare Next.js.', error);
    startDiagnosticServer('Next.js app.prepare failed.', error);
  });
}
