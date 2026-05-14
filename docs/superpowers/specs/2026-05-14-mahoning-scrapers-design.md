# Mahoning County Scrapers — Implementation Design

**Date:** 2026-05-14
**Type:** Scraper implementation + DB migration
**Status:** Approved

---

## Overview

Implements real scraping logic for the existing scaffold. Five scrapers (three public-records, two market) replace the current stubs. One database migration creates the `deals` table. `collect.js` is updated to run all five scrapers in parallel with isolated failure handling.

---

## Files Changed

| File | Action |
|------|--------|
| `src/scrapers/mahoning-tax-delinquent.js` | New |
| `src/scrapers/mahoning-preforeclosure.js` | New |
| `src/scrapers/mahoning-probate.js` | New |
| `src/scrapers/zillow.js` | Replace stub |
| `src/scrapers/craigslist.js` | Replace stub |
| `src/utils/browser.js` | New — shared Playwright launch helper + `delay()` |
| `src/pipeline/collect.js` | Replace stub |
| `src/pipeline/analyze.js` | Add probate address resolution logic |
| `src/db/migrations/<timestamp>_create_deals.js` | New |
| `config/index.js` | Add `scrapeDelayMs` field |
| `.env.example` | Add `SCRAPE_DELAY_MS` |

---

## Normalized Listing Shape

Every scraper returns an array of objects with this shape. Fields the scraper cannot know are `null`; `analyze.js` fills them in later.

```js
{
  address:         String | null,  // '1234 Oak St, Youngstown OH 44502'
  owner_name:      String | null,
  signal_type:     String,         // enum — see below
  asking_price:    Number | null,  // whole dollars
  estimated_value: Number | null,  // auditor assessed value or Zestimate
  arv:             null,           // filled by analyze.js
  fair_offer:      null,           // filled by analyze.js
  comparables:     Array | null,   // [{address, sold_price, sold_date, beds, baths, sqft}]
  contact_info:    String | null,  // phone or email if visible
  source_url:      String,         // permalink or search URL used
  raw:             Object,         // source-specific fields for analyze.js context
}
```

`signal_type` values: `tax_delinquent` | `pre_foreclosure` | `probate` | `fsbo_zillow` | `fsbo_craigslist`

---

## Anti-Bot Strategy — `src/utils/browser.js`

Shared helper used by all five scrapers. Each scraper calls `launchBrowser()` at the start of its `scrape()` and closes the browser at the end, so crashes in one scraper don't affect others.

- Launch Chromium: `headless: true`, `args: ['--no-sandbox', '--disable-setuid-sandbox']` (required on Render)
- Set `User-Agent` to a current Chrome desktop string
- Set `viewport` to `1280×800`
- Inject `Object.defineProperty(navigator, 'webdriver', { get: () => undefined })` via `addInitScript`
- Random `waitForTimeout(1000 + Math.random() * 2000)` before first interaction on county sites

### Rate Limiting

A configurable `SCRAPE_DELAY_MS` env var (default: `2000`) throttles requests between page navigations on all public records scrapers. The `browser.js` helper exports a `delay()` function (`await delay()`) that public records scrapers call between each page navigation and each parcel/case detail fetch. Market scrapers (Zillow, Craigslist) use it between pagination requests only.

Add to `.env.example`:
```
SCRAPE_DELAY_MS=2000
```

Add to `config/index.js` `getConfig()`:
```js
scrapeDelayMs: parseInt(process.env.SCRAPE_DELAY_MS || '2000', 10),
```

---

## Public Records Scrapers

### `mahoning-tax-delinquent.js`

- **Source:** `https://auditor.mahoningcountyoh.gov/DelinquencyReport`
- **Data:** Parcel number, owner name, address, delinquent amount, certified years
- **Strategy:** Playwright navigates the delinquency report page, waits for the results table, iterates rows. Follows pagination ("next page") until exhausted. For each row, follows the parcel detail link to extract the auditor assessed value (`estimated_value`).
- **Output fields:** `signal_type: 'tax_delinquent'`, `owner_name`, `address`, `estimated_value` (assessed), `raw.delinquent_amount`, `raw.years_delinquent`, `raw.parcel_number`

### `mahoning-preforeclosure.js`

