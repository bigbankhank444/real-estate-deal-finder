'use strict';

const { launchBrowser } = require('../utils/browser');
const { withRetry } = require('../utils/retry');

const FSBO_URL = 'https://www.zillow.com/mahoning-county-oh/fsbo/';
const ZILLOW_BASE = 'https://www.zillow.com';

// Maximum number of FSBO listings for which we will fetch detail pages.
// Beyond this threshold comps are left null to keep runtime reasonable.
const COMPS_FETCH_LIMIT = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a raw price value (string or number) into a whole-dollar integer.
 * Accepts "$123,456", "123456", 123456, etc.
 * Returns null on failure.
 *
 * @param {*} raw
 * @returns {number|null}
 */
function parseDollars(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Math.round(raw);
  const cleaned = String(raw).replace(/[$,\s]/g, '');
  const value = parseInt(cleaned, 10);
  return isNaN(value) ? null : value;
}

/**
 * Build a full address string from components that Zillow may provide
 * separately or already combined.
 *
 * @param {object} item  — raw listing object from __NEXT_DATA__
 * @returns {string|null}
 */
function buildAddress(item) {
  if (!item) return null;

  // Already a full address string
  if (typeof item.address === 'string' && item.address.trim()) {
    return item.address.trim();
  }

  // Structured address object: { streetAddress, city, state, zipcode }
  if (item.address && typeof item.address === 'object') {
    const a = item.address;
    const parts = [
      a.streetAddress || a.street,
      a.city,
      a.state,
      a.zipcode || a.zip,
    ].filter(Boolean);
    if (parts.length) return parts.join(', ');
  }

  // Flat address components
  const street = item.addressStreet || item.streetAddress || item.street || '';
  const city   = item.addressCity   || item.city   || '';
  const state  = item.addressState  || item.state  || '';
  const zip    = item.addressZipcode || item.zipcode || item.zip || '';

  const parts = [street, city, state, zip].filter(Boolean);
  if (parts.length) return parts.join(', ');

  return null;
}

/**
 * Deep-walk a JSON value looking for the first array whose items look like
 * Zillow FSBO listing objects (have `address` or `zpid`).
 *
 * @param {*}      data
 * @param {number} [depth=0]
 * @returns {Array|null}
 */
function findListings(data, depth = 0) {
  if (depth > 12 || data === null || typeof data !== 'object') return null;

  if (Array.isArray(data)) {
    if (data.length > 0) {
      const sample = data[0];
      if (
        sample &&
        typeof sample === 'object' &&
        (sample.zpid !== undefined || sample.address !== undefined || sample.detailUrl !== undefined)
      ) {
        return data;
      }
    }
    for (const item of data) {
      const found = findListings(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  // Prefer known high-probability paths first
  const priorityKeys = ['listResults', 'searchResults', 'results', 'homes', 'listings'];
  for (const key of priorityKeys) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const found = findListings(data[key], depth + 1);
      if (found) return found;
    }
  }

  for (const key of Object.keys(data)) {
    if (priorityKeys.includes(key)) continue; // already checked
    const found = findListings(data[key], depth + 1);
    if (found) return found;
  }

  return null;
}

/**
 * Extract sold comps from the detail page's __NEXT_DATA__ blob.
 * Returns an array of comp objects or null if none found.
 *
 * @param {object} data  — parsed __NEXT_DATA__ JSON
 * @returns {Array<object>|null}
 */
function findComps(data) {
  if (!data || typeof data !== 'object') return null;

  // gdpClientCache is a keyed map; values contain `property` sub-objects
  const cache = deepGet(data, ['props', 'pageProps', 'gdpClientCache']);
  if (cache && typeof cache === 'object') {
    for (const cacheValue of Object.values(cache)) {
      const property = cacheValue && (cacheValue.property || cacheValue);
      if (!property) continue;

      // Look for nearbyHomes / comps arrays
      for (const key of ['nearbyHomes', 'comps', 'recentlySold', 'nearbyProperties']) {
        const arr = property[key];
        if (Array.isArray(arr) && arr.length > 0) {
          return normalizeComps(arr);
        }
      }
    }
  }

  // Fallback: walk the whole object for any nearbyHomes array
  const found = deepFind(data, (val, key) =>
    (key === 'nearbyHomes' || key === 'comps' || key === 'recentlySold') &&
    Array.isArray(val) &&
    val.length > 0
  );
  if (found) return normalizeComps(found);

  return null;
}

/**
 * Normalize a raw comps array into the required shape.
 *
 * @param {Array} arr
 * @returns {Array<{address, sold_price, sold_date, beds, baths, sqft}>}
 */
function normalizeComps(arr) {
  const results = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const comp = {
      address:    buildAddress(item) || (item.address ? String(item.address) : null),
      sold_price: parseDollars(item.soldPrice || item.price || item.lastSoldPrice || null),
      sold_date:  item.soldDate || item.dateSold || item.lastSoldDate || null,
      beds:       item.beds || item.bedrooms || null,
      baths:      item.baths || item.bathrooms || null,
      sqft:       item.area || item.livingArea || item.sqft || null,
    };
    // Only include comps that have at least address or sold_price
    if (comp.address || comp.sold_price) {
      results.push(comp);
    }
  }
  return results.length ? results : null;
}

/**
 * Safely retrieve a value at a dot-path within an object.
 *
 * @param {object} obj
 * @param {string[]} keys
 * @returns {*}
 */
