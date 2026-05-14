# Mahoning County Scrapers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all scraper stubs with real Playwright scrapers for Mahoning County public records and FSBO sources, add a `deals` DB migration, update `collect.js` to run all five scrapers in parallel, and add probate address resolution to `analyze.js`.

**Architecture:** Each scraper exports `scrape()` (Playwright automation) and a pure normalization function (`parseRows` or `parseListings`) that is unit-tested independently. A shared `browser.js` exports `launchBrowser()` and `delay()`. `collect.js` uses `Promise.allSettled` so one broken scraper never stops the run. `analyze.js` adds fuzzy-name auditor lookup for probate listings whose address is null at scrape time.

**Tech Stack:** Node.js, Playwright (Chromium headless), knex (migrations), pg, Jest

---

## File Map

| File | Action |
|------|--------|
| `tests/setup.js` | Modify — add `SCRAPE_DELAY_MS=100` |
| `config/index.js` | Modify — add `scrapeDelayMs` to `getConfig()` |
| `.env.example` | Modify — add `SCRAPE_DELAY_MS=2000` |
| `src/utils/browser.js` | New |
| `tests/utils/browser.test.js` | New |
| `src/scrapers/mahoning-tax-delinquent.js` | New |
| `tests/scrapers/mahoning-tax-delinquent.test.js` | New |
| `src/scrapers/mahoning-preforeclosure.js` | New |
| `tests/scrapers/mahoning-preforeclosure.test.js` | New |
| `src/scrapers/mahoning-probate.js` | New |
| `tests/scrapers/mahoning-probate.test.js` | New |
| `src/scrapers/zillow.js` | Replace stub |
| `tests/scrapers/zillow.test.js` | New |
| `src/scrapers/craigslist.js` | Replace stub |
| `tests/scrapers/craigslist.test.js` | New |
| `src/pipeline/collect.js` | Replace stub |
| `tests/pipeline/collect.test.js` | New |
| `src/pipeline/analyze.js` | Modify |
| `tests/pipeline/analyze.test.js` | New |
| `src/db/migrations/<timestamp>_create_deals.js` | New |

---

## Task 1: Add SCRAPE_DELAY_MS to config and test setup

**Files:**
- Modify: `tests/setup.js`
- Modify: `config/index.js`
- Modify: `.env.example`

- [ ] **Step 1: Add SCRAPE_DELAY_MS to tests/setup.js**

