# Competitive Intelligence Hub

A Hostinger ready Node.js and Next.js application for Andwell Health Partners competitive service line intelligence.

This app lets a user enter up to 25 competitor website URLs, runs a server side crawl of public pages, compares each competitor against the Andwell service taxonomy, produces service line and subservice matrices, generates gap analysis, builds battlecards, creates talk tracks, shows evidence, supports review status, saves intelligence reports, and gives users an Ask the Hub assistant over stored findings.

## Current V2 foundation upgrade

The app has been upgraded from a browser only MVP into a stronger Competitive Intelligence Hub foundation.

New V2 foundation capabilities include:

1. Server side persistence for reports, competitors, reviews, and catalog overrides using Supabase, MongoDB, or local JSON fallback
2. Stored competitor library through `/api/competitors`
3. Stored intelligence reports through `/api/reports`
4. Server saved review decisions through `/api/reviews`
5. Andwell catalog governance endpoint through `/api/catalog`
6. Ask the Hub intelligence assistant endpoint through `/api/ask`
7. Analysis reports automatically save server side after `/api/analyze`
8. Frontend loads saved competitors, saved reports, and review decisions from the server
9. Reports view can reload previously stored intelligence reports
10. Review Center saves approvals, edits, and rejections to server storage
11. Ask the Hub answers from stored findings, subservice findings, safe wording, and evidence excerpts
12. `.data` is ignored so local server storage is not committed to GitHub

## Intelligence capabilities

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
11. Gap Finder with service and subservice opportunities
12. Battlecards with lead with guidance, questions, safe wording, and what not to say
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
14. Stored report library
15. Stored review workflow
16. Ask the Hub
17. Catalog governance API

## API routes

```bash
/api/health
/api/diagnostics
/api/analyze
/api/analyze/status
/api/competitors
/api/reports
/api/reviews
/api/catalog
/api/ask
```

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

The normal Hostinger production path uses the managed Next.js preset and `npm start`. The custom `server.js` bootstrapper remains available as `npm run start:custom` for emergency diagnostics.

`server.js` is intentionally a Hostinger safe bootstrapper. It opens the Node.js listener before loading Next.js, then refreshes missing dependencies or stale build output in the background. That prevents GitHub pulls from dropping the public site into a Hostinger 503 while `npm install`, `npm run build`, or Next.js prepare catches up.

The build also creates a Next.js standalone bundle and patches that generated standalone starter after every build. Hostinger uses that generated standalone starter during GitHub deployments, so this keeps the deployed runtime from falling into a repeated 503 restart loop.

## Hostinger settings

Use Node.js version 20.x.

Build command:

```bash
npm run build
```

Start command:

```bash
npm start
```

Use the managed Next.js framework preset. Do not use `app.js`, `index.js`, or custom-server aliases as the normal Hostinger startup path.

Environment variables:

```bash
NODE_ENV=production
CRAWL_MAX_PAGES_PER_SITE=24
CRAWL_TIMEOUT_MS=12000
CIH_DATA_DIR=.data
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

For Supabase persistence, run `supabase/schema.sql` in the Supabase SQL editor, then add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Hostinger. Keep the service role key server side only. If Supabase is not configured, the app falls back to MongoDB when `MONGODB_URI` is set, then to the local JSON store.

Let Hostinger manage `PORT`. Do not set `HOST` to the public domain.

## GitHub to Hostinger workflow

1. Open Hostinger hPanel.
2. Open the website where this app should run.
3. Open Node.js app setup or Web App setup.
4. Choose GitHub as the source.
5. Select `Thordadpool5413/Competitive-Intelligence-Hub`.
6. Select branch `main`.
7. Set Node.js version to 20.x.
8. Set the build command to `npm run build`.
9. Set the start command to `npm start`.
10. Use the managed Next.js preset; do not use `app.js` or `index.js` startup aliases.
11. Add the environment variables.
12. Deploy.

After a GitHub pull, open `/api/runtime`. If the app is still preparing, that route shows whether it is installing dependencies, rebuilding Next.js, or loading the app.

## Health check

After deployment, open:

```bash
/api/health
```

Expected response:

```json
{ "ok": true }
```

Also test:

```bash
/api/diagnostics
/api/analyze
/api/reports
/api/competitors
/api/ask
```

The API routes should return JSON. If any API route returns an HTML page, Hostinger is not serving the app as a Node.js Next server.

## Important sales safety rule

The app intentionally says “Not found publicly” instead of saying a competitor does not offer a service. That wording protects the team from overstating what website evidence can prove.

## Current limitation

The app uses public website evidence. “Not found publicly” means the service or subservice was not clearly found in reviewed public pages. It does not prove the competitor does not provide that service.

The current V2 foundation now supports Supabase persistence for shared hosted deployments, MongoDB as a secondary managed database option, and local JSON storage as a no-config fallback for a single deployed app instance.
