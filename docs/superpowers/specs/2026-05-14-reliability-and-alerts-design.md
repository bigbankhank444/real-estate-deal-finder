# Scraper Reliability, Craigslist Fix & Email Alerts Design

**Date:** 2026-05-14  
**Status:** Approved

## Overview

Three targeted improvements to the wholesale deal finder pipeline:

1. Add retry logic for scraper page navigations that timeout or get blocked
2. Fix Craigslist returning 0 results due to a UI selector change
3. Configure SendGrid email alerts (Twilio SMS deferred)

---

## Section 1 — Retry Utility

### New file: `src/utils/retry.js`

Exports `withRetry(fn, retries = 3, delayMs = 5000)`:
- Calls `fn()` (async thunk)
- On failure, waits `delayMs * attempt` (linear backoff) before retrying
- Throws on final failure after all retries exhausted

### Applied to these scrapers (main page navigation only):

| Scraper | What is retried |
|---|---|
| `src/scrapers/zillow.js` | `page.goto(FSBO_URL)` + close/reopen page between retries to clear bot cookies |
| `src/scrapers/mahoning-tax-delinquent.js` | Initial table page `page.goto` |
| `src/scrapers/mahoning-preforeclosure.js` | Initial search form `page.goto` |
| `src/scrapers/mahoning-probate.js` | Initial search form `page.goto` |

**Not retried:** Individual detail pages (Craigslist detail, Zillow comps). These already fail non-fatally (`comparables: null`, `detail: null`), so retrying them would extend runtime significantly with little benefit.

**Retry config:** 3 total attempts (1 original + 2 retries), 5-second base delay, linear backoff (5s, 10s).

---

## Section 2 — Craigslist Selector Fix

### Root cause

Craigslist redesigned their search results page in 2024/2025. The old `ol.cl-search-results` wrapper no longer exists. Results now render as individual `li.cl-search-result` elements.

### Changes to `src/scrapers/craigslist.js`

**Replace selector chain with defensive multi-fallback approach:**

```
Priority 1: li.cl-search-result          (new UI, 2024+)
Priority 2: ol.cl-search-results li      (old UI fallback)
Priority 3: [data-pid]                   (attribute-based, most forward-compatible)
```

**Updated sub-selectors per item:**
- Link: `a.cl-app-anchor` → `a.posting-title` → `a[href*="craigslist.org"]` → `a`
- Price: `.priceinfo` → `.result-price` → `.price`
- Date: `time` (unchanged)

**Diagnostic logging:** If all selectors return 0 items, log `page.title()` to stdout. This surfaces CAPTCHA pages and "0 results" pages in GitHub Actions logs for fast debugging.

---

## Section 3 — Email Alerts (SendGrid SMTP)

### What changes

**No code changes required.** `src/utils/mailer.js` already uses Nodemailer with SMTP env vars. `src/pipeline/notify.js` already filters deals ≥ 70 and sends an email digest.

### GitHub Secrets to add

Go to: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

| Secret name | Value |
|---|---|
| `SMTP_HOST` | `smtp.sendgrid.net` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `apikey` (literal string — this is SendGrid's required username) |
| `SMTP_PASS` | Your SendGrid API key (from sendgrid.com → Settings → API Keys) |
| `EMAIL_FROM` | A verified sender address in your SendGrid account |
| `EMAIL_TO` | `bigbankhank555@icloud.com` |

### SendGrid setup steps

1. Create account at sendgrid.com (free tier: 100 emails/day)
2. Go to Settings → Sender Authentication → verify your sender email
3. Go to Settings → API Keys → Create API Key → Full Access
4. Copy the key value (shown only once) → add as `SMTP_PASS` secret

### Twilio SMS

Deferred. Twilio secrets (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `SMS_TO`) can be added later without any code changes — the workflow already passes them as env vars.

---

## Out of scope

- Residential proxy services for Zillow (reconsidered if retry alone proves insufficient)
- Expanding Craigslist to Cleveland or other metros
- Circuit breaker / persistent failure tracking across daily runs

---

## Files changed

| File | Change type |
|---|---|
| `src/utils/retry.js` | New file |
| `src/scrapers/zillow.js` | Apply retry to main navigation |
| `src/scrapers/mahoning-tax-delinquent.js` | Apply retry to main navigation |
| `src/scrapers/mahoning-preforeclosure.js` | Apply retry to main navigation |
| `src/scrapers/mahoning-probate.js` | Apply retry to main navigation |
| `src/scrapers/craigslist.js` | Fix selectors + diagnostic logging |
| GitHub Secrets | Add 6 SendGrid SMTP secrets |