Open `tests/setup.js` and add one line to the `Object.assign` call:

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
  SCRAPE_DELAY_MS: '100',
  NODE_ENV: 'test',
});
```

- [ ] **Step 2: Add scrapeDelayMs to config/index.js**

In `config/index.js`, update the `getConfig()` return value to include the new field:

```js
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
    scrapeDelayMs: parseInt(process.env.SCRAPE_DELAY_MS || '2000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}
```

- [ ] **Step 3: Add SCRAPE_DELAY_MS to .env.example**

Append this line to `.env.example` under the `# App` section:

```
SCRAPE_DELAY_MS=2000
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `npx jest --no-coverage`

Expected: All existing tests pass (config × 4, db × 2, openrouter × 2, mailer × 2, sms × 2 = 12 total).

- [ ] **Step 5: Commit**

```bash
git add tests/setup.js config/index.js .env.example
git commit -m "feat: add SCRAPE_DELAY_MS config for scraper rate limiting"
```

---

## Task 2: Create src/utils/browser.js

**Files:**
- Create: `tests/utils/browser.test.js`
- Create: `src/utils/browser.js`

- [ ] **Step 1: Write the failing test**

Create `tests/utils/browser.test.js`:

```js
describe('delay', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.SCRAPE_DELAY_MS = '50';
  });

  afterEach(() => {
    process.env.SCRAPE_DELAY_MS = '100';
  });

  it('waits approximately scrapeDelayMs milliseconds', async () => {
    const { delay } = require('../../src/utils/browser');
    const start = Date.now();
    await delay();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/utils/browser.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../../src/utils/browser'`

- [ ] **Step 3: Create src/utils/browser.js**

```js
const { chromium } = require('playwright');
const { getConfig } = require('../../config');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function launchBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return { browser, context };
}

async function delay() {
  const ms = getConfig().scrapeDelayMs;
  await new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { launchBrowser, delay };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/utils/browser.test.js --no-coverage`

Expected: PASS — 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add src/utils/browser.js tests/utils/browser.test.js
git commit -m "feat: add shared browser launch and delay utilities"
```

---

## Task 3: mahoning-tax-delinquent.js

**Files:**
- Create: `tests/scrapers/mahoning-tax-delinquent.test.js`
- Create: `src/scrapers/mahoning-tax-delinquent.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/scrapers/mahoning-tax-delinquent.test.js`:

```js
const { parseRows } = require('../../src/scrapers/mahoning-tax-delinquent');

describe('parseRows', () => {
  it('converts raw row objects to normalized listing shape', () => {
    const rows = [{
      parcel_number: '53-001-0-002-00',
      owner_name: 'SMITH JOHN',
      address: '1234 Oak St, Youngstown OH 44502',
      delinquent_amount: '$3,200.00',
      years_delinquent: '2',
      estimated_value: 42000,
    }];

    const results = parseRows(rows);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      address: '1234 Oak St, Youngstown OH 44502',
      owner_name: 'SMITH JOHN',
      signal_type: 'tax_delinquent',
      asking_price: null,
      estimated_value: 42000,
      arv: null,
      fair_offer: null,
      comparables: null,
      contact_info: null,
      source_url: 'https://auditor.mahoningcountyoh.gov/DelinquencyReport',
      raw: {
        parcel_number: '53-001-0-002-00',
        delinquent_amount: '$3,200.00',
        years_delinquent: '2',
      },
    });
  });

  it('filters out rows with empty address', () => {
    const rows = [{ parcel_number: '53-001', owner_name: 'DOE JANE', address: '' }];
    expect(parseRows(rows)).toEqual([]);
  });

  it('sets owner_name to null when empty string', () => {
    const rows = [{
      parcel_number: '53-002',
      owner_name: '',
      address: '456 Elm Ave, Youngstown OH 44503',
      delinquent_amount: '$1,000',
      years_delinquent: '1',
      estimated_value: null,
    }];
    expect(parseRows(rows)[0].owner_name).toBeNull();
  });

  it('sets estimated_value to null when not provided', () => {
    const rows = [{
      parcel_number: '53-003',
      owner_name: 'TEST',
      address: '789 Pine Rd',
      delinquent_amount: '$500',
      years_delinquent: '1',
    }];
    expect(parseRows(rows)[0].estimated_value).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/scrapers/mahoning-tax-delinquent.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../../src/scrapers/mahoning-tax-delinquent'`

- [ ] **Step 3: Create src/scrapers/mahoning-tax-delinquent.js**

```js
const { launchBrowser, delay } = require('../utils/browser');

const SOURCE_URL = 'https://auditor.mahoningcountyoh.gov/DelinquencyReport';

function parseRows(rows) {
  return rows
    .filter(r => r.address && r.address.trim())
    .map(r => ({
      address: r.address.trim(),
      owner_name: r.owner_name && r.owner_name.trim() ? r.owner_name.trim() : null,
      signal_type: 'tax_delinquent',
      asking_price: null,
      estimated_value: r.estimated_value || null,
      arv: null,
      fair_offer: null,
      comparables: null,
      contact_info: null,
      source_url: SOURCE_URL,
      raw: {
        parcel_number: r.parcel_number || null,
        delinquent_amount: r.delinquent_amount || null,
        years_delinquent: r.years_delinquent || null,
      },
    }));
}

async function scrape() {
  const { browser, context } = await launchBrowser();
  const rawRows = [];

  try {
    const page = await context.newPage();
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await delay();

    let hasMore = true;
    while (hasMore) {
      await page.waitForSelector('table', { timeout: 15000 });

      const pageRows = await page.$$eval('table tbody tr', rows =>
        rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          return {
            parcel_number: cells[0]?.textContent?.trim() || '',
            owner_name: cells[1]?.textContent?.trim() || '',
            address: cells[2]?.textContent?.trim() || '',
            delinquent_amount: cells[3]?.textContent?.trim() || '',
            years_delinquent: cells[4]?.textContent?.trim() || '',
            detail_href: row.querySelector('a')?.getAttribute('href') || null,
          };
        })
      );

      for (const row of pageRows) {
        if (!row.address) continue;

        let estimated_value = null;
        if (row.detail_href) {
          const detailUrl = row.detail_href.startsWith('http')
            ? row.detail_href
            : `https://auditor.mahoningcountyoh.gov${row.detail_href}`;
          const detailPage = await context.newPage();
          try {
            await detailPage.goto(detailUrl, { waitUntil: 'networkidle', timeout: 20000 });
            await delay();
            const valueText = await detailPage.$$eval('td', cells => {
              const idx = Array.from(cells).findIndex(c =>
                /appraised|total value/i.test(c.textContent)
              );
              return idx >= 0 ? cells[idx + 1]?.textContent?.trim() || null : null;
            }).catch(() => null);
            if (valueText) {
              estimated_value = parseInt(valueText.replace(/[^0-9]/g, ''), 10) || null;
            }
          } catch {
            // non-fatal — keep estimated_value as null
          } finally {
            await detailPage.close();
          }
        }

        rawRows.push({ ...row, estimated_value });
        await delay();
      }

      const nextBtn = await page.$('a:text("Next"), [aria-label="Next"], .next-page');
      if (nextBtn) {
        await nextBtn.click();
        await page.waitForLoadState('networkidle');
        await delay();
      } else {
        hasMore = false;
      }
    }
  } finally {
    await browser.close();
  }

  return parseRows(rawRows);
}

module.exports = { scrape, parseRows };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/scrapers/mahoning-tax-delinquent.test.js --no-coverage`

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scrapers/mahoning-tax-delinquent.js tests/scrapers/mahoning-tax-delinquent.test.js
git commit -m "feat: add Mahoning County tax delinquent scraper"
```

---

## Task 4: mahoning-preforeclosure.js

**Files:**
- Create: `tests/scrapers/mahoning-preforeclosure.test.js`
- Create: `src/scrapers/mahoning-preforeclosure.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/scrapers/mahoning-preforeclosure.test.js`:

```js
const { parseRows } = require('../../src/scrapers/mahoning-preforeclosure');

describe('parseRows', () => {
  it('converts raw case objects to normalized listing shape', () => {
    const rows = [{
      case_number: '2024CV1234',
      defendant: 'JOHNSON MARY E',
      plaintiff: 'First National Bank',
      filing_date: '2024-03-15',
      address: '789 Pine St, Youngstown OH 44503',
    }];

    const results = parseRows(rows);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      address: '789 Pine St, Youngstown OH 44503',
      owner_name: 'JOHNSON MARY E',
      signal_type: 'pre_foreclosure',
      asking_price: null,
      estimated_value: null,
      arv: null,
      fair_offer: null,
      comparables: null,
      contact_info: null,
      source_url: 'https://ecourts.mahoningcountyoh.gov/eservices/',
      raw: {
        case_number: '2024CV1234',
        filing_date: '2024-03-15',
        plaintiff: 'First National Bank',
      },
    });
  });

  it('filters out rows with empty address', () => {
    const rows = [{ case_number: '2024CV9999', defendant: 'DOE JOHN', address: '' }];
    expect(parseRows(rows)).toEqual([]);
  });

  it('sets owner_name to null when defendant is empty', () => {
    const rows = [{
      case_number: '2024CV0001',
      defendant: '',
      plaintiff: 'Bank',
      filing_date: '2024-01-01',
      address: '1 Main St',
    }];
    expect(parseRows(rows)[0].owner_name).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/scrapers/mahoning-preforeclosure.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../../src/scrapers/mahoning-preforeclosure'`

