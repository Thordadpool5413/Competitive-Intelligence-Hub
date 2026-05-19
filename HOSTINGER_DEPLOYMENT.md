Hostinger deployment configuration for Competitive Intelligence Hub

Use the managed Next.js framework preset.

Required dashboard settings:

Framework preset: Next.js
Branch: main
Node version: 20.x
Root directory: ./
Build command: npm run build
Package manager: npm
Output directory: .next

Do not use app.js or index.js startup aliases.
Do not use the custom server as the default start path.
Do not set HOST to the public domain.
Let Hostinger manage PORT.

Current package scripts are intentionally standard for managed Next.js hosting:

build: next build
postbuild: node scripts/patch-standalone-server.js
start: next start -H 0.0.0.0 -p ${PORT:-3000}

The postbuild step patches the generated .next/standalone/server.js file so that if Hostinger serves the standalone bundle directly, the Node listener binds before Next.js prepares. This prevents GitHub deploys from falling into a 503 loop while the app starts.

If emergency diagnostics are needed, the custom server remains available with npm run start:custom, but it should not be the normal Hostinger Next.js preset startup path.
