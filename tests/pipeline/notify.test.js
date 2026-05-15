jest.mock('../../src/utils/openrouter');
jest.mock('../../src/utils/mailer');
jest.mock('../../src/utils/sms');

const { chat } = require('../../src/utils/openrouter');
const { sendMail } = require('../../src/utils/mailer');
const { sendSMS } = require('../../src/utils/sms');
const { notify } = require('../../src/pipeline/notify');

const HIGH_DEAL = {
  address: '123 Main St, Youngstown, OH',
  signal_type: 'tax_delinquent',
  asking_price: 50000,
  score: 85,
  raw: { rationale: 'Great ROI' },
};

const LOW_DEAL = {
  address: '456 Elm St, Youngstown, OH',
  signal_type: 'fsbo_craigslist',
  asking_price: 80000,
  score: 55,
  raw: { rationale: 'Overpriced' },
};

describe('notify', () => {
  beforeEach(() => {
    chat.mockReset();
    sendMail.mockReset();
    sendSMS.mockReset();
  });

  it('skips sending when no deals score >= 70', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await notify([LOW_DEAL]);

    expect(chat).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('No high-score deals today');

    consoleSpy.mockRestore();
  });

  it('calls openrouter, sendMail, and sendSMS when deals qualify', async () => {
    chat.mockResolvedValue('Deal digest: 123 Main St scores 85/100. Tax delinquent property with great ROI at $50,000.');
    sendMail.mockResolvedValue(undefined);
    sendSMS.mockResolvedValue(undefined);

    await notify([HIGH_DEAL, LOW_DEAL]);

    expect(chat).toHaveBeenCalledTimes(1);
    const chatMessages = chat.mock.calls[0][0];
    expect(Array.isArray(chatMessages)).toBe(true);
    expect(chatMessages[0].role).toBe('user');
    expect(chatMessages[0].content).toContain(HIGH_DEAL.address);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mailArgs = sendMail.mock.calls[0][0];
    expect(mailArgs.subject).toContain('Real Estate Deals');
    expect(mailArgs.text).toBeTruthy();

    expect(sendSMS).toHaveBeenCalledTimes(1);
    const smsArg = sendSMS.mock.calls[0][0];
    expect(typeof smsArg).toBe('string');
    expect(smsArg).toContain(HIGH_DEAL.address);
  });

  it('SMS body is under 300 chars', async () => {
    const longAddressDeal = {
      ...HIGH_DEAL,
      address: 'A'.repeat(280) + ' St, Youngstown, OH',
    };
    chat.mockResolvedValue('Digest for long address deal.');
    sendMail.mockResolvedValue(undefined);
    sendSMS.mockResolvedValue(undefined);

    await notify([longAddressDeal]);

    const smsArg = sendSMS.mock.calls[0][0];
    expect(smsArg.length).toBeLessThanOrEqual(300);
  });
});