- [ ] **Step 3: Create src/scrapers/mahoning-preforeclosure.js**

```js
const { launchBrowser, delay } = require('../utils/browser');

const SOURCE_URL = 'https://ecourts.mahoningcountyoh.gov/eservices/';
const MAX_PAGES = 10;

function parseRows(rows) {
  return rows
    .filter(r => r.address && r.address.trim())
    .map(r => ({
      address: r.address.trim(),
      owner_name: r.defendant && r.defendant.trim() ? r.defendant.trim() : null,
      signal_type: 'pre_foreclosure',
      asking_price: null,
      estimated_value: null,
      arv: null,
      fair_offer: null,
      comparables: null,
      contact_info: null,
      source_url: SOURCE_URL,
      raw: {
        case_number: r.case_number || null,
        filing_date: r.filing_date || null,
        plaintiff: r.plaintiff || null,
      },
    }));
}

async function scrape() {
  const { browser, context } = await launchBrowser();
  const rawRows = [];

  try {
    const page = await context.newPage();
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await delay();

    // Navigate to public case search
    const searchLink = await page.$('a:text("Case Search"), a:text("Public Access"), a[href*="search"]');
    if (searchLink) {
      await searchLink.click();
      await page.waitForLoadState('networkidle');
      await delay();
    }

    // Select Civil division and Foreclosure case type
    const divisionSelect = await page.$('select[name*="division"], select[name*="Division"], #division');
    if (divisionSelect) {
      await page.selectOption(divisionSelect, { label: 'Civil' });
      await delay();
    }
    const caseTypeSelect = await page.$('select[name*="caseType"], select[name*="CaseType"], #caseType');
    if (caseTypeSelect) {
      await page.selectOption(caseTypeSelect, { label: 'Foreclosure' });
      await delay();
    }

    await page.click('input[type="submit"], button[type="submit"], button:text("Search")');
    await page.waitForLoadState('networkidle');
    await delay();

    for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
      const tableExists = await page.$('table').catch(() => null);
      if (!tableExists) break;

      const caseLinks = await page.$$eval('table tbody tr td a', links =>
        links.map(a => ({
          case_number: a.textContent.trim(),
          href: a.getAttribute('href'),
        })).filter(l => l.case_number)
      );

      if (caseLinks.length === 0) break;

      for (const { case_number, href } of caseLinks) {
        if (!href) continue;
        const detailUrl = href.startsWith('http')
          ? href
          : `https://ecourts.mahoningcountyoh.gov${href}`;
        const detailPage = await context.newPage();
        let row = { case_number, address: '', defendant: '', plaintiff: '', filing_date: '' };

        try {
          await detailPage.goto(detailUrl, { waitUntil: 'networkidle', timeout: 20000 });
          await delay();

          const cellData = await detailPage.$$eval('td', cells => {
            const data = {};
            for (let i = 0; i < cells.length - 1; i++) {
              const label = cells[i].textContent.trim().toLowerCase();
              const value = cells[i + 1]?.textContent?.trim() || '';
              if (/filed|filing date/.test(label)) data.filing_date = value;
              if (/defendant/.test(label) && !data.defendant) data.defendant = value;
              if (/plaintiff/.test(label) && !data.plaintiff) data.plaintiff = value;
              if (/address|property/.test(label) && !data.address) data.address = value;
            }
            return data;
          }).catch(() => ({}));

          row = { ...row, ...cellData };

          if (!row.address) {
            const caption = await detailPage.$eval(
              '.case-caption, h2, h3, .case-title',
              el => el.textContent.trim()
            ).catch(() => '');
            const addrMatch = caption.match(/\d+\s[\w\s]+,\s*\w[\w\s]*,\s*OH\s*\d{5}/i);
            if (addrMatch) row.address = addrMatch[0];
          }
        } catch {
          // non-fatal
        } finally {
          await detailPage.close();
        }

        rawRows.push(row);
        await delay();
      }

      const nextBtn = await page.$('a:text("Next"), .next-page, [aria-label="Next page"]');
      if (!nextBtn) break;
      await nextBtn.click();
      await page.waitForLoadState('networkidle');
      await delay();
    }
  } finally {
    await browser.close();
  }

  return parseRows(rawRows);
}

module.exports = { scrape, parseRows };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/scrapers/mahoning-preforeclosure.test.js --no-coverage`

Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scrapers/mahoning-preforeclosure.js tests/scrapers/mahoning-preforeclosure.test.js
git commit -m "feat: add Mahoning County pre-foreclosure scraper"
```

---

## Task 5: mahoning-probate.js

**Files:**
- Create: `tests/scrapers/mahoning-probate.test.js`
- Create: `src/scrapers/mahoning-probate.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/scrapers/mahoning-probate.test.js`:

```js
const { parseRows } = require('../../src/scrapers/mahoning-probate');

describe('parseRows', () => {
  it('converts raw probate cases to normalized shape with null address', () => {
    const rows = [{
      case_number: '2024ES5678',
      decedent_name: 'WILLIAMS ROBERT',
      fiduciary_name: 'Williams Sarah',
      filing_date: '2024-02-01',
    }];

    const results = parseRows(rows);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      address: null,
      owner_name: 'WILLIAMS ROBERT',
      signal_type: 'probate',
      asking_price: null,
      estimated_value: null,
      arv: null,
      fair_offer: null,
      comparables: null,
      contact_info: null,
      source_url: 'https://eprobate.mahoningcountyoh.gov',
      raw: {
        case_number: '2024ES5678',
        filing_date: '2024-02-01',
        fiduciary_name: 'Williams Sarah',
      },
    });
  });

  it('filters out rows with empty decedent_name', () => {
    const rows = [{ case_number: '2024ES0001', decedent_name: '', filing_date: '2024-01-01' }];
    expect(parseRows(rows)).toEqual([]);
  });

  it('handles missing fiduciary_name gracefully', () => {
    const rows = [{
      case_number: '2024ES9999',
      decedent_name: 'DOE JANE',
      filing_date: '2024-03-01',
    }];
    expect(parseRows(rows)[0].raw.fiduciary_name).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/scrapers/mahoning-probate.test.js --no-coverage`

