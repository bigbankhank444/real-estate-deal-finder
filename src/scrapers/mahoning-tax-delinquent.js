'use strict';

const { launchBrowser } = require('../utils/browser');

const SOURCE_URL = 'https://auditor.mahoningcountyoh.gov/DelinquencyReport';

/**
 * Parse a dollar-string like "$1,234" or "1,234.00" into a whole-dollar integer.
 * Returns null if the string cannot be parsed.
 *
 * @param {string} str
 * @returns {number|null}
 */
function parseDollars(str) {
  if (!str) return null;
  const cleaned = str.replace(/[$,\s]/g, '');
  const value = parseInt(cleaned, 10);
  return isNaN(value) ? null : value;
}

/**
 * Extract the auditor assessed value from a parcel detail page.
 * The detail page typically shows an "Assessed Value" or "Appraised Value"
 * field inside a definition list or summary table.
 *
 * Returns null if the value cannot be found.
 *
 * @param {object} detailPage  — Playwright Page already navigated to the detail URL
 * @returns {Promise<number|null>}
 */
async function extractAssessedValue(detailPage) {
  // Try multiple selector strategies in priority order.
  // County auditor sites vary, but assessed/appraised value is almost always
  // surfaced in one of these patterns.

  // Strategy 1: look for a cell/label that contains "assessed" and grab the
  //             adjacent sibling cell.
  try {
    const value = await detailPage.evaluate(() => {
      // Walk every element looking for one whose text contains "assessed"
      const allEls = Array.from(document.querySelectorAll('td, th, dt, label, span, div'));
      for (const el of allEls) {
        const text = el.textContent.trim().toLowerCase();
        if (text.includes('assessed') && !text.includes('year') && text.length < 60) {
          // Try next sibling
          const sibling = el.nextElementSibling;
          if (sibling) {
            const raw = sibling.textContent.trim();
            if (/\$?\d[\d,]*/.test(raw)) return raw;
          }
          // Try parent's next sibling (dl/dt pattern)
          const parentSib = el.parentElement && el.parentElement.nextElementSibling;
          if (parentSib) {
            const raw = parentSib.textContent.trim();
            if (/\$?\d[\d,]*/.test(raw)) return raw;
          }
        }
      }
      return null;
    });
    if (value) return parseDollars(value);
  } catch (_) { /* fall through */ }

  // Strategy 2: look for a table row where the first cell is "Assessed Value"
  try {
    const value = await detailPage.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length >= 2) {
          const label = cells[0].textContent.trim().toLowerCase();
          if (label.includes('assessed')) {
            return cells[1].textContent.trim();
          }
        }
      }
      return null;
    });
    if (value) return parseDollars(value);
  } catch (_) { /* fall through */ }

  return null;
}

/**
 * Scrape the Mahoning County auditor delinquency report.
 *
 * @returns {Promise<Array<object>>} Array of normalized listing objects.
 */
