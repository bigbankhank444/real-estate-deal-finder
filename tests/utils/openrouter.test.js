jest.mock('axios');
const axios = require('axios');

describe('chat', () => {
  beforeEach(() => {
    jest.resetModules();
    axios.post = jest.fn();
  });

  it('posts to OpenRouter with correct URL, model, messages, and auth header', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-test-key';
    process.env.OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-5';

    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'Deal score: 85' } }] },
    });

    const { chat } = require('../../src/utils/openrouter');
    const messages = [{ role: 'user', content: 'Score this deal' }];
    const result = await chat(messages);

    expect(result).toBe('Deal score: 85');
    expect(axios.post).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-sonnet-4-5',
        messages,
      },
      {
        headers: {
          Authorization: 'Bearer sk-test-key',
          'Content-Type': 'application/json',
        },
      }
    );
  });

  it('propagates errors from the API', async () => {
    axios.post.mockRejectedValue(new Error('API rate limit'));
    const { chat } = require('../../src/utils/openrouter');
    await expect(chat([{ role: 'user', content: 'hello' }])).rejects.toThrow('API rate limit');
  });
});
