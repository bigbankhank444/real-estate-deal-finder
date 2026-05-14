'use strict';

const { launchBrowser } = require('../utils/browser');

const SOURCE_URL = 'https://ecourts.mahoningcountyoh.gov/eservices/';

/**
 * Select an <option> element by text pattern matching using regex.
 * Playwright's selectOption({ label: /regex/ }) does not support regex,
 * so this helper iterates <option> elements and matches by text.
 *
 * @param {object} page - Playwright Page
 * @param {string} selector - CSS selector for the <select> element
 * @param {string} pattern - Regex pattern (without delimiters/flags) to match option text
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
 * Maximum number of result pages to scrape.
 * Government portals can have thousands of old cases — cap at 10 pages to
 * keep runtime reasonable while still getting recent filings.
 */
const MAX_PAGES = 10;

/**
 * Attempt to extract a property address from the free-text case caption.
 *
 * Mahoning County foreclosure captions follow patterns like:
 *   "WELLS FARGO BANK v. JOHN DOE - 123 MAIN ST YOUNGSTOWN OH 44502"
 *   "BANK OF AMERICA NA VS JANE DOE RE: 456 ELM AVE BOARDMAN OH 44512"
 *   "FIRST FEDERAL SAVINGS v SMITH JOHN - PROPERTY: 789 OAK DR CANFIELD OH 44406"
 *
 * We also look for an explicit "Property Address:" label that some portals
 * surface in a structured field on the detail page.
 *
 * Returns null if no address-like text can be found.
 *
 * @param {string} captionText
 * @returns {string|null}
 */
function extractAddressFromCaption(captionText) {
  if (!captionText) return null;

  // Pattern 1 — explicit label anywhere in the text
  //   "Property Address: 123 Main St Youngstown OH 44502"
  const labelMatch = captionText.match(
    /property\s+address\s*:?\s*([^\n\r,;]+)/i
  );
  if (labelMatch) return labelMatch[1].trim();

  // Pattern 2 — "RE:" or "PROPERTY:" prefix
  const reMatch = captionText.match(
    /\b(?:re|property)\s*:\s*([^\n\r,;]+)/i
  );
  if (reMatch) return reMatch[1].trim();

  // Pattern 3 — after the last " - " separator, if it looks like a street address.
  //   "BANK v. DOE - 123 MAIN ST YOUNGSTOWN OH 44502"
  //   A street address always starts with digits and includes letters.
  const dashParts = captionText.split(/\s+-\s+/);
  if (dashParts.length >= 2) {
    const last = dashParts[dashParts.length - 1].trim();
    if (/^\d+\s+[A-Za-z]/.test(last)) return last;
  }

  // Pattern 4 — look for a typical US address anywhere in the string:
  //   one-or-more digits, space, street name, optional city/state/zip
  const addrMatch = captionText.match(
    /(\d{1,6}\s+[A-Z][A-Z\s.]+(?:ST|AVE|DR|RD|BLVD|LN|CT|PL|WAY|CIR|PKWY|HWY|ROUTE|RT)\b[^,\n\r]*)/i
  );
  if (addrMatch) return addrMatch[1].trim();

  return null;
}

/**
 * Extract case details from an individual case detail page.
 *
 * Returns an object with:
 *   - address   {string|null}
 *   - plaintiff  {string|null}  — the party suing (bank/servicer)
 *   - caption   {string|null}  — full caption text for debugging
 *
 * @param {object} detailPage  — Playwright Page already navigated to the detail URL
 * @returns {Promise<{ address: string|null, plaintiff: string|null, caption: string|null }>}
 */
