require('dotenv').config();

const REQUIRED = [
  'DATABASE_URL',
  'OPENROUTER_API_KEY',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM',
  'EMAIL_TO',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM',
  'SMS_TO',
];

function validateConfig() {
  const missing = REQUIRED.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function getConfig() {
  return {
    db: {
      url: process.env.DATABASE_URL,
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-5',
    },
    email: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_TO,
    },
    sms: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      from: process.env.TWILIO_FROM,
      to: process.env.SMS_TO,
    },
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

module.exports = { validateConfig, getConfig };
