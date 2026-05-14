'use strict';

const { scrape: scrapeTaxDelinquent }  = require('../scrapers/mahoning-tax-delinquent');
const { scrape: scrapePreforeclosure } = require('../scrapers/mahoning-preforeclosure');
const { scrape: scrapeProbate }        = require('../scrapers/mahoning-probate');
const { scrape: scrapeZillow }         = require('../scrapers/zillow');
const { scrape: scrapeCraigslist }     = require('../scrapers/craigslist');

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

module.exports = { collect };