function deepGet(obj, keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

/**
 * Walk an object tree and return the first value for which predicate is true.
 *
 * @param {*}        data
 * @param {Function} predicate  (value, key) => boolean
 * @param {number}   [depth=0]
 * @returns {*|null}
 */
function deepFind(data, predicate, depth = 0) {
  if (depth > 15 || data === null || typeof data !== 'object') return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = deepFind(item, predicate, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  for (const [key, val] of Object.entries(data)) {
    if (predicate(val, key)) return val;
    const found = deepFind(val, predicate, depth + 1);
    if (found !== null) return found;
  }

  return null;
}

/**
 * Extract __NEXT_DATA__ JSON from the current Playwright page.
 * Returns the parsed object or null.
 *
 * @param {object} page  — Playwright Page
 * @returns {Promise<object|null>}
 */
async function extractNextData(page) {
  try {
    const raw = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      return el ? el.textContent : null;
    });
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[zillow] Failed to extract __NEXT_DATA__: ${err.message}`);
    return null;
  }
}

// ─── Main scraper ─────────────────────────────────────────────────────────────

/**
 * Scrape Zillow FSBO listings for Mahoning County, OH.
 *
 * @returns {Promise<Array<object>>} Array of normalized listing objects.
 */
async function scrape() {
  const { browser, context, page } = await launchBrowser();

  try {
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

    // ── Step 3: Locate the listing array inside the JSON blob ─────────────
    // Try well-known paths first, then fall back to deep search
    let rawListings =
      deepGet(searchData, ['props', 'pageProps', 'searchPageState', 'cat1', 'searchResults', 'listResults']) ||
      deepGet(searchData, ['props', 'pageProps', 'initialData', 'searchResults', 'listResults']) ||
      deepGet(searchData, ['props', 'pageProps', 'searchPageState', 'cat1', 'searchResults', 'mapResults']) ||
      findListings(searchData);

    if (!rawListings || !Array.isArray(rawListings) || rawListings.length === 0) {
      console.warn('[zillow] No FSBO listings found in __NEXT_DATA__. The page structure may have changed.');
      return [];
    }

    console.log(`[zillow] Found ${rawListings.length} FSBO listing(s) in __NEXT_DATA__.`);

    // ── Step 4: Normalize each listing ───────────────────────────────────
    const listings = rawListings.map(item => {
      const address    = buildAddress(item);
      const askingRaw  = item.unformattedPrice || item.price || null;
      const askingPrice = parseDollars(askingRaw);
      const zestimate  = parseDollars(item.zestimate || null);
      const detailUrl  = item.detailUrl
        ? (item.detailUrl.startsWith('http') ? item.detailUrl : ZILLOW_BASE + item.detailUrl)
        : null;

      return {
        address,
        owner_name:      null,
        signal_type:     'fsbo_zillow',
        asking_price:    askingPrice,
        estimated_value: zestimate,
        arv:             null,
        fair_offer:      null,
        comparables:     null,   // filled in below (if within fetch limit)
        contact_info:    null,
        source_url:      detailUrl || FSBO_URL,
        raw: {
          zpid:   item.zpid || null,
          beds:   item.beds !== undefined ? item.beds : null,
          baths:  item.baths !== undefined ? item.baths : null,
          sqft:   item.area !== undefined ? item.area : null,
          status: item.statusType || item.homeStatus || null,
        },
      };
    });

    // ── Step 5: Fetch detail pages for comps (limited to COMPS_FETCH_LIMIT) ─
    const fetchCount = Math.min(listings.length, COMPS_FETCH_LIMIT);

    if (listings.length > COMPS_FETCH_LIMIT) {
      console.log(
        `[zillow] ${listings.length} listings exceeds fetch limit (${COMPS_FETCH_LIMIT}). ` +
        `Comps will be fetched for the first ${fetchCount}; the rest will have comparables: null.`
      );
    }

    for (let i = 0; i < fetchCount; i++) {
      const listing = listings[i];
      const detailUrl = listing.source_url;

      // Skip if we have no valid listing-specific detail URL
      if (!detailUrl || !detailUrl.startsWith('http') || detailUrl === FSBO_URL) {
        console.warn(`[zillow] Listing #${i + 1} has no detail URL; skipping comps fetch.`);
        continue;
      }

      const detailPage = await context.newPage();
      try {
        await detailPage.goto(detailUrl, { waitUntil: 'networkidle', timeout: 45_000 });

        const detailData = await extractNextData(detailPage);
        if (detailData) {
          const comps = findComps(detailData);
          listing.comparables = comps; // null if none found
          if (comps) {
            console.log(`[zillow] Listing #${i + 1} (${listing.address}): found ${comps.length} comp(s).`);
          } else {
            console.log(`[zillow] Listing #${i + 1} (${listing.address}): no comps in __NEXT_DATA__.`);
          }
        } else {
          console.warn(`[zillow] Listing #${i + 1}: detail page __NEXT_DATA__ missing; comparables set to null.`);
          listing.comparables = null;
        }
      } catch (detailErr) {
        // Non-fatal: log and leave comparables as null
        console.warn(
          `[zillow] Listing #${i + 1} detail page failed (${detailUrl}): ${detailErr.message}. ` +
          `comparables set to null.`
        );
        listing.comparables = null;
      } finally {
        await detailPage.close();
      }

      // Random delay between detail fetches to avoid rate limiting (1-2 seconds)
      if (i < fetchCount - 1) {
        const delay = 1000 + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }

    console.log(`[zillow] Returning ${listings.length} FSBO listing(s).`);
    return listings;
  } finally {
    await browser.close();
  }
}

module.exports = { scrape };
