const axios = require('axios');
const { getConfig } = require('../../config');

async function chat(messages, opts = {}) {
  const { apiKey, model } = getConfig().openrouter;
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    { model, messages, ...opts },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.choices[0].message.content;
}

module.exports = { chat };
