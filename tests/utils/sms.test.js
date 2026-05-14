const mockCreate = jest.fn().mockResolvedValue({ sid: 'SM123' });
const mockMessagesCreate = { messages: { create: mockCreate } };
const mockTwilio = jest.fn().mockReturnValue(mockMessagesCreate);

jest.mock('twilio', () => mockTwilio);

describe('sendSMS', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCreate.mockClear();
    mockTwilio.mockClear();
    process.env.TWILIO_ACCOUNT_SID = 'ACtest1234';
    process.env.TWILIO_AUTH_TOKEN = 'auth-token';
    process.env.TWILIO_FROM = '+10000000000';
    process.env.SMS_TO = '+10000000001';
  });

  it('creates Twilio client with account SID and auth token', async () => {
    const twilio = require('twilio');
    const { sendSMS } = require('../../src/utils/sms');

    await sendSMS('3 deals found today');

    expect(twilio).toHaveBeenCalledWith('ACtest1234', 'auth-token');
  });

  it('sends SMS with body, from, and to', async () => {
    const { sendSMS } = require('../../src/utils/sms');

    await sendSMS('3 deals found today');

    expect(mockCreate).toHaveBeenCalledWith({
      body: '3 deals found today',
      from: '+10000000000',
      to: '+10000000001',
    });
  });
});
