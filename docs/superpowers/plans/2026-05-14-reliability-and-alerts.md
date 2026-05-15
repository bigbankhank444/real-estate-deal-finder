# Scraper Reliability, Craigslist Fix & Email Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add retry logic to scraper navigations, fix Craigslist's broken selector, and document the GitHub Secrets needed to activate SendGrid email alerts.

**Architecture:** A single `withRetry` utility wraps the initial `page.goto` call in each scraper. The Craigslist scraper's `page.evaluate` block is updated to use a multi-selector fallback chain that handles both old and new Craigslist UI. Email alerts require no code changes — only GitHub Secrets.

**Tech Stack:** Node.js, Playwright, Jest (existing test runner at `npm test`)

---

## File Map

| File | Action |
|---|---|
| `src/utils/retry.js` | **Create** — `withRetry(fn, retries, delayMs)` utility |
| `tests/utils/retry.test.js` | **Create** — unit tests for `withRetry` |
| `src/scrapers/zillow.js` | **Modify** — require retry; wrap navigate+extract block |
| `src/scrapers/mahoning-tax-delinquent.js` | **Modify** — require retry; wrap `page.goto` |
| `src/scrapers/mahoning-preforeclosure.js` | **Modify** — require retry; wrap `page.goto` |
| `src/scrapers/mahoning-probate.js` | **Modify** — require retry; wrap `page.goto` |
| `src/scrapers/craigslist.js` | **Modify** — replace evaluate selector block; add diagnostic log |

---

## Task 1: Create `src/utils/retry.js` with tests

**Files:**
- Create: `src/utils/retry.js`
- Create: `tests/utils/retry.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/utils/retry.test.js`:

```js
'use strict';

const { withRetry } = require('../../src/utils/retry');

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('withRetry: resolves immediately on first success', async () => {
  const fn = jest.fn().mockResolvedValue('ok');
  const result = await withRetry(fn, 3, 0);
  expect(result).toBe('ok');
  expect(fn).toHaveBeenCalledTimes(1);
});

test('withRetry: retries on failure and resolves on second attempt', async () => {
  const fn = jest.fn()
    .mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValue('ok');
  const result = await withRetry(fn, 3, 0);
  expect(result).toBe('ok');
  expect(fn).toHaveBeenCalledTimes(2);
});

test('withRetry: throws after all retries exhausted', async () => {
  const err = new Error('always fails');
  const fn = jest.fn().mockRejectedValue(err);
  await expect(withRetry(fn, 3, 0)).rejects.toThrow('always fails');
  expect(fn).toHaveBeenCalledTimes(3);
});

test('withRetry: retries=1 means one attempt only, no retries', async () => {
  const fn = jest.fn().mockRejectedValue(new Error('fail'));
  await expect(withRetry(fn, 1, 0)).rejects.toThrow('fail');
  expect(fn).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npm test -- --testPathPattern=retry
```

Expected: 4 failures with "Cannot find module '../../src/utils/retry'"

- [ ] **Step 3: Create `src/utils/retry.js`**

```js
'use strict';

async function withRetry(fn, retries = 3, delayMs = 5000) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const wait = delayMs * attempt;
        console.warn(`[retry] Attempt ${attempt}/${retries} failed: ${err.message}. Retrying in ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

module.exports = { withRetry };
```

- [ ] **Step 4: Run tests to confirm they pass**

```
npm test -- --testPathPattern=retry
```

Expected: 4 passing, 0 failing

- [ ] **Step 5: Commit**

```
git add src/utils/retry.js tests/utils/retry.test.js
git commit -m "feat: add withRetry utility with linear-backoff retry logic"
```

---

## Task 2: Apply retry to Zillow scraper

**Files:**
- Modify: `src/scrapers/zillow.js`

The Zillow retry wraps both `page.goto` and `extractNextData` in a single thunk so that a page that loads but returns no `__NEXT_DATA__` (a soft block) also triggers a retry.

- [ ] **Step 1: Add the require**

In `src/scrapers/zillow.js`, after line 3 (`const { launchBrowser } = require('../utils/browser');`), add:

```js
const { withRetry } = require('../utils/retry');
```

- [ ] **Step 2: Replace the navigate+extract block**

In `src/scrapers/zillow.js`, find and replace:

```js
    // ── Step 1: Navigate to the FSBO search page ──────────────────────────
    await page.goto(FSBO_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // ── Step 2: Extract __NEXT_DATA__ from search page ───────────────────
    const searchData = await extractNextData(page);

    if (!searchData) {
      console.warn('[zillow] __NEXT_DATA__ not found on FSBO page — Zillow may have blocked this request.');
      return [];
    }
```

Replace with:

```js
    // ── Step 1: Navigate to the FSBO search page (with retry) ────────────
    let searchData;
    try {
      searchData = await withRetry(async () => {
        await page.goto(FSBO_URL, { waitUntil: 'networkidle', timeout: 60_000 });
        const data = await extractNextData(page);
        if (!data) throw new Error('__NEXT_DATA__ not found — Zillow may have blocked this request');
        return data;
      }, 3, 5000);
    } catch (err) {
      console.warn(`[zillow] All navigation attempts failed: ${err.message}`);
      return [];
    }
```

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```
npm test
```

Expected: all tests pass (no Zillow-specific unit tests exist; the test suite tests other pure functions)

- [ ] **Step 4: Commit**

```
git add src/scrapers/zillow.js
git commit -m "feat: add retry logic to Zillow FSBO page navigation"
```

---

## Task 3: Apply retry to mahoning-tax-delinquent scraper

**Files:**
- Modify: `src/scrapers/mahoning-tax-delinquent.js`

- [ ] **Step 1: Add the require**

In `src/scrapers/mahoning-tax-delinquent.js`, after line 3 (`const { launchBrowser } = require('../utils/browser');`), add:

```js
const { withRetry } = require('../utils/retry');
```

- [ ] **Step 2: Wrap the main page.goto**

Find:

```js
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // Wait for the results table to appear
```

Replace with:

```js
    await withRetry(
      () => page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60_000 }),
      3, 5000
    );

    // Wait for the results table to appear
