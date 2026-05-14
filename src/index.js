require('dotenv').config();
const { validateConfig } = require('../config');
const { collect } = require('./pipeline/collect');
const { analyze } = require('./pipeline/analyze');
const { persist } = require('./pipeline/persist');
const { notify } = require('./pipeline/notify');

async function run() {
  validateConfig();

  console.log('[1/4] Collecting listings...');
  const listings = await collect();
  console.log(`[1/4] Collected ${listings.length} listings`);

  console.log('[2/4] Analyzing deals...');
  const scoredListings = await analyze(listings);
  console.log(`[2/4] Analyzed ${scoredListings.length} listings`);

  console.log('[3/4] Persisting deals...');
  const savedDeals = await persist(scoredListings);
  console.log(`[3/4] Persisted ${savedDeals.length} deals`);

  console.log('[4/4] Sending notifications...');
  await notify(savedDeals);
  console.log('[4/4] Notifications sent');
}

run().catch(err => {
  console.error('Pipeline failed:', err.message);
  process.exit(1);
});
