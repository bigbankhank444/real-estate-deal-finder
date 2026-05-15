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

// ─── Pure normalization ───────────────────────────────────────────────────────

/**
 * Normalize an array of raw Craigslist items (already fetched from both the
 * list page and detail pages) into the canonical listing shape.
 *
 * This function is pure: no async, no I/O, no side effects.
 *
 * @param {Array<{
 *   href: string,
 *   title: string|null,
 *   price: string|null,
 *   postDate: string|null,
 *   detail: {
 *     description: string|null,
 *     detailPrice: string|null,
 *     address: string|null
 *   }|null
 * }>} rawItems
 * @returns {Array<object>}
 */
function parseListings(rawItems = []) {
  if (!Array.isArray(rawItems)) {
    throw new TypeError(`parseListings: expected Array, got ${typeof rawItems}`);
  }
  return rawItems.map(item => {
    const detail = item.detail;

    if (!detail) {
      // Detail fetch failed — emit a minimal record so the URL is captured
      return {
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
      };
    }

    // Resolve price: prefer search-result price, fall back to detail page price
    const priceRaw = item.price || detail.detailPrice;
    const askingPrice = parseDollars(priceRaw);

    // Extract phone from description
    const contactInfo = extractPhone(detail.description || '');

    return {
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
    };
  });
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
    const rawItems = [];
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
        if (offset === 0) {
          const pageTitle = await page.title();
          console.warn(`[craigslist] 0 items on first page. Page title: "${pageTitle}". May be CAPTCHA or empty results.`);
        }
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

          rawItems.push({ ...item, detail });
        } catch (detailErr) {
          // Non-fatal: capture the item with null detail so URL is preserved
          console.warn(`[craigslist] Detail fetch failed for ${item.href}: ${detailErr.message}. Skipping.`);
          rawItems.push({ ...item, detail: null });
        } finally {
          await detailPage.close();
        }
      }

      // Advance to next page
      offset += PAGE_SIZE;
    }

    const listings = parseListings(rawItems);
    console.log(`[craigslist] Returning ${listings.length} listing(s) total.`);
    return listings;
  } finally {
    await browser.close();
  }
}

module.exports = { scrape, parseListings };
