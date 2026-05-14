'use strict';

const { launchBrowser } = require('../utils/browser');

const BASE_URL = 'https://youngstown.craigslist.org/search/rea?purveyor=owner';
const MAX_OFFSET = 1200;
const PAGE_SIZE = 120;

// Matches common US phone number formats in free text
const PHONE_REGEX = /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a raw price string such as "$45,000" into a whole-dollar integer.
 * Returns null on failure.
 *
 * @param {string|null|undefined} raw
 * @returns {number|null}
 */
function parseDollars(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[$,\s]/g, '');
  const value = parseInt(cleaned, 10);
  return isNaN(value) ? null : value;
}

/**
 * Extract a US phone number from arbitrary text.
 * Returns the matched string or null.
 *
 * @param {string} text
 * @returns {string|null}
 */
function extractPhone(text) {
  if (!text) return null;
  const match = text.match(PHONE_REGEX);
  return match ? match[0].trim() : null;
}

// ─── Main scraper ─────────────────────────────────────────────────────────────

/**
 * Scrape Craigslist owner-listed real estate in Youngstown / Mahoning County.
 *
 * @returns {Promise<Array<object>>} Array of normalized listing objects.
 */
async function scrape() {
  const { browser, context, page } = await launchBrowser();

  try {
    const listings = [];
    let offset = 0;

    // ── Pagination loop ──────────────────────────────────────────────────────
    while (offset <= MAX_OFFSET) {
      const url = offset === 0 ? BASE_URL : `${BASE_URL}&s=${offset}`;
      console.log(`[craigslist] Fetching results page at offset ${offset}: ${url}`);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      } catch (navErr) {
        console.warn(`[craigslist] Navigation failed at offset ${offset}: ${navErr.message}. Stopping pagination.`);
        break;
      }

      // Small delay after page load (anti-bot courtesy)
      await new Promise(r => setTimeout(r, 800 + Math.random() * 700));

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

      console.log(`[craigslist] Found ${items.length} item(s) at offset ${offset}.`);

      // ── Fetch each post detail page ────────────────────────────────────────
      for (const item of items) {
        const detailPage = await context.newPage();
        try {
          await detailPage.goto(item.href, { waitUntil: 'domcontentloaded', timeout: 45_000 });

          // Polite delay
          await new Promise(r => setTimeout(r, 600 + Math.random() * 600));

          const detail = await detailPage.evaluate(() => {
            // Full post body text
            const bodyEl =
              document.querySelector('#postingbody') ||
              document.querySelector('.body');
            const description = bodyEl ? bodyEl.innerText.trim() : null;

            // Price on detail page (fallback)
            const priceEl =
              document.querySelector('span.price') ||
              document.querySelector('.price');
            const detailPrice = priceEl ? priceEl.textContent.trim() : null;

            // Address line (Craigslist sometimes shows it in .mapaddress or postinginfo)
            const addrEl =
              document.querySelector('.mapaddress') ||
              document.querySelector('[data-latitude]');
            const address = addrEl ? addrEl.textContent.trim() : null;

            return { description, detailPrice, address };
          });

          // Resolve price: prefer search-result price, fall back to detail page price
          const priceRaw = item.price || detail.detailPrice;
          const askingPrice = parseDollars(priceRaw);

          // Extract phone from description
          const contactInfo = extractPhone(detail.description || '');

          listings.push({
            address:         detail.address || null,
            owner_name:      null,
            signal_type:     'fsbo_craigslist',
            asking_price:    askingPrice,
            estimated_value: null,
            arv:             null,
            fair_offer:      null,
            comparables:     null,
            contact_info:    contactInfo,
            source_url:      item.href,
            raw: {
              post_title:  item.title || null,
              post_date:   item.postDate || null,
              description: detail.description || null,
            },
          });
        } catch (detailErr) {
          // Non-fatal: skip bad posts gracefully
          console.warn(`[craigslist] Detail fetch failed for ${item.href}: ${detailErr.message}. Skipping.`);

          // Still add a minimal record so the post URL is captured
          listings.push({
            address:         null,
            owner_name:      null,
            signal_type:     'fsbo_craigslist',
            asking_price:    parseDollars(item.price),
            estimated_value: null,
            arv:             null,
            fair_offer:      null,
            comparables:     null,
            contact_info:    null,
            source_url:      item.href,
            raw: {
              post_title:  item.title || null,
              post_date:   item.postDate || null,
              description: null,
            },
          });
        } finally {
          await detailPage.close();
        }
      }

      // Advance to next page
      offset += PAGE_SIZE;
    }

    console.log(`[craigslist] Returning ${listings.length} listing(s) total.`);
    return listings;
  } finally {
    await browser.close();
  }
}

module.exports = { scrape };
