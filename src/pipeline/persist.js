const { getDb } = require('../utils/db');

const SQL = `
  INSERT INTO deals (
    address, owner_name, signal_type, asking_price, estimated_value,
    arv, fair_offer, comparables, contact_info, source_url, raw, score
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  ON CONFLICT (address, signal_type)
  DO UPDATE SET
    owner_name     = EXCLUDED.owner_name,
    asking_price   = EXCLUDED.asking_price,
    estimated_value = EXCLUDED.estimated_value,
    arv            = EXCLUDED.arv,
    fair_offer     = EXCLUDED.fair_offer,
    comparables    = EXCLUDED.comparables,
    contact_info   = EXCLUDED.contact_info,
    source_url     = EXCLUDED.source_url,
    raw            = EXCLUDED.raw,
    score          = EXCLUDED.score,
    updated_at     = NOW()
  RETURNING *
`;

async function persist(scoredListings) {
  if (!scoredListings || scoredListings.length === 0) return [];

  const db = getDb();

  const results = await Promise.all(
    scoredListings.map((listing) => {
      const {
        address,
        owner_name,
        signal_type,
        asking_price,
        estimated_value,
        arv,
        fair_offer,
        comparables,
        contact_info,
        source_url,
        raw,
        score,
      } = listing;

      return db.query(SQL, [
        address,
        owner_name,
        signal_type,
        asking_price,
        estimated_value,
        arv,
        fair_offer,
        comparables != null ? JSON.stringify(comparables) : null,
        contact_info,
        source_url,
        raw != null ? JSON.stringify(raw) : null,
        score,
      ]);
    })
  );

  return results.flatMap((res) => res.rows);
}

module.exports = { persist };
