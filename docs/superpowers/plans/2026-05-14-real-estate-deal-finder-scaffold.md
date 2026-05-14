# Real Estate Deal Finder — Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a deployable Node.js cron job project that Render can connect to, with all folder structure, config, utility wrappers, and pipeline stubs in place — no scraping logic yet.

**Architecture:** A daily cron job flows through four sequential pipeline stages (collect → analyze → persist → notify). Each stage is a stub module returning empty data. Utility wrappers (db, openrouter, mailer, sms) are fully implemented and tested. Config validation fails fast at startup on missing env vars.

**Tech Stack:** Node.js, PostgreSQL (pg + knex), Playwright, OpenRouter (axios), nodemailer, Twilio, Jest

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies, scripts, jest config |
| `.gitignore` | Excludes node_modules, .env, logs |
| `.env.example` | Template for all required env vars |
| `.render.yaml` | Render cron job + managed Postgres config |
| `config/index.js` | Loads dotenv, validates required vars, exports getConfig() |
| `tests/setup.js` | Sets all required env vars before jest runs |
| `tests/config.test.js` | Tests validateConfig throws/passes correctly |
| `src/utils/db.js` | Singleton pg Pool from DATABASE_URL |
| `tests/utils/db.test.js` | Tests Pool is created with correct connection string |
| `src/utils/openrouter.js` | axios wrapper for OpenRouter chat completions |
| `tests/utils/openrouter.test.js` | Tests API call structure and response parsing |
| `src/utils/mailer.js` | nodemailer wrapper: sendMail({ subject, text, html }) |
| `tests/utils/mailer.test.js` | Tests sendMail calls transporter with correct params |
| `src/utils/sms.js` | Twilio wrapper: sendSMS(body) |
| `tests/utils/sms.test.js` | Tests Twilio client called with correct params |
| `scripts/migrate.js` | Runs knex.migrate.latest() — called in Render build |
| `src/db/migrations/.gitkeep` | Ensures migrations dir is tracked in git |
| `src/pipeline/collect.js` | Stub: runs all scrapers, returns merged listings array |
| `src/pipeline/analyze.js` | Stub: scores listings via OpenRouter, returns scored array |
| `src/pipeline/persist.js` | Stub: upserts scored deals to Postgres, returns saved records |
| `src/pipeline/notify.js` | Stub: generates AI digest, sends email + SMS |
| `src/scrapers/zillow.js` | Stub: returns empty array |
| `src/scrapers/craigslist.js` | Stub: returns empty array |
| `src/scrapers/facebook.js` | Stub: returns empty array |
| `src/scrapers/fsbo.js` | Stub: returns empty array |
| `src/index.js` | Entry point: calls pipeline stages in order, exits 1 on error |

---

