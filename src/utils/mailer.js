const nodemailer = require('nodemailer');
const { getConfig } = require('../../config');

async function sendMail({ subject, text, html }) {
  const { host, port, user, pass, from, to } = getConfig().email;
  const transporter = nodemailer.createTransport({ host, port, auth: { user, pass } });
  await transporter.sendMail({ from, to, subject, text, html });
}

module.exports = { sendMail };