Expected: FAIL — `Cannot find module '../../src/scrapers/mahoning-probate'`

- [ ] **Step 3: Create src/scrapers/mahoning-probate.js**

```js
const { launchBrowser, delay } = require('../utils/browser');

const SOURCE_URL = 'https://eprobate.mahoningcountyoh.gov';

function parseRows(rows) {
  return rows
    .filter(r => r.decedent_name && r.decedent_name.trim())
    .map(r => ({
      address: null,
      owner_name: r.decedent_name.trim(),
      signal_type: 'probate',
      asking_price: null,
      estimated_value: null,
      arv: null,
      fair_offer: null,
      comparables: null,
      contact_info: null,
      source_url: SOURCE_URL,
      raw: {
        case_number: r.case_number || null,
        filing_date: r.filing_date || null,
        fiduciary_name: r.fiduciary_name || null,
      },
    }));
}

async function scrape() {
  const { browser, context } = await launchBrowser();
  const rawRows = [];
  const fromDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  try {
    const page = await context.newPage();
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await delay();

    // Navigate to public access search
    const publicLink = await page.$('a:text("Public Access"), a:text("Search"), a[href*="search"]');
    if (publicLink) {
      await publicLink.click();
      await page.waitForLoadState('networkidle');
      await delay();
    }

    // Set case type to Estate/Administration
    const caseTypeSelect = await page.$('select[name*="caseType"], select[name*="CaseType"], #caseType');
    if (caseTypeSelect) {
      await page.selectOption(caseTypeSelect, { label: 'Estate' }).catch(async () => {
        await page.selectOption(caseTypeSelect, { label: 'Administration' }).catch(() => {});
      });
      await delay();
    }

    // Set from date to 90 days ago
    const fromDateInput = await page.$('input[name*="fromDate"], input[name*="startDate"], #fromDate');
    if (fromDateInput) {
      await fromDateInput.fill(fromDate);
      await delay();
    }

    await page.click('input[type="submit"], button[type="submit"], button:text("Search")');
    await page.waitForLoadState('networkidle');
    await delay();

    const tableExists = await page.$('table').catch(() => null);
    if (!tableExists) return [];

    const caseRows = await page.$$eval('table tbody tr', rows =>
      rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        return {
          case_number: cells[0]?.textContent?.trim() || '',
          decedent_name: cells[1]?.textContent?.trim() || '',
          filing_date: cells[2]?.textContent?.trim() || '',
          href: row.querySelector('a')?.getAttribute('href') || null,
        };
      })
    );

    for (const caseRow of caseRows) {
      if (!caseRow.decedent_name) continue;

      let fiduciary_name = null;
      if (caseRow.href) {
        const detailUrl = caseRow.href.startsWith('http')
          ? caseRow.href
          : `${SOURCE_URL}${caseRow.href}`;
        const detailPage = await context.newPage();
        try {
          await detailPage.goto(detailUrl, { waitUntil: 'networkidle', timeout: 20000 });
          await delay();
          fiduciary_name = await detailPage.$$eval('td', cells => {
            for (let i = 0; i < cells.length - 1; i++) {
              if (/fiduciary|executor|administrator/i.test(cells[i].textContent)) {
                return cells[i + 1]?.textContent?.trim() || null;
              }
            }
            return null;
          }).catch(() => null);
        } catch {
          // non-fatal
        } finally {
          await detailPage.close();
        }
      }

      rawRows.push({ ...caseRow, fiduciary_name });
      await delay();
    }
  } finally {
    await browser.close();
  }

  return parseRows(rawRows);
}

module.exports = { scrape, parseRows };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/scrapers/mahoning-probate.test.js --no-coverage`

Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scrapers/mahoning-probate.js tests/scrapers/mahoning-probate.test.js
git commit -m "feat: add Mahoning County probate scraper"
```

---

## Task 6: zillow.js

**Files:**
- Create: `tests/scrapers/zillow.test.js`
- Replace: `src/scrapers/zillow.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/scrapers/zillow.test.js`:

```js
const { parseListings, parseComps } = require('../../src/scrapers/zillow');

const FSBO_URL = 'https://www.zillow.com/mahoning-county-oh/fsbo/';

describe('parseListings', () => {
  it('extracts listings from __NEXT_DATA__ structure', () => {
    const nextData = {
      props: {
        pageProps: {
          searchPageState: {
            cat1: {
              searchResults: {
                listResults: [{
                  address: '123 Oak St, Youngstown, OH 44502',
                  unformattedPrice: 85000,
                  zestimate: 90000,
                  beds: 3,
                  baths: 1,
                  area: 1200,
                  detailUrl: '/homedetails/123-oak/12345_zpid/',
                  zpid: 12345,
                }],
              },
            },
          },
        },
      },
    };

    const results = parseListings(nextData);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      address: '123 Oak St, Youngstown, OH 44502',
      signal_type: 'fsbo_zillow',
      asking_price: 85000,
      estimated_value: 90000,
      arv: null,
      fair_offer: null,
      comparables: null,
      source_url: 'https://www.zillow.com/homedetails/123-oak/12345_zpid/',
      raw: { beds: 3, baths: 1, sqft: 1200, zillow_id: 12345 },
    });
  });

  it('returns empty array when listResults is missing', () => {
    expect(parseListings({})).toEqual([]);
    expect(parseListings(null)).toEqual([]);
  });

  it('filters out items with no address', () => {
    const nextData = {
      props: { pageProps: { searchPageState: { cat1: { searchResults: {
        listResults: [{ unformattedPrice: 85000 }],
      } } } } },
    };
    expect(parseListings(nextData)).toEqual([]);
  });

  it('falls back to FSBO_URL when detailUrl is missing', () => {
    const nextData = {
      props: { pageProps: { searchPageState: { cat1: { searchResults: {
        listResults: [{ address: '1 Main St', unformattedPrice: 50000 }],
      } } } } },
    };
    expect(parseListings(nextData)[0].source_url).toBe(FSBO_URL);
  });
});

