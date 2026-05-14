const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

describe('sendMail', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSendMail.mockClear();
    mockCreateTransport.mockClear();
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user@test.com';
    process.env.SMTP_PASS = 'secret';
    process.env.EMAIL_FROM = 'from@test.com';
    process.env.EMAIL_TO = 'to@test.com';
  });

  it('creates transporter with SMTP config from env', async () => {
    const nodemailer = require('nodemailer');
    const { sendMail } = require('../../src/utils/mailer');

    await sendMail({ subject: 'Test', text: 'Hello', html: '<p>Hello</p>' });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.test.com',
      port: 587,
      auth: { user: 'user@test.com', pass: 'secret' },
    });
  });

  it('sends mail with from, to, subject, text, and html', async () => {
    const { sendMail } = require('../../src/utils/mailer');

    await sendMail({ subject: 'Deals', text: '3 deals found', html: '<b>3 deals</b>' });

    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'from@test.com',
      to: 'to@test.com',
      subject: 'Deals',
      text: '3 deals found',
      html: '<b>3 deals</b>',
    });
  });
});