```

- [ ] **Step 3: Run tests**

```
npm test
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```
git add src/scrapers/mahoning-tax-delinquent.js
git commit -m "feat: add retry logic to Mahoning tax-delinquent page navigation"
```

---

## Task 4: Apply retry to mahoning-preforeclosure scraper

**Files:**
- Modify: `src/scrapers/mahoning-preforeclosure.js`

- [ ] **Step 1: Add the require**

In `src/scrapers/mahoning-preforeclosure.js`, after line 3 (`const { launchBrowser } = require('../utils/browser');`), add:

```js
const { withRetry } = require('../utils/retry');
```

- [ ] **Step 2: Wrap the main page.goto**

Find (around line 224):

```js
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // ------------------------------------------------------------------
```

Replace with:

```js
    await withRetry(
      () => page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60_000 }),
      3, 5000
    );

    // ------------------------------------------------------------------
```

- [ ] **Step 3: Run tests**

```
npm test
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```
git add src/scrapers/mahoning-preforeclosure.js
git commit -m "feat: add retry logic to Mahoning pre-foreclosure page navigation"
```

---

## Task 5: Apply retry to mahoning-probate scraper

**Files:**
- Modify: `src/scrapers/mahoning-probate.js`

- [ ] **Step 1: Add the require**

In `src/scrapers/mahoning-probate.js`, after line 3 (`const { launchBrowser } = require('../utils/browser');`), add:

```js
const { withRetry } = require('../utils/retry');
```

- [ ] **Step 2: Wrap the main page.goto**

Find (around line 99):

```js
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // ----------------------------------------------------------------
```

Replace with:

```js
    await withRetry(
      () => page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60_000 }),
      3, 5000
    );

    // ----------------------------------------------------------------
```

- [ ] **Step 3: Run tests**

```
npm test
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```
git add src/scrapers/mahoning-probate.js
git commit -m "feat: add retry logic to Mahoning probate page navigation"
```

---

## Task 6: Fix Craigslist selector + add diagnostic logging

**Files:**
- Modify: `src/scrapers/craigslist.js`

Craigslist redesigned their search UI. The old `ol.cl-search-results` wrapper is gone; results now render as `li.cl-search-result` elements. The fix adds a three-tier fallback chain inside `page.evaluate`.

- [ ] **Step 1: Verify existing Craigslist tests still pass before any changes**

```
npm test -- --testPathPattern=craigslist
```

Expected: 4 passing (they test `parseListings`, a pure function unaffected by this change — confirm they pass as a baseline)

- [ ] **Step 2: Replace the evaluate block and the zero-items log**

In `src/scrapers/craigslist.js`, find the entire block from the comment through the zero-items break:

```js
      // ── Collect list items ─────────────────────────────────────────────────
      // Craigslist renders server-side HTML; results live in <ol class="cl-search-results">
      let items;
      try {
        items = await page.evaluate(() => {
          const ol = document.querySelector('ol.cl-search-results');
          if (!ol) return [];

          return Array.from(ol.querySelectorAll('li')).map(li => {
            // Link element (try multiple selectors for forward-compat)
            const anchor =
              li.querySelector('a.cl-app-anchor') ||
              li.querySelector('a.titlestring') ||
              li.querySelector('a[href*="craigslist.org"]') ||
              li.querySelector('a');

            const href  = anchor ? anchor.href : null;
            const title = anchor ? anchor.textContent.trim() : null;

            // Price
            const priceEl =
              li.querySelector('.priceinfo') ||
              li.querySelector('.price');
            const price = priceEl ? priceEl.textContent.trim() : null;

            // Date
            const timeEl = li.querySelector('time');
            const postDate = timeEl
              ? (timeEl.getAttribute('datetime') || timeEl.textContent.trim())
              : null;

            return { href, title, price, postDate };
          }).filter(item => item.href && item.href.includes('craigslist.org'));
        });
      } catch (evalErr) {
        console.warn(`[craigslist] Failed to evaluate page at offset ${offset}: ${evalErr.message}. Stopping.`);
        break;
      }

      if (!items || items.length === 0) {
        console.log(`[craigslist] No items found at offset ${offset}. Pagination complete.`);
        break;
      }
```

