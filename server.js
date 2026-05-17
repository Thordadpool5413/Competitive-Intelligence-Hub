const { createServer } = require('http');
const next = require('next');

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

const port = Number.parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOST || '0.0.0.0';
const dev = process.env.NODE_ENV === 'development';

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
