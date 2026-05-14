const twilio = require('twilio');
const { getConfig } = require('../../config');

async function sendSMS(body) {
  const { accountSid, authToken, from, to } = getConfig().sms;
  const client = twilio(accountSid, authToken);
  await client.messages.create({ body, from, to });
}

module.exports = { sendSMS };