Replace with:

```js
      // ── Collect list items ─────────────────────────────────────────────────
      // Uses a three-tier fallback: new CL UI (li.cl-search-result),
      // old UI (ol.cl-search-results li), then [data-pid] attribute fallback.
      let items;
      try {
        items = await page.evaluate(() => {
          function getResultItems() {
            // Tier 1: new Craigslist UI (2024+)
            const byClass = Array.from(document.querySelectorAll('li.cl-search-result'))
              .filter(el => el.querySelector('a'));
            if (byClass.length > 0) return byClass;

            // Tier 2: old UI wrapper
            const ol = document.querySelector('ol.cl-search-results');
            if (ol) {
              const olItems = Array.from(ol.querySelectorAll('li'));
              if (olItems.length > 0) return olItems;
            }

            // Tier 3: attribute-based fallback
            return Array.from(document.querySelectorAll('[data-pid]'));
          }

          return getResultItems().map(li => {
            const anchor =
              li.querySelector('a.cl-app-anchor') ||
              li.querySelector('a.posting-title') ||
              li.querySelector('a.titlestring') ||
              li.querySelector('a[href*="craigslist.org"]') ||
              li.querySelector('a');

            const href  = anchor ? anchor.href : null;
            const title = anchor ? anchor.textContent.trim() : null;

            const priceEl =
              li.querySelector('.priceinfo') ||
              li.querySelector('.result-price') ||
              li.querySelector('.price');
            const price = priceEl ? priceEl.textContent.trim() : null;

            const timeEl = li.querySelector('time');
            const postDate = timeEl
              ? (timeEl.getAttribute('datetime') || timeEl.textContent.trim())
              : null;

            return { href, title, price, postDate };
          }).filter(item => item.href && item.href.includes('craigslist.org'));
        });
      } catch (evalErr) {
        console.warn(`[craigslist] Failed to evaluate page at offset ${offset}: ${evalErr.message}. Stopping.`);
        break;
      }

      if (!items || items.length === 0) {
        const pageTitle = await page.title();
        console.warn(`[craigslist] 0 items at offset ${offset}. Page title: "${pageTitle}". May be CAPTCHA or empty results.`);
        console.log(`[craigslist] No items found at offset ${offset}. Pagination complete.`);
        break;
      }
```

- [ ] **Step 3: Run Craigslist tests to confirm `parseListings` still passes**

```
npm test -- --testPathPattern=craigslist
```

Expected: 4 passing — the `parseListings` function is unchanged so all existing tests pass

- [ ] **Step 4: Run full test suite**

```
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```
git add src/scrapers/craigslist.js
git commit -m "fix: update Craigslist selectors for new UI + add diagnostic page-title log"
```

---

## Task 7: Add SendGrid GitHub Secrets (no code changes)

This task is configuration only. Follow these steps in your browser.

- [ ] **Step 1: Create a SendGrid account and API key**

1. Go to sendgrid.com → sign up (free tier: 100 emails/day)
2. Navigate to **Settings → Sender Authentication → Single Sender Verification**
3. Verify the email address you want to send from (e.g., your personal or business address)
4. Navigate to **Settings → API Keys → Create API Key**
5. Choose **Full Access**, name it `deal-finder`, click **Create & View**
6. Copy the key value — it's only shown once

- [ ] **Step 2: Add the 6 secrets to GitHub**

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

Add each of these:

| Secret name | Value |
|---|---|
| `SMTP_HOST` | `smtp.sendgrid.net` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `apikey` (literal string — SendGrid's required SMTP username) |
| `SMTP_PASS` | The API key value copied in Step 1 |
| `EMAIL_FROM` | The sender address you verified in Step 1 |
| `EMAIL_TO` | `bigbankhank555@icloud.com` |

- [ ] **Step 3: Verify by triggering a manual run**

Go to your GitHub repo → **Actions → Daily Real Estate Deal Finder → Run workflow**

Check the "Run deal finder pipeline" step logs. If any deal scores ≥ 70, you'll receive an email. If no deals score ≥ 70 that run, no email is sent (that's expected behavior).

---

## Self-Review Checklist

- [x] Spec §1 (retry utility): Covered by Task 1
- [x] Spec §1 (applied to Zillow): Covered by Task 2 — wraps both goto + extractNextData
- [x] Spec §1 (applied to county scrapers): Covered by Tasks 3-5
- [x] Spec §1 (detail pages NOT retried): Confirmed — only main navigations wrapped
- [x] Spec §2 (Craigslist selector fix): Covered by Task 6 — three-tier fallback
- [x] Spec §2 (diagnostic logging): Covered by Task 6 — page.title() logged on 0 results
- [x] Spec §3 (SendGrid credentials): Covered by Task 7
- [x] Spec §3 (Twilio deferred): No Twilio tasks in this plan
- [x] No TBD/TODO placeholders in any task
- [x] `withRetry` signature consistent across all usages: `withRetry(fn, 3, 5000)`
- [x] Tests use `delayMs = 0` to avoid real delays in test suite
