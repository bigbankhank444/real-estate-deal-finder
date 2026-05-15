const { chat } = require('../utils/openrouter');
const { sendMail } = require('../utils/mailer');
const { sendSMS } = require('../utils/sms');

async function notify(deals) {
  const qualifyingDeals = deals
    .filter((d) => d.score >= 70)
    .sort((a, b) => b.score - a.score);

  if (qualifyingDeals.length === 0) {
    console.log('No high-score deals today');
    return;
  }

  const dealSummaries = qualifyingDeals
    .map(
      (d) =>
        `Address: ${d.address}\nScore: ${d.score}/100\nSignal: ${d.signal_type}\nAsking Price: $${d.asking_price}\nRationale: ${d.raw && d.raw.rationale ? d.raw.rationale : 'N/A'}`
    )
    .join('\n\n');

  const prompt = `You are a real estate investment analyst. Generate a concise plain-text (no markdown) email digest for the following high-score wholesale real estate deals. For each deal, provide a brief summary covering the address, score, signal type, asking price, and rationale. Keep it professional and actionable.\n\nDeals:\n\n${dealSummaries}`;

  const digestText = await chat([{ role: 'user', content: prompt }]);

  const subject = `Real Estate Deals — ${new Date().toLocaleDateString()}`;
  await sendMail({ subject, text: digestText });

  const topDeal = qualifyingDeals[0];
  const smsBody = `RE Deal Alert: ${topDeal.address} | Score: ${topDeal.score}/100 | ${qualifyingDeals.length} deal(s) qualify today`.slice(0, 300);
  await sendSMS(smsBody);
}

module.exports = { notify };