describe('parseComps', () => {
  it('extracts sold comps from gdpClientCache', () => {
    const nextData = {
      props: {
        pageProps: {
          componentProps: {
            gdpClientCache: {
              'ForSale_12345': {
                property: {
                  nearbyHomes: [{
                    price: 75000,
                    hdpData: {
                      homeInfo: {
                        streetAddress: '456 Elm St',
                        dateSold: 1700000000000,
                        bedrooms: 3,
                        bathrooms: 1,
                        livingArea: 1100,
                      },
                    },
                  }],
                },
              },
            },
          },
        },
      },
    };

    const comps = parseComps(nextData);
    expect(comps).toHaveLength(1);
    expect(comps[0]).toMatchObject({
      address: '456 Elm St',
      sold_price: 75000,
      beds: 3,
      baths: 1,
      sqft: 1100,
    });
  });

  it('returns null when gdpClientCache is missing', () => {
    expect(parseComps({})).toBeNull();
    expect(parseComps(null)).toBeNull();
  });

  it('returns null when nearbyHomes is empty', () => {
    const nextData = {
      props: { pageProps: { componentProps: { gdpClientCache: {
        key: { property: { nearbyHomes: [] } },
      } } } },
    };
    expect(parseComps(nextData)).toBeNull();
  });

  it('filters out nearby homes missing price or dateSold', () => {
    const nextData = {
      props: { pageProps: { componentProps: { gdpClientCache: {
        key: { property: { nearbyHomes: [
          { price: null, hdpData: { homeInfo: { streetAddress: 'No price' } } },
          { price: 50000, hdpData: { homeInfo: { streetAddress: 'No date' } } },
        ] } },
      } } } },
    };
    expect(parseComps(nextData)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/scrapers/zillow.test.js --no-coverage`

Expected: FAIL — `parseListings is not a function` (stub has no exports matching)

- [ ] **Step 3: Replace src/scrapers/zillow.js**

```js
const { launchBrowser, delay } = require('../utils/browser');

const FSBO_URL = 'https://www.zillow.com/mahoning-county-oh/fsbo/';

function parseListings(nextData) {
  const listResults =
    nextData?.props?.pageProps?.searchPageState?.cat1?.searchResults?.listResults || [];

  return listResults
    .filter(item => item.address)
    .map(item => ({
      address: item.address,
      owner_name: null,
      signal_type: 'fsbo_zillow',
      asking_price: item.unformattedPrice || null,
      estimated_value: item.zestimate || null,
      arv: null,
      fair_offer: null,
      comparables: null,
      contact_info: null,
      source_url: item.detailUrl
        ? `https://www.zillow.com${item.detailUrl}`
        : FSBO_URL,
      raw: {
        beds: item.beds || null,
        baths: item.baths || null,
        sqft: item.area || null,
        zillow_id: item.zpid || null,
      },
    }));
}

function parseComps(nextData) {
  if (!nextData) return null;
  const gdpCache = nextData?.props?.pageProps?.componentProps?.gdpClientCache;
  if (!gdpCache) return null;

  const cacheKey = Object.keys(gdpCache)[0];
  const nearbyHomes = gdpCache?.[cacheKey]?.property?.nearbyHomes;
  if (!nearbyHomes?.length) return null;

  const comps = nearbyHomes
    .filter(h => h.price && h.hdpData?.homeInfo?.dateSold)
    .map(h => ({
      address: h.hdpData?.homeInfo?.streetAddress || null,
      sold_price: h.price || null,
      sold_date: h.hdpData?.homeInfo?.dateSold || null,
      beds: h.hdpData?.homeInfo?.bedrooms || null,
      baths: h.hdpData?.homeInfo?.bathrooms || null,
      sqft: h.hdpData?.homeInfo?.livingArea || null,
    }));

  return comps.length > 0 ? comps : null;
}

async function extractNextData(page) {
  return page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch { return null; }
  });
}

async function scrape() {
  const { browser, context } = await launchBrowser();
  const listings = [];

  try {
    const page = await context.newPage();
    await page.goto(FSBO_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await delay();

    const nextData = await extractNextData(page);
    if (!nextData) {
      console.warn('[zillow] could not extract __NEXT_DATA__ from FSBO page');
      return listings;
    }

    const rawListings = parseListings(nextData);

    for (const listing of rawListings) {
      if (!listing.source_url || listing.source_url === FSBO_URL) {
        listings.push(listing);
        continue;
      }

      const detailPage = await context.newPage();
      try {
        await detailPage.goto(listing.source_url, { waitUntil: 'networkidle', timeout: 30000 });
        await delay();
        const detailNextData = await extractNextData(detailPage);
        listing.comparables = detailNextData ? parseComps(detailNextData) : null;
      } catch {
        listing.comparables = null;
      } finally {
        await detailPage.close();
      }

      listings.push(listing);
      await delay();
    }
  } finally {
    await browser.close();
  }

  return listings;
}

module.exports = { scrape, parseListings, parseComps };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/scrapers/zillow.test.js --no-coverage`

Expected: PASS — 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scrapers/zillow.js tests/scrapers/zillow.test.js
git commit -m "feat: implement Zillow FSBO scraper with sold comps"
```

---

## Task 7: craigslist.js

**Files:**
- Create: `tests/scrapers/craigslist.test.js`
- Replace: `src/scrapers/craigslist.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/scrapers/craigslist.test.js`:

```js
const { parseListings, extractPhone } = require('../../src/scrapers/craigslist');

describe('extractPhone', () => {
  it('extracts a hyphen-separated phone number', () => {
    expect(extractPhone('Call 330-555-1234 for info')).toBe('330-555-1234');
  });

  it('extracts a parenthesized phone number', () => {
    expect(extractPhone('Contact (330) 555-1234')).toBe('(330) 555-1234');
  });

  it('returns null when no phone number found', () => {
    expect(extractPhone('No contact info here')).toBeNull();
  });

  it('returns null for null or empty input', () => {
    expect(extractPhone(null)).toBeNull();
    expect(extractPhone('')).toBeNull();
  });
});

describe('parseListings', () => {
  it('normalizes raw posts into listing shape', () => {
    const posts = [{
      href: 'https://youngstown.craigslist.org/rea/d/house/123.html',
      title: '3BR/1BA house FSBO',
      price: '$85,000',
      location: 'Youngstown',
      date: '2026-05-10T12:00:00',
      description: 'Nice house. Call 330-555-9876 to schedule.',
    }];

    const results = parseListings(posts);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      address: 'Youngstown',
      owner_name: null,
      signal_type: 'fsbo_craigslist',
      asking_price: 85000,
      estimated_value: null,
      arv: null,
      fair_offer: null,
      comparables: null,
      contact_info: '330-555-9876',
      source_url: 'https://youngstown.craigslist.org/rea/d/house/123.html',
      raw: {
        post_title: '3BR/1BA house FSBO',
        post_date: '2026-05-10T12:00:00',
        description: 'Nice house. Call 330-555-9876 to schedule.',
      },
    });
  });

  it('filters out posts missing href or title', () => {
    expect(parseListings([{ price: '$50,000' }])).toEqual([]);
    expect(parseListings([{ href: 'http://x.com', price: '$50,000' }])).toEqual([]);
  });

  it('sets asking_price to null when price is absent', () => {
    const posts = [{
      href: 'https://youngstown.craigslist.org/rea/456.html',
      title: 'House - price negotiable',
    }];
    expect(parseListings(posts)[0].asking_price).toBeNull();
  });

  it('sets contact_info to null when no phone in description', () => {
    const posts = [{
      href: 'https://youngstown.craigslist.org/rea/789.html',
      title: 'House for sale',
      description: 'Email only, no calls please.',
    }];
    expect(parseListings(posts)[0].contact_info).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/scrapers/craigslist.test.js --no-coverage`

Expected: FAIL — `extractPhone is not a function`

- [ ] **Step 3: Replace src/scrapers/craigslist.js**

```js
const { launchBrowser, delay } = require('../utils/browser');

const BASE_URL = 'https://youngstown.craigslist.org/search/rea?purveyor=owner';

function extractPhone(text) {
  if (!text) return null;
  const match = text.match(/(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
  return match ? match[1] : null;
}

function parseListings(posts) {
  return posts
    .filter(p => p.href && p.title)
    .map(p => ({
      address: p.location || null,
      owner_name: null,
      signal_type: 'fsbo_craigslist',
      asking_price: p.price ? parseInt(p.price.replace(/[^0-9]/g, ''), 10) || null : null,
      estimated_value: null,
      arv: null,
      fair_offer: null,
      comparables: null,
      contact_info: p.description ? extractPhone(p.description) : null,
      source_url: p.href,
      raw: {
        post_title: p.title,
        post_date: p.date || null,
        description: p.description || null,
      },
    }));
}

async function scrape() {
  const { browser, context } = await launchBrowser();
  const rawPosts = [];

  try {
    const page = await context.newPage();
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const url = offset === 0 ? BASE_URL : `${BASE_URL}&s=${offset}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await delay();

      const items = await page.$$eval(
        'ol.rows li.result-row, li.cl-search-result, li[data-pid]',
        els => els.map(el => ({
          href: el.querySelector('a.result-title, a.posting-title, a[href*="/rea/"]')
            ?.getAttribute('href') || null,
          title: el.querySelector('a.result-title, a.posting-title')
            ?.textContent?.trim() || '',
          price: el.querySelector('.result-price, .priceinfo')
            ?.textContent?.trim() || '',
          location: el.querySelector('.result-hood, .meta-when-where')
            ?.textContent?.trim().replace(/[()]/g, '').trim() || '',
          date: el.querySelector('time')?.getAttribute('datetime') || '',
        }))
      );

      if (items.length === 0) { hasMore = false; break; }

      for (const item of items) {
        if (!item.href) continue;
        const postPage = await context.newPage();
        let description = '';
        try {
          await postPage.goto(item.href, { waitUntil: 'networkidle', timeout: 20000 });
          await delay();
          description = await postPage.$eval(
            '#postingbody, .body, section.postingbody',
            el => el.textContent.trim()
          ).catch(() => '');
        } catch {
          // non-fatal
        } finally {
          await postPage.close();
        }
        rawPosts.push({ ...item, description });
        await delay();
      }

      offset += 120;
    }
  } finally {
    await browser.close();
  }

  return parseListings(rawPosts);
}

module.exports = { scrape, parseListings, extractPhone };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/scrapers/craigslist.test.js --no-coverage`

Expected: PASS — 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scrapers/craigslist.js tests/scrapers/craigslist.test.js
git commit -m "feat: implement Craigslist FSBO scraper"
```

---

## Task 8: collect.js

**Files:**
- Create: `tests/pipeline/collect.test.js`
- Replace: `src/pipeline/collect.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/pipeline/collect.test.js`:

```js
jest.mock('../../src/scrapers/mahoning-tax-delinquent', () => ({ scrape: jest.fn() }));
jest.mock('../../src/scrapers/mahoning-preforeclosure', () => ({ scrape: jest.fn() }));
jest.mock('../../src/scrapers/mahoning-probate', () => ({ scrape: jest.fn() }));
jest.mock('../../src/scrapers/zillow', () => ({ scrape: jest.fn() }));
jest.mock('../../src/scrapers/craigslist', () => ({ scrape: jest.fn() }));

const { scrape: taxScrape } = require('../../src/scrapers/mahoning-tax-delinquent');
const { scrape: preforeclosureScrape } = require('../../src/scrapers/mahoning-preforeclosure');
const { scrape: probateScrape } = require('../../src/scrapers/mahoning-probate');
const { scrape: zillowScrape } = require('../../src/scrapers/zillow');
const { scrape: craigslistScrape } = require('../../src/scrapers/craigslist');
const { collect } = require('../../src/pipeline/collect');

describe('collect', () => {
  beforeEach(() => jest.clearAllMocks());

  it('merges results from all five scrapers', async () => {
    taxScrape.mockResolvedValue([{ signal_type: 'tax_delinquent' }]);
    preforeclosureScrape.mockResolvedValue([{ signal_type: 'pre_foreclosure' }]);
    probateScrape.mockResolvedValue([{ signal_type: 'probate' }]);
    zillowScrape.mockResolvedValue([{ signal_type: 'fsbo_zillow' }]);
    craigslistScrape.mockResolvedValue([{ signal_type: 'fsbo_craigslist' }]);

    const results = await collect();

    expect(results).toHaveLength(5);
    expect(results.map(r => r.signal_type)).toEqual(
      expect.arrayContaining([
        'tax_delinquent', 'pre_foreclosure', 'probate', 'fsbo_zillow', 'fsbo_craigslist',
      ])
    );
  });

  it('excludes results from a failing scraper without throwing', async () => {
    taxScrape.mockRejectedValue(new Error('site unreachable'));
    preforeclosureScrape.mockResolvedValue([{ signal_type: 'pre_foreclosure' }]);
    probateScrape.mockResolvedValue([]);
    zillowScrape.mockResolvedValue([]);
    craigslistScrape.mockResolvedValue([]);

    const results = await collect();

    expect(results).toHaveLength(1);
    expect(results[0].signal_type).toBe('pre_foreclosure');
  });

  it('returns empty array when all scrapers fail', async () => {
    [taxScrape, preforeclosureScrape, probateScrape, zillowScrape, craigslistScrape]
      .forEach(s => s.mockRejectedValue(new Error('fail')));

    const results = await collect();
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/pipeline/collect.test.js --no-coverage`

Expected: FAIL — collect returns `[]` regardless (stub returns empty array)

- [ ] **Step 3: Replace src/pipeline/collect.js**

```js
const { scrape: scrapeTaxDelinquent } = require('../scrapers/mahoning-tax-delinquent');
const { scrape: scrapePreforeclosure } = require('../scrapers/mahoning-preforeclosure');
const { scrape: scrapeProbate } = require('../scrapers/mahoning-probate');
const { scrape: scrapeZillow } = require('../scrapers/zillow');
const { scrape: scrapeCraigslist } = require('../scrapers/craigslist');

const SCRAPER_NAMES = [
  'mahoning-tax-delinquent',
  'mahoning-preforeclosure',
  'mahoning-probate',
  'zillow',
  'craigslist',
];

async function collect() {
  const results = await Promise.allSettled([
    scrapeTaxDelinquent(),
    scrapePreforeclosure(),
    scrapeProbate(),
    scrapeZillow(),
    scrapeCraigslist(),
  ]);

  return results.flatMap((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[collect] ${SCRAPER_NAMES[i]} failed:`, r.reason.message);
      return [];
    }
    return r.value;
  });
}

