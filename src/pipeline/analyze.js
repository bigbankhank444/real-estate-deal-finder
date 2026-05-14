async function analyze(listings) {
  // TODO: call openrouter to score each listing
  return listings.map(listing => ({ ...listing, score: null }));
}

module.exports = { analyze };
