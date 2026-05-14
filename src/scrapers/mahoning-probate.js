'use strict';

const { launchBrowser } = require('../utils/browser');

const SOURCE_URL = 'https://eprobate.mahoningcountyoh.gov';

/**
 * Maximum number of result pages to scrape.
 * Caps runtime while still covering recent filings.
 */
const MAX_PAGES = 10;

/**
 * Format a Date object as MM/DD/YYYY — the format probate portals typically
 * expect in date-range fields.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Attempt to select an <option> whose visible text matches a regex pattern.
 * Playwright's selectOption() does not support regex; this helper evaluates
 * inside the page instead.
 *
 * @param {object} page     - Playwright Page
 * @param {string} selector - CSS selector for the <select> element
 * @param {string} pattern  - Regex pattern string (no delimiters) to match option text
 */
async function selectByText(page, selector, pattern) {
  await page.evaluate(({ sel, re }) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const regex = new RegExp(re, 'i');
    for (const opt of el.options) {
      if (regex.test(opt.text)) {
        el.value = opt.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  }, { sel: selector, re: pattern });
}

/**
 * Try to fill a visible date input field using several common selector
 * patterns. Falls through silently if no matching field is found.
 *
 * @param {object} page
 * @param {string[]} selectors - Ordered list of CSS selectors to try
 * @param {string} value       - Date string in MM/DD/YYYY format
 */
async function tryFillDate(page, selectors, value) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click({ clickCount: 3 }).catch(() => {});  // select existing text
        await el.fill(value);
        return;
      }
    } catch (_) { /* try next */ }
  }
}

/**
 * Scrape Mahoning County eProbate for estate / administration cases filed
 * in the last 90 days.
 *
 * Address is intentionally omitted (always null) because probate records
 * do not include a property address.  The analyze.js pipeline will
 * cross-reference the decedent name against the auditor parcel search later.
 *
 * @returns {Promise<Array<object>>} Array of normalized listing objects.
 */