module.exports = { collect };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/pipeline/collect.test.js --no-coverage`

Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/collect.js tests/pipeline/collect.test.js
git commit -m "feat: wire all five scrapers into collect pipeline"
```

---

## Task 9: analyze.js — probate address resolution

**Files:**
- Create: `tests/pipeline/analyze.test.js`
- Modify: `src/pipeline/analyze.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/pipeline/analyze.test.js`:

```js
jest.mock('../../src/utils/browser', () => ({
  launchBrowser: jest.fn(),
  delay: jest.fn().mockResolvedValue(undefined),
}));

const browser = require('../../src/utils/browser');
const { analyze, normalizeTokens, tokenOverlapRatio } = require('../../src/pipeline/analyze');

describe('normalizeTokens', () => {
  it('lowercases, strips punctuation, and returns a Set', () => {
    expect(normalizeTokens('SMITH, JOHN A.')).toEqual(new Set(['smith', 'john', 'a']));
  });

  it('handles extra spaces', () => {
    expect(normalizeTokens('  JONES  MARY  ')).toEqual(new Set(['jones', 'mary']));
  });
});

describe('tokenOverlapRatio', () => {
  it('returns 1.0 for exact match after normalization', () => {
    expect(tokenOverlapRatio('John Smith', 'SMITH JOHN')).toBe(1.0);
  });

  it('returns 1.0 when shorter name is fully covered by longer', () => {
    expect(tokenOverlapRatio('SMITH JOHN A', 'John Smith')).toBe(1.0);
  });

  it('returns 0 for completely different names', () => {
    expect(tokenOverlapRatio('John Smith', 'Mary Johnson')).toBe(0);
  });

  it('returns partial overlap for partially matching names', () => {
    const ratio = tokenOverlapRatio('John Smith Jr', 'John Williams');
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
  });

  it('returns 0 when either name is empty', () => {
    expect(tokenOverlapRatio('', 'John Smith')).toBe(0);
    expect(tokenOverlapRatio('John Smith', '')).toBe(0);
  });
});

describe('analyze', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds score: null to all listings', async () => {
    browser.launchBrowser.mockResolvedValue({
      browser: { close: jest.fn() },
      context: { newPage: jest.fn() },
    });

    const listings = [
      { signal_type: 'tax_delinquent', address: '1 Main', owner_name: 'Smith', raw: {} },
    ];
    const result = await analyze(listings);
    expect(result[0].score).toBeNull();
  });

  it('does not launch browser when no probate listings need resolution', async () => {
    const listings = [
      { signal_type: 'fsbo_zillow', address: '1 Main', owner_name: null, raw: {} },
      { signal_type: 'probate', address: '2 Oak Ave', owner_name: 'Doe', raw: {} },
    ];
    await analyze(listings);
    expect(browser.launchBrowser).not.toHaveBeenCalled();
  });

  it('launches browser to resolve probate listings with null address', async () => {
    const mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      $$eval: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const mockContext = { newPage: jest.fn().mockResolvedValue(mockPage) };
    const mockBrowserInstance = { close: jest.fn().mockResolvedValue(undefined) };
    browser.launchBrowser.mockResolvedValue({
      browser: mockBrowserInstance,
      context: mockContext,
    });

    const listings = [
      { signal_type: 'probate', address: null, owner_name: 'WILLIAMS ROBERT', raw: {} },
    ];
    await analyze(listings);
    expect(browser.launchBrowser).toHaveBeenCalledTimes(1);
    expect(mockBrowserInstance.close).toHaveBeenCalled();
  });

  it('sets address_resolution_status on probate listings', async () => {
    const mockPage = {
      goto: jest.fn().mockResolvedValue(undefined),
      $$eval: jest.fn().mockResolvedValue([
        { owner: 'WILLIAMS ROBERT', address: '123 Oak St, Youngstown OH 44502' },
      ]),
      close: jest.fn().mockResolvedValue(undefined),
    };
    browser.launchBrowser.mockResolvedValue({
      browser: { close: jest.fn() },
      context: { newPage: jest.fn().mockResolvedValue(mockPage) },
    });

    const listings = [
      { signal_type: 'probate', address: null, owner_name: 'WILLIAMS ROBERT', raw: {} },
    ];
    const result = await analyze(listings);
    expect(result[0].raw.address_resolution_status).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/pipeline/analyze.test.js --no-coverage`

