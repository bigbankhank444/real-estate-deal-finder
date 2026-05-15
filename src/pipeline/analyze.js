const { chat } = require('../utils/openrouter');

async function analyze(listings) {
  const results = [];

  for (const listing of listings) {
    const scored = { ...listing, score: null };

    try {
      const prompt = `You are a real estate wholesaling deal analyst. Evaluate this potential wholesale deal and respond with ONLY valid JSON — no other text, no markdown, no code fences.

Deal details:
- Address: ${listing.address}
- Signal type: ${listing.signal_type}
- Asking price: $${listing.asking_price}
- Estimated value: $${listing.estimated_value}
- Comparables: ${JSON.stringify(listing.comparables)}

Respond with ONLY this JSON object:
{ "score": <integer 0-100>, "rationale": <string explaining the score> }`;

      const response = await chat([{ role: 'user', content: prompt }]);

      let parsed;
      try {
        parsed = JSON.parse(response);
      } catch {
        throw new Error(`Invalid JSON response: ${response}`);
      }

      if (parsed == null || typeof parsed.score !== 'number') {
        throw new Error(`Missing score field in response: ${response}`);
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
