'use strict';

const { parseListings } = require('../../src/scrapers/craigslist');

// ─── Test 1: full item with detail present ────────────────────────────────────

test('parseListings: full item with detail returns all fields correctly', () => {
  const rawItems = [
    {
      href: 'https://youngstown.craigslist.org/rea/d/house/123.html',
      title: 'Nice 3BR house',
      price: '$45,000',
      postDate: '2026-01-15T00:00:00Z',
      detail: {
        description: 'Large lot. Call 330-555-1234.',
        detailPrice: '$46,000',
        address: '123 Main St, Youngstown OH',
      },
    },
  ];

  const results = parseListings(rawItems);

  expect(results).toHaveLength(1);

  const listing = results[0];
  expect(listing.address).toBe('123 Main St, Youngstown OH');
  expect(listing.owner_name).toBeNull();
  expect(listing.signal_type).toBe('fsbo_craigslist');
  // Prefers list price ($45,000) over detail price ($46,000)
  expect(listing.asking_price).toBe(45000);
  expect(listing.estimated_value).toBeNull();
  expect(listing.arv).toBeNull();
  expect(listing.fair_offer).toBeNull();
  expect(listing.comparables).toBeNull();
  expect(listing.contact_info).toBe('330-555-1234');
  expect(listing.source_url).toBe('https://youngstown.craigslist.org/rea/d/house/123.html');
  expect(listing.raw.post_title).toBe('Nice 3BR house');
  expect(listing.raw.post_date).toBe('2026-01-15T00:00:00Z');
  expect(listing.raw.description).toBe('Large lot. Call 330-555-1234.');
});

// ─── Test 2: null detail — graceful fallback ──────────────────────────────────

test('parseListings: null detail produces minimal record with URL captured', () => {
  const rawItems = [
    {
      href: 'https://youngstown.craigslist.org/rea/d/house/456.html',
      title: 'Fixer upper',
      price: '$30,000',
      postDate: '2026-02-01T00:00:00Z',
      detail: null,
    },
  ];

  const results = parseListings(rawItems);

  expect(results).toHaveLength(1);

  const listing = results[0];
  expect(listing.address).toBeNull();
  expect(listing.owner_name).toBeNull();
  expect(listing.signal_type).toBe('fsbo_craigslist');
  // Falls back to item.price when detail is null
  expect(listing.asking_price).toBe(30000);
  expect(listing.estimated_value).toBeNull();
  expect(listing.arv).toBeNull();
  expect(listing.fair_offer).toBeNull();
  expect(listing.comparables).toBeNull();
  expect(listing.contact_info).toBeNull();
  expect(listing.source_url).toBe('https://youngstown.craigslist.org/rea/d/house/456.html');
  expect(listing.raw.post_title).toBe('Fixer upper');
  expect(listing.raw.post_date).toBe('2026-02-01T00:00:00Z');
  expect(listing.raw.description).toBeNull();
});

// ─── Test 3: empty array ──────────────────────────────────────────────────────

test('parseListings: empty array returns []', () => {
  expect(parseListings([])).toEqual([]);
});

// ─── Test 3b: non-array argument throws TypeError ─────────────────────────────

test('parseListings: throws TypeError for non-array input', () => {
  expect(() => parseListings(null)).toThrow(TypeError);
  expect(() => parseListings('string')).toThrow(TypeError);
  expect(() => parseListings(42)).toThrow(TypeError);
});

// ─── Test 4: parseDollars edge cases via parseListings ────────────────────────

test('parseListings: price parsing handles edge cases correctly', () => {
  const cases = [
    // [list price, detail price, expected asking_price]
    ['$1,250,000', null, 1250000],
    [null, '$75,500', 75500],
    [null, null, null],
    ['not-a-price', null, null],
    ['$0', null, 0],
  ];

  for (const [listPrice, detailPrice, expected] of cases) {
    const rawItems = [
      {
        href: 'https://youngstown.craigslist.org/rea/d/house/999.html',
        title: null,
        price: listPrice,
        postDate: null,
        detail: {
          description: null,
          detailPrice,
          address: null,
        },
      },
    ];

    const results = parseListings(rawItems);
    expect(results[0].asking_price).toBe(expected);
  }
});