async function scrape() {
  const { browser, context, page } = await launchBrowser();

  try {
    // ----------------------------------------------------------------
    // Compute the 90-day date window
    // ----------------------------------------------------------------
    const endDate   = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 90);

    const startDateStr = formatDate(startDate);
    const endDateStr   = formatDate(endDate);

    // ----------------------------------------------------------------
    // 1. Navigate to the public case search
    // ----------------------------------------------------------------
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // ----------------------------------------------------------------
    // 2. Fill the search form
    //    We try multiple common selector patterns for each field and
    //    fall through gracefully if a field is absent.
    // ----------------------------------------------------------------

    // --- Case type: estate / administration ---
    const caseTypeSelectors = [
      'select[name*="caseType" i]',
      'select[id*="caseType" i]',
      'select[name*="type" i]',
      'select[id*="type" i]',
      'select[name*="category" i]',
      'select[id*="category" i]',
      'select[name*="casetype" i]',
    ];
    for (const sel of caseTypeSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          // Try "estate" first; if no match, try "administration"
          await selectByText(page, sel, 'estate');
          // Check if something actually got selected
          const chosen = await page.$eval(sel, el => el.value);
          if (!chosen) {
            await selectByText(page, sel, 'administration');
          }
          await new Promise(r => setTimeout(r, 500));
          break;
        }
      } catch (_) { /* try next */ }
    }

    // --- Filed Date From ---
    const dateFromSelectors = [
      'input[name*="dateFrom" i]',
      'input[id*="dateFrom" i]',
      'input[name*="filedFrom" i]',
      'input[id*="filedFrom" i]',
      'input[name*="startDate" i]',
      'input[id*="startDate" i]',
      'input[name*="beginDate" i]',
      'input[id*="beginDate" i]',
      'input[placeholder*="from" i]',
      'input[placeholder*="start" i]',
    ];
    await tryFillDate(page, dateFromSelectors, startDateStr);

    // --- Filed Date To ---
    const dateToSelectors = [
      'input[name*="dateTo" i]',
      'input[id*="dateTo" i]',
      'input[name*="filedTo" i]',
      'input[id*="filedTo" i]',
      'input[name*="endDate" i]',
      'input[id*="endDate" i]',
      'input[name*="throughDate" i]',
      'input[id*="throughDate" i]',
      'input[placeholder*="to" i]',
      'input[placeholder*="end" i]',
    ];
    await tryFillDate(page, dateToSelectors, endDateStr);

    // Small pause so the form can react before submit
    await new Promise(r => setTimeout(r, 500));

    // --- Submit ---
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Search")',
      'input[value*="Search" i]',
      'a:has-text("Search")',
    ];
    let submitted = false;
    for (const sel of submitSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          submitted = true;
          break;
        }
      } catch (_) { /* try next */ }
    }
    if (!submitted) {
      await page.keyboard.press('Enter');
    }

    // Wait for results — fall back to body if no table appears
    try {
      await page.waitForSelector('table tbody tr', { timeout: 30_000 });
    } catch (_) {
      // No table found; we may still be on a form or error page.
      // Collect whatever rows exist and return an empty array if truly none.
      console.warn('[mahoning-probate] No results table found after submit — returning empty.');
      return [];
    }

    // ----------------------------------------------------------------
    // 3. Pagination loop — collect up to MAX_PAGES of results
    // ----------------------------------------------------------------
    const listings = [];
    let pageNum = 0;

    while (pageNum < MAX_PAGES) {
      pageNum++;

      const rows = await page.$$('table tbody tr');

      for (const row of rows) {
        try {
          const cells = await row.$$('td');
          if (cells.length < 2) continue; // spacer / header row — skip

          const cellTexts = await Promise.all(cells.map(c => c.innerText()));

          // ----------------------------------------------------------------
          // Identify columns by heuristic.
          //
          // Mahoning eProbate typical layout (may vary):
          //   [0] Case Number    e.g. "2024 ES 00123"
          //   [1] Decedent Name  e.g. "DOE, JOHN"
          //   [2] Case Type      e.g. "Estate"
          //   [3] Filing Date    e.g. "01/15/2024"
          //   [4] Fiduciary / Executor name
          //
          // We identify columns by content patterns rather than fixed
          // indices so that layout variations don't break the scraper.
          // ----------------------------------------------------------------

          let caseNumber    = null;
          let decedentName  = null;
          let filingDate    = null;
          let fiduciaryName = null;

          for (let i = 0; i < cellTexts.length; i++) {
            const t = cellTexts[i].trim();
            if (!t) continue;

            // Case number: year + ES/ET/PR/PA + number
            // e.g. "2024 ES 00123", "2024ES00123", "24-ES-0123"
            if (!caseNumber && /\b\d{4}\s*[A-Z]{2}\s*\d+/i.test(t)) {
              caseNumber = t.replace(/\s+/g, ' ');
              continue;
            }

            // Filing date: MM/DD/YYYY or YYYY-MM-DD
            if (!filingDate && /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/.test(t)) {
              const m = t.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/);
              if (m) {
                filingDate = m[0];
                continue;
              }
            }

            // Skip cells that are clearly a case-type label
            if (/^(estate|administration|testamentary|intestate|guardianship|trust|minor)/i.test(t) && t.length < 40) {
              continue;
            }

            // Decedent / owner name: typically a NAME-like string, often
            // "LAST, FIRST" format. Must contain letters and no digits,
            // no $ signs, reasonable length.
            if (
              !decedentName &&
              t.length >= 3 &&
              t.length <= 80 &&
              /[A-Za-z]/.test(t) &&
              !/\d/.test(t) &&
              !t.includes('$')
            ) {
              decedentName = t;
              continue;
            }

            // Fiduciary: second name-like string (same heuristic)
            if (
              !fiduciaryName &&
              decedentName &&          // must already have a decedent
              t !== decedentName &&
              t.length >= 3 &&
              t.length <= 80 &&
              /[A-Za-z]/.test(t) &&
              !/\d/.test(t) &&
              !t.includes('$')
            ) {
              fiduciaryName = t;
              continue;
            }
          }

          // If we couldn't identify a case number, this row is not useful
          if (!caseNumber) continue;

          listings.push({
            address:         null,   // always null for probate — by design
            owner_name:      decedentName || null,
            signal_type:     'probate',
            asking_price:    null,
            estimated_value: null,
            arv:             null,
            fair_offer:      null,
            comparables:     null,
            contact_info:    null,
            source_url:      SOURCE_URL,
            raw: {
              case_number:     caseNumber,
              filing_date:     filingDate || null,
              fiduciary_name:  fiduciaryName || null,
            },
          });
        } catch (rowErr) {
          console.warn(`[mahoning-probate] Skipping row due to error: ${rowErr.message}`);
        }
      }

      // ----------------------------------------------------------------
      // Advance to next page (if available)
      // ----------------------------------------------------------------
      const nextSelectors = [
        'a.next:not(.disabled)',
        'button.next:not([disabled])',
        'li.next:not(.disabled) a',
        '.paginate_button.next:not(.disabled)',
        'a[aria-label="Next page"]',
        'a[aria-label="Next Page"]',
        'a[title="Next page"]',
        'a[title="Next Page"]',
        'a:has-text("Next")',
        'button:has-text("Next")',
        'a:has-text(">")',
      ];

      let advanced = false;
      for (const sel of nextSelectors) {
        try {
          const nextBtn = await page.$(sel);
          if (nextBtn) {
            const isDisabled = await nextBtn.evaluate(el =>
              el.disabled ||
              el.classList.contains('disabled') ||
              el.getAttribute('aria-disabled') === 'true'
            );
            if (!isDisabled) {
              await nextBtn.click();
              await page.waitForLoadState('networkidle', { timeout: 15_000 });
              await page.waitForSelector('table tbody tr', { timeout: 15_000 });
              await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
              advanced = true;
              break;
            }
          }
        } catch (_) { /* selector not found or click failed — try next */ }
      }

      if (!advanced) break; // No next page — we're done
    }

    console.log(
      `[mahoning-probate] Scraped ${listings.length} listings across ${pageNum} page(s).`
    );
    return listings;
  } finally {
    await browser.close();
  }
}

module.exports = { scrape };
