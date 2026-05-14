const axios = require('axios');
const { getConfig } = require('../../config');

async function chat(messages) {
  const { apiKey, model } = getConfig().openrouter;
  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    { model, messages },
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