async function extractDetailPageData(detailPage) {
  try {
    const result = await detailPage.evaluate(() => {
      // --- Caption / case title ---
      // Most eCourts portals put the full case caption in an element with
      // class "caseCaption", "case-caption", "captionText", or a prominent
      // heading near the top of the page.
      const captionSelectors = [
        '.caseCaption',
        '.case-caption',
        '.captionText',
        '[class*="caption"]',
        'h1',
        'h2',
        '#caseCaption',
      ];

      let captionText = null;
      for (const sel of captionSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 5) {
          captionText = el.textContent.trim();
          break;
        }
      }

      // Fallback: scan all table cells for something that looks like a caption
      if (!captionText) {
        const cells = Array.from(document.querySelectorAll('td, th, dt, dd'));
        for (const cell of cells) {
          const text = cell.textContent.trim();
          // A caption will contain "v." or "vs." and be at least 20 chars
          if (text.length > 20 && /\bv[s.]?\b/i.test(text)) {
            captionText = text;
            break;
          }
        }
      }

      // --- Explicit "Property Address" field on detail page ---
      // Some portals surface this as a labelled row separate from the caption.
      let explicitAddress = null;
      const allEls = Array.from(document.querySelectorAll('td, th, dt, label, span, div, p'));
      for (const el of allEls) {
        const text = el.textContent.trim().toLowerCase();
        if (text === 'property address' || text === 'property address:') {
          const sibling = el.nextElementSibling;
          if (sibling && sibling.textContent.trim().length > 5) {
            explicitAddress = sibling.textContent.trim();
            break;
          }
          // dt/dd pattern — parent's next sibling
          const parentSib = el.parentElement && el.parentElement.nextElementSibling;
          if (parentSib && parentSib.textContent.trim().length > 5) {
            explicitAddress = parentSib.textContent.trim();
            break;
          }
        }
      }

      // --- Plaintiff name ---
      // Look for a row/label that says "Plaintiff" or "Petitioner".
      let plaintiff = null;
      const labelEls = Array.from(document.querySelectorAll('td, th, dt, label, span, div'));
      for (const el of labelEls) {
        const text = el.textContent.trim().toLowerCase();
        if (text === 'plaintiff' || text === 'plaintiff:' || text === 'petitioner' || text === 'petitioner:') {
          const sibling = el.nextElementSibling;
          if (sibling && sibling.textContent.trim().length > 2) {
            plaintiff = sibling.textContent.trim();
            break;
          }
          const parentSib = el.parentElement && el.parentElement.nextElementSibling;
          if (parentSib && parentSib.textContent.trim().length > 2) {
            plaintiff = parentSib.textContent.trim();
            break;
          }
        }
      }

      // If plaintiff wasn't found via label, try to parse it from the caption
      // (the party before "v." in "BANK v. DOE")
      if (!plaintiff && captionText) {
        const vMatch = captionText.match(/^(.+?)\s+v[s.]?\s+/i);
        if (vMatch) plaintiff = vMatch[1].trim();
      }

      return { captionText, explicitAddress, plaintiff };
    });

    const address = result.explicitAddress || extractAddressFromCaption(result.captionText);

    return {
      address,
      plaintiff:  result.plaintiff || null,
      caption:    result.captionText || null,
    };
  } catch (err) {
    console.warn(`[mahoning-preforeclosure] extractDetailPageData error: ${err.message}`);
    return { address: null, plaintiff: null, caption: null };
  }
}

/**
 * Scrape Mahoning County eCourts for active Civil Foreclosure filings.
 *
 * Strategy:
 *  1. Navigate to the public case search page.
 *  2. Select division = Civil, case type = Foreclosure.
 *  3. Sort by filing date descending to surface the most recent activity.
 *  4. Paginate through up to MAX_PAGES of results.
 *  5. For each case row, follow the detail link to extract the property address
 *     and plaintiff name from the case detail page.
 *
 * @returns {Promise<Array<object>>} Normalized listing objects.
 */
