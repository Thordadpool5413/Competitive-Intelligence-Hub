# Competitive Intelligence Hub

A Hostinger ready Node.js and Next.js application for Andwell Health Partners competitive service line intelligence.

This app lets a user enter up to 25 competitor website URLs, runs a server side crawl of public pages, compares each competitor against the Andwell service taxonomy, produces service line and subservice matrices, generates gap analysis, builds battlecards, creates talk tracks, shows evidence, supports review status, and exports reports.

## Current intelligence upgrade

The app has been upgraded from a basic competitor website scan into a stronger Competitive Intelligence Hub.

New intelligence capabilities include:

1. True subservice level findings for every Andwell capability
2. Executive competitor scoring
3. Service line overlap score
4. Subservice depth score
5. Andwell differentiation score
6. Evidence strength score
7. Review risk score
8. Competitor threat level
9. Executive insights by audience
10. Competitor profile intelligence
11. Stronger Gap Finder with service and subservice opportunities
12. Stronger battlecards with lead with guidance, questions, safe wording, and what not to say
13. Evidence drawer for both service findings and subservice findings
14. Review Center for both service and subservice findings
15. Polished dashboard CSS and visual design system

## Core features

1. Competitor URL intake for up to 25 public websites
2. Server side public website crawler
3. Andwell baseline service taxonomy
4. Service line matrix
5. Subservice matrix
6. Gap Finder
7. Competitor profiles
8. Competitor battlecards
9. Talk Track Builder
10. Evidence Library
11. Human Review Center
12. JSON, CSV, and HTML export
13. Safe sales language rules using “Not found publicly” instead of unsupported competitor claims

## Local development

```bash
npm install
npm run dev
```

Open:

```bash
http://localhost:3000
```

## Production build

```bash
npm install
npm run build
npm start
```

The production server starts from `server.js` and listens on `process.env.PORT` or `3000`.

## Hostinger settings

Use Node.js version 24 or newer.

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```

Startup file:

```bash
server.js
```

Environment variables:

```bash
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
CRAWL_MAX_PAGES_PER_SITE=24
CRAWL_TIMEOUT_MS=12000
```

If Hostinger automatically injects a port, use the Hostinger provided port and do not hardcode another value.

## GitHub to Hostinger workflow

1. Open Hostinger hPanel.
2. Open the website where this app should run.
3. Open Node.js app setup or Web App setup.
4. Choose GitHub as the source.
5. Select `Thordadpool5413/Competitive-Intelligence-Hub`.
6. Select branch `main`.
7. Set Node.js version to 24 or newer.
8. Set the build command to `npm install && npm run build`.
9. Set the start command to `npm start`.
10. Set the startup file to `server.js` if Hostinger asks for it.
11. Add the environment variables.
12. Deploy.

## Health check

After deployment, open:

```bash
/api/health
```

Expected response:

```json
{ "ok": true }
```

## Important sales safety rule

The app intentionally says “Not found publicly” instead of saying a competitor does not offer a service. That wording protects the team from overstating what website evidence can prove.

## Current limitation

The app uses public website evidence. “Not found publicly” means the service or subservice was not clearly found in reviewed public pages. It does not prove the competitor does not provide that service.

The current deployment stores saved reports in browser local storage. A future enterprise version should add a shared database so executives, leaders, and reps see the same approved intelligence across devices.