async function scrape() {
  const { browser, context, page } = await launchBrowser();

  try {
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // Wait for the results table to appear
    await page.waitForSelector('table tbody tr', { timeout: 30_000 });

    const listings = [];
    let pageNum = 0;

    // Pagination loop
    while (true) {
      pageNum++;

      // Collect all rows on the current page
      const rows = await page.$$('table tbody tr');

      for (const row of rows) {
        try {
          const cells = await row.$$('td');
          if (cells.length < 3) continue; // header-like or empty row — skip

          // Extract cell text; exact column order will vary but typical layout:
          // [0] Parcel Number  [1] Owner Name  [2] Address  [3] Delinquent Amount  [4] Certified Years
          // We also look for a parcel detail link on the row.
          const cellTexts = await Promise.all(cells.map(c => c.innerText()));

          // Identify columns by heuristic: parcel numbers are hyphen-separated digits
          // e.g. "12-345678-00"
          let parcelNumber = null;
          let ownerName = null;
          let address = null;
          let delinquentAmountRaw = null;
          let yearsDelinquentRaw = null;

          for (let i = 0; i < cellTexts.length; i++) {
            const t = cellTexts[i].trim();
            if (!parcelNumber && /^\d{2}-\d{6}-\d{2}/.test(t)) {
              parcelNumber = t;
            } else if (!delinquentAmountRaw && /\$[\d,]+/.test(t)) {
              delinquentAmountRaw = t;
            } else if (!yearsDelinquentRaw && /^\d{4}$/.test(t.split(/[,\s]/)[0])) {
              // A year like "2020, 2021" — count tokens as years delinquent
              yearsDelinquentRaw = t;
            } else if (!ownerName && t.length > 2 && !/^\d/.test(t) && !t.includes('$')) {
              ownerName = t;
            } else if (!address && t.length > 5 && /\d/.test(t) && /[A-Za-z]/.test(t)) {
              address = t;
            }
          }

          // If we couldn't identify a parcel number, skip the row
          if (!parcelNumber) continue;

          // Count how many individual years are listed
          const yearsDelinquent = yearsDelinquentRaw
            ? yearsDelinquentRaw.split(/[,\s]+/).filter(y => /^\d{4}$/.test(y)).length
            : null;

          const delinquentAmount = parseDollars(delinquentAmountRaw);

          // Follow the parcel detail link if present
          let estimatedValue = null;
          const parcelLink = await row.$('a[href*="parcel"], a[href*="Parcel"], a[href*="detail"], a[href*="Detail"], a[href*="property"], a[href*="Property"]');

          if (parcelLink) {
            const href = await parcelLink.getAttribute('href');
            if (href) {
              // Open in a new page to keep our table page intact
              const detailPage = await context.newPage();
              try {
                const detailUrl = href.startsWith('http')
                  ? href
                  : new URL(href, SOURCE_URL).href;

                await detailPage.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30_000 });
                estimatedValue = await extractAssessedValue(detailPage);
              } catch (detailErr) {
                // Non-fatal: we still add the listing without an estimated value
                console.warn(`[mahoning-tax-delinquent] Could not load detail page for parcel ${parcelNumber}: ${detailErr.message}`);
              } finally {
                await detailPage.close();
              }

              // Short pause between detail page fetches to avoid hammering the server
              await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
            }
          }

          listings.push({
            address:         address || null,
            owner_name:      ownerName || null,
            signal_type:     'tax_delinquent',
            asking_price:    null,
            estimated_value: estimatedValue,
            arv:             null,
            fair_offer:      null,
            comparables:     null,
            contact_info:    null,
            source_url:      SOURCE_URL,
            raw: {
              parcel_number:    parcelNumber,
              delinquent_amount: delinquentAmount,
              years_delinquent: yearsDelinquent,
            },
          });
        } catch (rowErr) {
          // Skip malformed rows gracefully
          console.warn(`[mahoning-tax-delinquent] Skipping row due to error: ${rowErr.message}`);
        }
      }

      // --- Pagination ---
      // Look for a "Next" button or link. Common patterns on county sites:
      //   <a class="next">Next</a>
      //   <button>Next</button>
      //   <a href="...page=2...">></a>
      //   DataTables "next" button with class "paginate_button next"
      const nextSelectors = [
        'a.next:not(.disabled)',
        'button.next:not([disabled])',
        'li.next:not(.disabled) a',
        '.paginate_button.next:not(.disabled)',
        'a[aria-label="Next page"]',
        'a[title="Next page"]',
        'a:has-text("Next")',
        'button:has-text("Next")',
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
              // Wait for the table to refresh
              await page.waitForLoadState('networkidle', { timeout: 15_000 });
              await page.waitForSelector('table tbody tr', { timeout: 15_000 });
              // Brief pause before scraping next page
              await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
              advanced = true;
              break;
            }
          }
        } catch (_) { /* selector not found or click failed — try next */ }
      }

      if (!advanced) {
        // No next page found — we're done
        break;
      }
    }

    console.log(`[mahoning-tax-delinquent] Scraped ${listings.length} listings across ${pageNum} page(s).`);
    return listings;
  } finally {
    await browser.close();
  }
}

module.exports = { scrape };