async function scrape() {
  const { browser, context, page } = await launchBrowser();

  try {
    // ------------------------------------------------------------------
    // 1. Load the public case search page
    // ------------------------------------------------------------------
    await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // ------------------------------------------------------------------
    // 2. Fill in the search form
    //    eCourts portals vary; we try the most common selector patterns for
    //    each form field and fall through gracefully if a field isn't found.
    // ------------------------------------------------------------------

    // Select division: "Civil"
    // Common selector patterns: select[name*="division"], #divisionCode, etc.
    const divisionSelectors = [
      'select[name*="division" i]',
      'select[id*="division" i]',
      'select[name*="court" i]',
      'select[id*="court" i]',
    ];
    for (const sel of divisionSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await selectByText(page, sel, 'civil');
          break;
        }
      } catch (_) { /* try next */ }
    }

    // Small pause to let the form react (some portals reload case-type options)
    await new Promise(r => setTimeout(r, 1000));

    // Select case type: "Foreclosure"
    const caseTypeSelectors = [
      'select[name*="caseType" i]',
      'select[id*="caseType" i]',
      'select[name*="type" i]',
      'select[id*="type" i]',
      'select[name*="category" i]',
    ];
    for (const sel of caseTypeSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await selectByText(page, sel, 'foreclosure');
          break;
        }
      } catch (_) { /* try next */ }
    }

    // Sort by filing date descending — look for a "Sort by" / "Filed Date" dropdown
    const sortSelectors = [
      'select[name*="sort" i]',
      'select[id*="sort" i]',
    ];
    for (const sel of sortSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          // Try to pick "Filing Date" or "Filed Date" option
          await selectByText(page, sel, 'fil(e|ing)\\s+date').catch(() => {});
          break;
        }
      } catch (_) { /* not present — skip */ }
    }

    // Submit the search
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
      // Fallback: press Enter in the form
      await page.keyboard.press('Enter');
    }

    // Wait for results table
    await page.waitForSelector('table tbody tr', { timeout: 30_000 });

    // ------------------------------------------------------------------
    // 3. Attempt to sort the table by filing date descending by clicking
    //    the "Filed" / "Filing Date" column header (if sort dropdowns were
    //    not available above).
    // ------------------------------------------------------------------
    try {
      const filedHeader = await page.$(
        'th:has-text("Filed"), th:has-text("Filing Date"), th:has-text("Date Filed")'
      );
      if (filedHeader) {
        await filedHeader.click();
        await new Promise(r => setTimeout(r, 800));
        // Click again for descending
        await filedHeader.click();
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (_) { /* sorting is best-effort */ }

    // ------------------------------------------------------------------
    // 4. Pagination loop
    // ------------------------------------------------------------------
    const listings = [];
    let pageNum = 0;

    while (pageNum < MAX_PAGES) {
      pageNum++;

      // Collect all data rows visible on this page
      const rows = await page.$$('table tbody tr');

      for (const row of rows) {
        try {
          const cells = await row.$$('td');
          if (cells.length < 2) continue; // header-like spacer row — skip

          const cellTexts = await Promise.all(cells.map(c => c.innerText()));

          // --- Identify columns by heuristic ---
          // Typical column order on Mahoning eCourts:
          //   [0] Case Number   e.g. "2024 CV 01234"
          //   [1] Case Type     e.g. "Foreclosure"
          //   [2] Filed Date    e.g. "01/15/2024"
          //   [3] Caption / Parties   e.g. "BANK v. DOE"
          //   [4] Status
          //
          // We identify columns by content patterns rather than fixed index so
          // that slight layout variations don't break the scraper.

          let caseNumber = null;
          let filingDate = null;
          let defendant = null;   // defendant from caption in listing row
          let detailHref = null;

          for (let i = 0; i < cellTexts.length; i++) {
            const t = cellTexts[i].trim();

            // Case number: year + CV/CF + number, e.g. "2024 CV 01234"
            if (!caseNumber && /\b\d{4}\s+C[VF]\s+\d+/i.test(t)) {
              caseNumber = t.replace(/\s+/g, ' ');
            }

            // Filing date: MM/DD/YYYY or YYYY-MM-DD
            if (!filingDate && /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/.test(t)) {
              const m = t.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/);
              if (m) filingDate = m[0];
            }
          }

          // Look for the case detail hyperlink on this row
          const linkEl = await row.$('a[href]');
          if (linkEl) {
            detailHref = await linkEl.getAttribute('href');
            // If caseNumber is still null, try grabbing it from the link text
            if (!caseNumber) {
              const linkText = (await linkEl.innerText()).trim();
              if (/\b\d{4}\s+C[VF]\s+\d+/i.test(linkText)) {
                caseNumber = linkText.replace(/\s+/g, ' ');
              }
            }
          }

          // Attempt to parse defendant from any cell that looks like a caption
          // (contains "v." between two names)
          for (let i = 0; i < cellTexts.length; i++) {
            const t = cellTexts[i].trim();
            if (/\bv[s.]?\b/i.test(t) && t.length > 10) {
              // "BANK v. DOE" → defendant is the part after "v."
              const defMatch = t.match(/\bv[s.]?\s+(.+)/i);
              if (defMatch) {
                // Strip trailing dash/address if present
                defendant = defMatch[1].split(/\s+-\s+/)[0].trim();
              }
              break;
            }
          }

          // A row with no case number is not useful
          if (!caseNumber) continue;

          // ----------------------------------------------------------
          // 5. Follow the detail link to extract address + plaintiff
          // ----------------------------------------------------------
          let address = null;
          let plaintiff = null;

          if (detailHref) {
            const detailUrl = detailHref.startsWith('http')
              ? detailHref
              : new URL(detailHref, SOURCE_URL).href;

            const detailPage = await context.newPage();
            try {
              await detailPage.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30_000 });
              const detail = await extractDetailPageData(detailPage);
              address = detail.address;
              plaintiff = detail.plaintiff;
            } catch (detailErr) {
              console.warn(
                `[mahoning-preforeclosure] Could not load detail for case ${caseNumber}: ${detailErr.message}`
              );
            } finally {
              await detailPage.close();
            }

            // Polite delay between detail requests
            await new Promise(r => setTimeout(r, 600 + Math.random() * 600));
          }

          listings.push({
            address:         address || null,
            owner_name:      defendant || null,
            signal_type:     'pre_foreclosure',
            asking_price:    null,
            estimated_value: null,
            arv:             null,
            fair_offer:      null,
            comparables:     null,
            contact_info:    null,
            source_url:      SOURCE_URL,
            raw: {
              case_number:  caseNumber,
              filing_date:  filingDate || null,
              plaintiff:    plaintiff || null,
            },
          });
        } catch (rowErr) {
          console.warn(`[mahoning-preforeclosure] Skipping row due to error: ${rowErr.message}`);
        }
      }

      // ------------------------------------------------------------------
      // Advance to next page (if available)
      // ------------------------------------------------------------------
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
      `[mahoning-preforeclosure] Scraped ${listings.length} listings across ${pageNum} page(s).`
    );
    return listings;
  } finally {
    await browser.close();
  }
}

module.exports = { scrape };
