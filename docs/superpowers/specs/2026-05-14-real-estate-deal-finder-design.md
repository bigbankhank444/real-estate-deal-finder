# Real Estate Deal Finder — Project Design

**Date:** 2026-05-14
**Type:** Node.js Cron Job scaffold
**Status:** Approved

---

## Overview

A Node.js cron job that runs daily on Render. It scrapes real estate listings from multiple sources, scores each deal using AI, persists results to PostgreSQL, and emails a digest of the best deals.

No scraping logic is built in this phase — the goal is a deployable scaffold that Render can connect to so scraping logic can be added iteratively.

---

## Architecture

### Pipeline Stages

The daily run flows through four sequential stages:

```
collect → analyze → persist → notify
```

`src/index.js` is the entry point. It calls each stage in order, passes the output of one as input to the next, logs progress at each stage, and exits with code 1 on any unhandled error so Render marks the run as failed.

| Stage | Input | Output | Module |
|-------|-------|--------|--------|
| collect | — | raw listings array | `src/pipeline/collect.js` |
| analyze | raw listings | scored listings array | `src/pipeline/analyze.js` |
| persist | scored listings | saved deal records | `src/pipeline/persist.js` |
| notify | saved deal records | — (sends email) | `src/pipeline/notify.js` |

### Data Sources (scaffolded, not yet implemented)

Each source gets its own file under `src/scrapers/`. All use Playwright (headless Chromium).

- `zillow.js`
- `craigslist.js`
- `facebook.js`
- `fsbo.js`

`collect.js` imports all scrapers and runs them, returning a merged array of raw listings.

### AI Integration (OpenRouter)

Used in two places:

1. **`analyze.js`** — Scores each listing (price vs. market, estimated ROI, red flags). Calls OpenRouter chat completion per listing or in batches.
2. **`notify.js`** — Generates a plain-English digest of the top-scored deals for the email body.

OpenRouter is accessed via a thin wrapper in `src/utils/openrouter.js` using `axios`. The model is configurable via `OPENROUTER_MODEL` env var (default: `openai/gpt-4o-mini`).

### Database

PostgreSQL on Render managed add-on. `knex` is used for both query building and migrations.

- `scripts/migrate.js` — runs `knex.migrate.latest()`, called during Render build
- `src/utils/db.js` — exports a singleton `pg` client for use across pipeline stages
- Migrations live in `src/db/migrations/`

### Email

`nodemailer` configured via SMTP env vars. Wrapped in `src/utils/mailer.js`. Called only from `notify.js`.

---

## Folder Structure

```
real-estate-deal-finder/
├── src/
│   ├── index.js
│   ├── pipeline/
│   │   ├── collect.js
│   │   ├── analyze.js
│   │   ├── persist.js
│   │   └── notify.js
│   ├── scrapers/
│   │   ├── zillow.js
│   │   ├── craigslist.js
│   │   ├── facebook.js
│   │   └── fsbo.js
│   ├── db/
│   │   └── migrations/
│   └── utils/
│       ├── db.js
│       ├── openrouter.js
│       └── mailer.js
├── config/
│   └── index.js
├── scripts/
│   └── migrate.js
├── .env.example
├── .gitignore
├── .render.yaml
└── package.json
```

---

## Dependencies

```json
{
  "dependencies": {
    "playwright": "^1.x",
    "pg": "^8.x",
    "knex": "^3.x",
    "nodemailer": "^6.x",
    "dotenv": "^16.x",
    "axios": "^1.x"
  },
  "devDependencies": {
    "nodemon": "^3.x"
  },
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "migrate": "node scripts/migrate.js"
  }
}
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Render Postgres connection string |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `OPENROUTER_MODEL` | No | Model to use (default: `openai/gpt-4o-mini`) |
| `SMTP_HOST` | Yes | SMTP server hostname |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_USER` | Yes | SMTP username |
| `SMTP_PASS` | Yes | SMTP password |
| `EMAIL_FROM` | Yes | Sender address |
| `EMAIL_TO` | Yes | Recipient address(es) |
| `NODE_ENV` | No | `development` or `production` |

`config/index.js` validates all required variables at startup and throws if any are missing.

---

## Render Deployment

- **Service type:** Cron Job
- **Build command:** `npm install && npx playwright install chromium && npm run migrate`
- **Start command:** `node src/index.js`
- **Schedule:** `0 8 * * *` (daily 8am UTC)
- **Add-on:** Render managed PostgreSQL (`DATABASE_URL` auto-injected)
- **Config file:** `.render.yaml` included in repo root for auto-detection

---

## Out of Scope (This Phase)

- Actual scraping logic in any `src/scrapers/*.js` file
- AI prompt engineering for scoring or digest
- DB schema / migration content (tables not defined yet)
- Email HTML templates
- Deduplication logic
- Any filtering/criteria configuration UI
