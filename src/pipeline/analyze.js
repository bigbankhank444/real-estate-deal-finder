const { chat } = require('../utils/openrouter');

async function analyze(listings) {
  const results = [];

  for (const listing of listings) {
    const scored = { ...listing, score: null };

    // Nothing to score — skip the AI call to save tokens
    if (!listing.address && !listing.estimated_value && !listing.arv) {
      results.push(scored);
      continue;
    }

    try {
      const prompt = `You are a real estate wholesaling deal analyst. Score this potential wholesale deal.

Deal details:
- Address: ${listing.address}
- Signal type: ${listing.signal_type}
- Asking price: $${listing.asking_price ?? 'unknown'}
- Estimated value: $${listing.estimated_value ?? 'unknown'}
- Comparables: ${listing.comparables ? JSON.stringify(listing.comparables) : 'none available'}

Return JSON with exactly two keys: "score" (integer 0-100) and "rationale" (one sentence string). Score 60+ only if the deal shows clear margin or distress signal. Score 30-59 for possible deals with limited data. Score below 30 for insufficient information.`;

      const response = await chat(
        [{ role: 'user', content: prompt }],
        { response_format: { type: 'json_object' } }
      );

      let parsed;
      try {
        const cleaned = response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error(`Invalid JSON response: ${response}`);
      }

      const s = parsed.score;
      if (!Number.isInteger(s) || s < 0 || s > 100) {
        throw new Error(`Score out of range or not integer: ${s}`);
      }

      if (typeof parsed.rationale !== 'string') {
        throw new Error(`Missing or invalid rationale: ${JSON.stringify(parsed.rationale)}`);
      }

      scored.score = parsed.score;
      scored.raw = { ...scored.raw, rationale: parsed.rationale };
    } catch (err) {
      console.warn(`analyze: failed to score listing ${listing.address}:`, err.message);
    }

    results.push(scored);
  }

  return results;
}

module.exports = { analyze };