- **Source:** `https://ecourts.mahoningcountyoh.gov/eservices/` — public case search, Civil division, case type Foreclosure
- **Data:** Case number, defendant (property owner), filing date, property address from case caption
- **Strategy:** Playwright navigates to the public case search UI, selects Civil > Foreclosure, sorts by filing date descending, collects first N pages. For each case, follows the detail link to extract address from the case caption text.
- **Output fields:** `signal_type: 'pre_foreclosure'`, `owner_name` = defendant name, `address` from case caption, `raw.case_number`, `raw.filing_date`, `raw.plaintiff`

### `mahoning-probate.js`

- **Source:** `https://eprobate.mahoningcountyoh.gov` — public case search
- **Data:** Estate cases filed in the last 90 days — decedent name, fiduciary/executor, filing date, case number
- **Strategy:** Playwright queries for estate/administration cases within the last 90 days. Address is not on the probate record — `address` is `null` at scrape time.
- **Output fields:** `signal_type: 'probate'`, `owner_name` = decedent name, `address: null`, `raw.fiduciary_name`, `raw.case_number`, `raw.filing_date`

### Probate Address Resolution (in `analyze.js`)

Because probate records contain no property address, `analyze.js` must attempt to resolve one before scoring. For each `signal_type: 'probate'` listing, `analyze.js`:

1. Searches the Mahoning County Auditor parcel search (`https://auditor.mahoningcountyoh.gov/SearchResults?searchTerm=<owner_name>&Command=Combined`) using Playwright with `launchBrowser()`.
2. Collects all result rows and applies fuzzy name matching: normalize both the decedent name and each result's owner name (lowercase, strip punctuation, sort tokens), then accept matches where the normalized token sets overlap ≥ 80%.
3. If exactly one match is found above threshold, sets `address` on the listing.
4. If zero or multiple ambiguous matches are found, sets `address: null` and logs a warning — the deal is still persisted and scored on name alone, but flagged in `raw.address_resolution_status` as `'unresolved'` or `'ambiguous'`.
5. Never throws — a failed resolution is non-fatal.

---

## Market Scrapers

### `zillow.js` — FSBO listings + sold comps

**FSBO listings:**
- **Source:** `https://www.zillow.com/mahoning-county-oh/fsbo/`
- **Strategy:** Playwright navigates the FSBO page. Extracts the `__NEXT_DATA__` JSON blob embedded in the page — all listing data is inlined there, avoiding selector fragility. Collects address, asking price, beds/baths, sqft, Zestimate.

**Sold comps (per listing):**
- For each FSBO listing, opens the listing detail page and extracts the "Recently Sold" nearby homes from `__NEXT_DATA__`. These become `comparables`: `[{ address, sold_price, sold_date, beds, baths, sqft }]`.
- **Fallback:** If `__NEXT_DATA__` lacks comps or the detail page is blocked, `comparables` is set to `null`. `analyze.js` then falls back to AI-only ARV estimation from address + asking price (Option A fallback).

**Output fields:** `signal_type: 'fsbo_zillow'`, `asking_price`, `estimated_value` = Zestimate if present, `comparables`

### `craigslist.js`

- **Source:** `https://youngstown.craigslist.org/search/rea?purveyor=owner`
- **Strategy:** Craigslist renders plain server-side HTML. Playwright reads `<li>` items from the results `<ol>`. For each listing, follows the post URL to extract the full description and any phone number in the body text. Paginates via `s=120`, `s=240` offset params until no results remain.
- **Output fields:** `signal_type: 'fsbo_craigslist'`, `asking_price`, `contact_info` = phone if present, `raw.post_title`, `raw.post_date`, `raw.description`

---

## `collect.js`

Runs all five scrapers concurrently via `Promise.allSettled`. A failed scraper logs its error and contributes an empty array — it never kills the whole run.

```js
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
      console.error(`Scraper ${i} failed:`, r.reason.message);
      return [];
    }
    return r.value;
  });
}
```

---

## Database Migration — `deals` table

```js
exports.up = function(knex) {
  return knex.schema.createTable('deals', (t) => {
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

- Dollar values stored as whole-dollar integers
- `raw` is `jsonb` — each scraper stashes source-specific fields without schema changes
- `score` column included now so `analyze.js` has a home without a second migration
- `comparables` is `jsonb` array
- Upsert key: `(address, signal_type)` — re-running the cron never duplicates rows

---

## Out of Scope (This Phase)

- `analyze.js` AI scoring and ARV/fair_offer calculation (only probate address resolution is in scope)
- `persist.js` implementation (upsert logic)
- `notify.js` implementation
- `facebook.js` and `fsbo.js` scrapers
- Login-gated county portals
- Proxy rotation or CAPTCHA solving
- Deduplication across signal types for the same address
