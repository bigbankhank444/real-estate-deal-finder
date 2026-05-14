describe('validateConfig', () => {
  const REQUIRED = [
    'DATABASE_URL', 'OPENROUTER_API_KEY', 'SMTP_HOST', 'SMTP_USER',
    'SMTP_PASS', 'EMAIL_FROM', 'EMAIL_TO', 'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'SMS_TO',
  ];

  let savedEnv;

  beforeEach(() => {
    jest.resetModules();
    savedEnv = {};
    REQUIRED.forEach(key => {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    });
  });

  afterEach(() => {
    Object.assign(process.env, savedEnv);
  });

  it('throws when all required vars are missing', () => {
    const { validateConfig } = require('../config');
    expect(() => validateConfig()).toThrow('Missing required environment variables');
  });

  it('includes missing var names in the error message', () => {
    process.env.DATABASE_URL = 'postgres://test';
    const { validateConfig } = require('../config');
    expect(() => validateConfig()).toThrow('OPENROUTER_API_KEY');
  });

  it('does not throw when all required vars are present', () => {
    REQUIRED.forEach(key => { process.env[key] = 'test-value'; });
    const { validateConfig } = require('../config');
    expect(() => validateConfig()).not.toThrow();
  });
});

describe('getConfig', () => {
  it('returns openrouter model from env var', () => {
    process.env.OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-5';
    jest.resetModules();
    const { getConfig } = require('../config');
    expect(getConfig().openrouter.model).toBe('anthropic/claude-sonnet-4-5');
  });

  it('falls back to claude-sonnet-4-5 when OPENROUTER_MODEL is not set', () => {
    delete process.env.OPENROUTER_MODEL;
    jest.resetModules();
    const { getConfig } = require('../config');
    expect(getConfig().openrouter.model).toBe('anthropic/claude-sonnet-4-5');
    process.env.OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-5';
  });
});