## Task 1: Initialize package.json and install dependencies

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "real-estate-deal-finder",
  "version": "1.0.0",
  "description": "Daily cron job that finds and scores real estate deals",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "migrate": "node scripts/migrate.js",
    "test": "jest"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "dotenv": "^16.4.5",
    "knex": "^3.1.0",
    "nodemailer": "^6.9.14",
    "pg": "^8.12.0",
    "playwright": "^1.45.1",
    "twilio": "^5.2.3"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "nodemon": "^3.1.4"
  },
  "jest": {
    "testEnvironment": "node",
    "setupFiles": [
      "./tests/setup.js"
    ]
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: initialize package.json with all dependencies"
```

---

## Task 2: Create config files

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.render.yaml`

- [ ] **Step 1: Create .gitignore**

```
node_modules/
.env
*.log
dist/
```

- [ ] **Step 2: Create .env.example**

```
# Database
DATABASE_URL=

# OpenRouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4-5

# Email (SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
EMAIL_TO=

# Twilio SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
SMS_TO=

# App
NODE_ENV=development
```

- [ ] **Step 3: Create .render.yaml**

```yaml
services:
  - type: cron
    name: real-estate-deal-finder
    env: node
    schedule: "0 8 * * *"
    buildCommand: npm install && npx playwright install chromium && npm run migrate
    startCommand: node src/index.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: real-estate-deals-db
          property: connectionString

databases:
  - name: real-estate-deals-db
    databaseName: real_estate_deals
    plan: free
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore .env.example .render.yaml
git commit -m "chore: add gitignore, env template, and render config"
```

---

## Task 3: Jest test setup

**Files:**
- Create: `tests/setup.js`

- [ ] **Step 1: Create tests/setup.js**

This file runs before every test file and ensures all required env vars are present so `config/index.js` doesn't throw during module load.

```js
Object.assign(process.env, {
  DATABASE_URL: 'postgres://test:test@localhost:5432/testdb',
  OPENROUTER_API_KEY: 'test-openrouter-key',
  OPENROUTER_MODEL: 'anthropic/claude-sonnet-4-5',
  SMTP_HOST: 'smtp.test.com',
  SMTP_PORT: '587',
  SMTP_USER: 'test@test.com',
  SMTP_PASS: 'test-smtp-pass',
  EMAIL_FROM: 'from@test.com',
  EMAIL_TO: 'to@test.com',
  TWILIO_ACCOUNT_SID: 'ACtest1234567890',
  TWILIO_AUTH_TOKEN: 'test-twilio-token',
  TWILIO_FROM: '+10000000000',
  SMS_TO: '+10000000001',
  NODE_ENV: 'test',
});
```

- [ ] **Step 2: Verify jest can run**

Run: `npx jest --listTests`

Expected: outputs `tests/setup.js` is recognized (no test files yet, exits cleanly).

- [ ] **Step 3: Commit**

```bash
git add tests/setup.js
git commit -m "test: add jest setup file with required env vars"
```

---

## Task 4: Config module (TDD)

**Files:**
- Create: `tests/config.test.js`
- Create: `config/index.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/config.test.js`:

```js
describe('validateConfig', () => {
  const REQUIRED = [
    'DATABASE_URL', 'OPENROUTER_API_KEY', 'SMTP_HOST', 'SMTP_USER',
    'SMTP_PASS', 'EMAIL_FROM', 'EMAIL_TO', 'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'SMS_TO',
  ];

  let savedEnv;

  beforeEach(() => {
    jest.resetModules();
    savedEnv = {};
    REQUIRED.forEach(key => {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    Object.assign(process.env, savedEnv);
  });

  it('throws when all required vars are missing', () => {
    const { validateConfig } = require('../config');
    expect(() => validateConfig()).toThrow('Missing required environment variables');
  });

  it('includes missing var names in the error message', () => {
    process.env.DATABASE_URL = 'postgres://test';
    const { validateConfig } = require('../config');
    expect(() => validateConfig()).toThrow('OPENROUTER_API_KEY');
  });

  it('does not throw when all required vars are present', () => {
    REQUIRED.forEach(key => { process.env[key] = 'test-value'; });
    const { validateConfig } = require('../config');
    expect(() => validateConfig()).not.toThrow();
  });
});

describe('getConfig', () => {
  it('returns openrouter model from env var', () => {
    process.env.OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-5';
    jest.resetModules();
    const { getConfig } = require('../config');
    expect(getConfig().openrouter.model).toBe('anthropic/claude-sonnet-4-5');
  });

  it('falls back to claude-sonnet-4-5 when OPENROUTER_MODEL is not set', () => {
    delete process.env.OPENROUTER_MODEL;
    jest.resetModules();
    const { getConfig } = require('../config');
    expect(getConfig().openrouter.model).toBe('anthropic/claude-sonnet-4-5');
    process.env.OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-5';
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/config.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../config'`

- [ ] **Step 3: Create config/index.js**

```js
require('dotenv').config();

const REQUIRED = [
  'DATABASE_URL',
  'OPENROUTER_API_KEY',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM',
  'EMAIL_TO',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM',
  'SMS_TO',
];

function validateConfig() {
  const missing = REQUIRED.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function getConfig() {
  return {
    db: {
      url: process.env.DATABASE_URL,
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-5',
    },
    email: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO,
    },
    sms: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_FROM,
      to: process.env.SMS_TO,
    },
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

module.exports = { validateConfig, getConfig };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/config.test.js --no-coverage`

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add config/index.js tests/config.test.js
git commit -m "feat: add config module with env validation"
```

---

## Task 5: Database utility (TDD)

**Files:**
- Create: `tests/utils/db.test.js`
- Create: `src/utils/db.js`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/db.test.js`:

```js
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: jest.fn() })),
}));

describe('getDb', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('creates a Pool with the DATABASE_URL from config', () => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/testdb';
    const { Pool } = require('pg');
    const { getDb } = require('../../src/utils/db');

    getDb();

    expect(Pool).toHaveBeenCalledWith({
      connectionString: 'postgres://test:test@localhost:5432/testdb',
    });
  });

  it('returns the same Pool instance on repeated calls', () => {
    const { Pool } = require('pg');
    const { getDb } = require('../../src/utils/db');

    const first = getDb();
    const second = getDb();

    expect(first).toBe(second);
    expect(Pool).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/utils/db.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../../src/utils/db'`

- [ ] **Step 3: Create src/utils/db.js**

```js
const { Pool } = require('pg');
const { getConfig } = require('../../config');

let pool;

function getDb() {
  if (!pool) {
    pool = new Pool({ connectionString: getConfig().db.url });
  }
  return pool;
}

module.exports = { getDb };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/utils/db.test.js --no-coverage`

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/db.js tests/utils/db.test.js
git commit -m "feat: add db utility with singleton pg Pool"
```

---

## Task 6: OpenRouter utility (TDD)

**Files:**
- Create: `tests/utils/openrouter.test.js`
- Create: `src/utils/openrouter.js`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/openrouter.test.js`:

```js
jest.mock('axios');
const axios = require('axios');

describe('chat', () => {
  beforeEach(() => {
    jest.resetModules();
    axios.post = jest.fn();
  });

  it('posts to OpenRouter with correct URL, model, messages, and auth header', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-test-key';
    process.env.OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-5';

    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'Deal score: 85' } }] },
    });

    const { chat } = require('../../src/utils/openrouter');
    const messages = [{ role: 'user', content: 'Score this deal' }];
    const result = await chat(messages);

    expect(result).toBe('Deal score: 85');
    expect(axios.post).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-sonnet-4-5',
        messages,
      },
      {
        headers: {
          Authorization: 'Bearer sk-test-key',
          'Content-Type': 'application/json',
        },
      }
    );
  });

  it('propagates errors from the API', async () => {
    axios.post.mockRejectedValue(new Error('API rate limit'));
    const { chat } = require('../../src/utils/openrouter');
    await expect(chat([{ role: 'user', content: 'hello' }])).rejects.toThrow('API rate limit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/utils/openrouter.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../../src/utils/openrouter'`

- [ ] **Step 3: Create src/utils/openrouter.js**

```js
const axios = require('axios');
const { getConfig } = require('../../config');

async function chat(messages) {
  const { apiKey, model } = getConfig().openrouter;
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    { model, messages },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.choices[0].message.content;
}

module.exports = { chat };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/utils/openrouter.test.js --no-coverage`

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/openrouter.js tests/utils/openrouter.test.js
git commit -m "feat: add openrouter utility wrapper"
```

---

## Task 7: Email utility (TDD)

**Files:**
- Create: `tests/utils/mailer.test.js`
- Create: `src/utils/mailer.js`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/mailer.test.js`:

```js
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

describe('sendMail', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSendMail.mockClear();
    mockCreateTransport.mockClear();
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user@test.com';
    process.env.SMTP_PASS = 'secret';
    process.env.EMAIL_FROM = 'from@test.com';
    process.env.EMAIL_TO = 'to@test.com';
  });

  it('creates transporter with SMTP config from env', async () => {
    const nodemailer = require('nodemailer');
    const { sendMail } = require('../../src/utils/mailer');

    await sendMail({ subject: 'Test', text: 'Hello', html: '<p>Hello</p>' });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.test.com',
      port: 587,
      auth: { user: 'user@test.com', pass: 'secret' },
    });
  });

  it('sends mail with from, to, subject, text, and html', async () => {
    const { sendMail } = require('../../src/utils/mailer');

    await sendMail({ subject: 'Deals', text: '3 deals found', html: '<b>3 deals</b>' });

    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'from@test.com',
      to: 'to@test.com',
      subject: 'Deals',
      text: '3 deals found',
      html: '<b>3 deals</b>',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/utils/mailer.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../../src/utils/mailer'`

- [ ] **Step 3: Create src/utils/mailer.js**

```js
const nodemailer = require('nodemailer');
const { getConfig } = require('../../config');

async function sendMail({ subject, text, html }) {
  const { host, port, user, pass, from, to } = getConfig().email;
  const transporter = nodemailer.createTransport({ host, port, auth: { user, pass } });
  await transporter.sendMail({ from, to, subject, text, html });
}

module.exports = { sendMail };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/utils/mailer.test.js --no-coverage`

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/mailer.js tests/utils/mailer.test.js
git commit -m "feat: add email utility wrapper"
```

---

## Task 8: SMS utility (TDD)

**Files:**
- Create: `tests/utils/sms.test.js`
- Create: `src/utils/sms.js`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/sms.test.js`:

```js
const mockCreate = jest.fn().mockResolvedValue({ sid: 'SM123' });
const mockMessagesCreate = { messages: { create: mockCreate } };
const mockTwilio = jest.fn().mockReturnValue(mockMessagesCreate);

jest.mock('twilio', () => mockTwilio);

describe('sendSMS', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCreate.mockClear();
    mockTwilio.mockClear();
    process.env.TWILIO_ACCOUNT_SID = 'ACtest1234';
    process.env.TWILIO_AUTH_TOKEN = 'auth-token';
    process.env.TWILIO_FROM = '+10000000000';
    process.env.SMS_TO = '+10000000001';
  });

  it('creates Twilio client with account SID and auth token', async () => {
    const twilio = require('twilio');
    const { sendSMS } = require('../../src/utils/sms');

    await sendSMS('3 deals found today');

    expect(twilio).toHaveBeenCalledWith('ACtest1234', 'auth-token');
  });

  it('sends SMS with body, from, and to', async () => {
    const { sendSMS } = require('../../src/utils/sms');

    await sendSMS('3 deals found today');

    expect(mockCreate).toHaveBeenCalledWith({
      body: '3 deals found today',
      from: '+10000000000',
      to: '+10000000001',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/utils/sms.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../../src/utils/sms'`

- [ ] **Step 3: Create src/utils/sms.js**

```js
const twilio = require('twilio');
const { getConfig } = require('../../config');

async function sendSMS(body) {
  const { accountSid, authToken, from, to } = getConfig().sms;
  const client = twilio(accountSid, authToken);
  await client.messages.create({ body, from, to });
}

module.exports = { sendSMS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/utils/sms.test.js --no-coverage`

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Run full test suite to confirm nothing broken**

Run: `npx jest --no-coverage`

Expected: All tests pass (config × 4, db × 2, openrouter × 2, mailer × 2, sms × 2 = 12 total).

- [ ] **Step 6: Commit**

```bash
git add src/utils/sms.js tests/utils/sms.test.js
git commit -m "feat: add SMS utility wrapper"
```

---

## Task 9: Migration script and migrations directory

**Files:**
- Create: `scripts/migrate.js`
- Create: `src/db/migrations/.gitkeep`

- [ ] **Step 1: Create src/db/migrations/.gitkeep**

Create an empty file at `src/db/migrations/.gitkeep` to ensure the directory is tracked by git. Content: *(empty file)*

- [ ] **Step 2: Create scripts/migrate.js**

```js
require('dotenv').config();

const knex = require('knex')({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: './src/db/migrations',
  },
});

knex.migrate
  .latest()
  .then(([batchNo, log]) => {
    if (log.length === 0) {
      console.log('Already up to date');
    } else {
      console.log(`Batch ${batchNo} run: ${log.length} migration(s)`);
      log.forEach(file => console.log(` - ${file}`));
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
```

- [ ] **Step 3: Verify syntax**

Run: `node --check scripts/migrate.js`

Expected: No output (syntax valid).

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate.js src/db/migrations/.gitkeep
git commit -m "feat: add migration runner and migrations directory"
```

---

## Task 10: Pipeline stubs

**Files:**
- Create: `src/pipeline/collect.js`
- Create: `src/pipeline/analyze.js`
- Create: `src/pipeline/persist.js`
- Create: `src/pipeline/notify.js`

- [ ] **Step 1: Create src/pipeline/collect.js**

```js
async function collect() {
  // TODO: import and run all scrapers, return merged listings array
  return [];
}

module.exports = { collect };
```

- [ ] **Step 2: Create src/pipeline/analyze.js**

```js
async function analyze(listings) {
  // TODO: call openrouter to score each listing
  return listings.map(listing => ({ ...listing, score: null }));
}

module.exports = { analyze };
```

- [ ] **Step 3: Create src/pipeline/persist.js**

```js
async function persist(scoredListings) {
  // TODO: upsert scored deals into postgres, return saved records
  return scoredListings;
}

module.exports = { persist };
```

- [ ] **Step 4: Create src/pipeline/notify.js**

```js
async function notify(deals) {
  // TODO: generate AI digest via openrouter, send email via mailer, send SMS via sms
}

module.exports = { notify };
```

- [ ] **Step 5: Verify syntax on all four files**

Run: `node --check src/pipeline/collect.js src/pipeline/analyze.js src/pipeline/persist.js src/pipeline/notify.js`

Expected: No output (all syntax valid).

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/
git commit -m "feat: add pipeline stage stubs (collect, analyze, persist, notify)"
```

---

## Task 11: Scraper stubs

**Files:**
- Create: `src/scrapers/zillow.js`
- Create: `src/scrapers/craigslist.js`
- Create: `src/scrapers/facebook.js`
- Create: `src/scrapers/fsbo.js`

- [ ] **Step 1: Create src/scrapers/zillow.js**

```js
async function scrape() {
  // TODO: implement Playwright scraping for Zillow
  return [];
}

module.exports = { scrape };
```

- [ ] **Step 2: Create src/scrapers/craigslist.js**

```js
async function scrape() {
  // TODO: implement Playwright scraping for Craigslist
  return [];
}

module.exports = { scrape };
```

- [ ] **Step 3: Create src/scrapers/facebook.js**

```js
async function scrape() {
  // TODO: implement Playwright scraping for Facebook Marketplace
  return [];
}

module.exports = { scrape };
```

- [ ] **Step 4: Create src/scrapers/fsbo.js**

```js
async function scrape() {
  // TODO: implement Playwright scraping for FSBO sites
  return [];
}

module.exports = { scrape };
```

- [ ] **Step 5: Verify syntax**

Run: `node --check src/scrapers/zillow.js src/scrapers/craigslist.js src/scrapers/facebook.js src/scrapers/fsbo.js`

Expected: No output (all syntax valid).

- [ ] **Step 6: Commit**

```bash
git add src/scrapers/
git commit -m "feat: add scraper stubs (zillow, craigslist, facebook, fsbo)"
```

---

## Task 12: Entry point

**Files:**
- Create: `src/index.js`

- [ ] **Step 1: Create src/index.js**

```js
require('dotenv').config();
const { validateConfig } = require('../config');
const { collect } = require('./pipeline/collect');
const { analyze } = require('./pipeline/analyze');
const { persist } = require('./pipeline/persist');
const { notify } = require('./pipeline/notify');

async function run() {
  validateConfig();

  console.log('[1/4] Collecting listings...');
  const listings = await collect();
  console.log(`[1/4] Collected ${listings.length} listings`);

  console.log('[2/4] Analyzing deals...');
  const scoredListings = await analyze(listings);
  console.log(`[2/4] Analyzed ${scoredListings.length} listings`);

  console.log('[3/4] Persisting deals...');
  const savedDeals = await persist(scoredListings);
  console.log(`[3/4] Persisted ${savedDeals.length} deals`);

  console.log('[4/4] Sending notifications...');
  await notify(savedDeals);
  console.log('[4/4] Notifications sent');
}

run().catch(err => {
  console.error('Pipeline failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Verify syntax**

Run: `node --check src/index.js`

Expected: No output (syntax valid).

- [ ] **Step 3: Verify the runner starts and fails fast with a useful message (no .env file)**

Run: `node src/index.js`

Expected output:
```
Pipeline failed: Missing required environment variables: DATABASE_URL, OPENROUTER_API_KEY, ...
```

This confirms validateConfig is wired up correctly and exits 1 on missing vars.

- [ ] **Step 4: Commit**

```bash
git add src/index.js
git commit -m "feat: add entry point with pipeline orchestration"
```

---

## Task 13: Create GitHub repo and push

- [ ] **Step 1: Verify gh CLI is authenticated**

Run: `gh auth status`

Expected: `Logged in to github.com as <your-username>`. If not logged in, run `gh auth login` and follow prompts.

- [ ] **Step 2: Create the GitHub repo and push**

Run: `gh repo create real-estate-deal-finder --public --source=. --remote=origin --push`

Expected output:
```
✓ Created repository <username>/real-estate-deal-finder on GitHub
✓ Added remote https://github.com/<username>/real-estate-deal-finder.git
✓ Pushed commits to https://github.com/<username>/real-estate-deal-finder.git
```

- [ ] **Step 3: Verify all commits are on GitHub**

Run: `gh repo view --web`

Expected: Browser opens to the GitHub repo showing all committed files and commit history.

---

## Final Checklist

After all tasks are complete, verify:

- [ ] `npx jest --no-coverage` — all 12 tests pass
- [ ] `node --check src/index.js` — no syntax errors
- [ ] `node src/index.js` — exits with "Missing required environment variables" (expected — no .env)
- [ ] `git log --oneline` — shows all 13 commits
- [ ] GitHub repo is public and contains all files
- [ ] `.env` is NOT committed (only `.env.example`)