Expected: FAIL — `normalizeTokens is not a function` (stub doesn't export these)

- [ ] **Step 3: Replace src/pipeline/analyze.js**

```js
const { launchBrowser, delay } = require('../utils/browser');

const AUDITOR_SEARCH = 'https://auditor.mahoningcountyoh.gov/SearchResults';

function normalizeTokens(name) {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
  );
}

function tokenOverlapRatio(nameA, nameB) {
  const setA = normalizeTokens(nameA);
  const setB = normalizeTokens(nameB);
  const intersection = [...setA].filter(t => setB.has(t)).length;
  const smaller = Math.min(setA.size, setB.size);
  return smaller === 0 ? 0 : intersection / smaller;
}

async function resolveProbateAddress(ownerName, context) {
  const searchUrl = `${AUDITOR_SEARCH}?searchTerm=${encodeURIComponent(ownerName)}&appid=&Command=Combined`;
  const page = await context.newPage();
  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 20000 });
    await delay();

    const results = await page.$$eval('table tbody tr', rows =>
      rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        return {
          owner: cells[1]?.textContent?.trim() || '',
          address: cells[0]?.textContent?.trim() || cells[2]?.textContent?.trim() || '',
        };
      }).filter(r => r.address)
    ).catch(() => []);

    const matches = results.filter(r => tokenOverlapRatio(ownerName, r.owner) >= 0.8);

    if (matches.length === 1) return { address: matches[0].address, status: 'resolved' };
    if (matches.length === 0) return { address: null, status: 'unresolved' };
    return { address: null, status: 'ambiguous' };
  } catch (err) {
    console.warn(`[analyze] Address resolution failed for "${ownerName}":`, err.message);
    return { address: null, status: 'error' };
  } finally {
    await page.close();
  }
}

async function analyze(listings) {
  const probateUnresolved = listings.filter(
    l => l.signal_type === 'probate' && !l.address && l.owner_name
  );

  if (probateUnresolved.length > 0) {
    const { browser: browserInstance, context } = await launchBrowser();
    try {
      for (const listing of probateUnresolved) {
        const { address, status } = await resolveProbateAddress(listing.owner_name, context);
        listing.address = address;
        listing.raw = { ...listing.raw, address_resolution_status: status };
      }
    } finally {
      await browserInstance.close();
    }
  }

  return listings.map(listing => ({ ...listing, score: null }));
}

module.exports = { analyze, normalizeTokens, tokenOverlapRatio };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/pipeline/analyze.test.js --no-coverage`

Expected: PASS — all tests pass.

- [ ] **Step 5: Run full test suite**

Run: `npx jest --no-coverage`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/analyze.js tests/pipeline/analyze.test.js
git commit -m "feat: add probate address resolution with fuzzy name matching to analyze"
```

---

## Task 10: Database migration — deals table

**Files:**
- Create: `src/db/migrations/<timestamp>_create_deals.js`

- [ ] **Step 1: Generate the migration filename timestamp**

Run: `node -e "console.log(new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14))"`

Expected output: a 14-digit string like `20260514120000`. Use this exact value as `<timestamp>` in the filename below.

- [ ] **Step 2: Create src/db/migrations/<timestamp>_create_deals.js**

Replace `<timestamp>` in the filename with the value from Step 1.

```js
exports.up = function(knex) {
  return knex.schema.createTable('deals', t => {
    t.increments('id').primary();
    t.text('address').notNullable();
    t.text('owner_name');
    t.text('signal_type').notNullable();
    t.integer('asking_price');
    t.integer('estimated_value');
    t.integer('arv');
    t.integer('fair_offer');
    t.jsonb('comparables');
    t.text('contact_info');
    t.text('source_url');
    t.jsonb('raw');
    t.integer('score');
    t.timestamps(true, true);
    t.unique(['address', 'signal_type']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('deals');
};
```

- [ ] **Step 3: Verify migration file syntax**

Run: `node --check src/db/migrations/<timestamp>_create_deals.js`

Expected: No output (syntax valid).

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/
git commit -m "feat: add deals table migration"
```

---

## Final Checklist

After all tasks complete, verify:

- [ ] `npx jest --no-coverage` — all tests pass
- [ ] `node --check src/db/migrations/*_create_deals.js` — no syntax errors
- [ ] `node --check src/scrapers/mahoning-tax-delinquent.js src/scrapers/mahoning-preforeclosure.js src/scrapers/mahoning-probate.js src/scrapers/zillow.js src/scrapers/craigslist.js` — no syntax errors
- [ ] `node --check src/pipeline/collect.js src/pipeline/analyze.js` — no syntax errors
- [ ] `git log --oneline` — shows 10 new commits since the scaffold
