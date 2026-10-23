const nodemailer = require('nodemailer');

const isTimeout = (error) =>
    /timeout|timed out|ETIMEDOUT|ECONNECTION|ECONNREFUSED|ESOCKET/i.test(error && error.message ? error.message : '');

const sendWithPort = async (port, user, pass, options, fromEmail) => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure: port === 465,
        requireTLS: port === 587,
        family: 4,
        connectionTimeout: 12000,
        greetingTimeout: 12000,
        socketTimeout: 20000,
        auth: { user, pass }
    });

    await transporter.sendMail({
        from: `${process.env.SMTP_FROM_NAME || 'The Pop Stop'} <${fromEmail}>`,
        to: options.email,
        subject: options.subject,
        html: options.html || `<p>${options.message}</p>`,
        attachments: options.attachments || []
    });
};

// Sends mail through Gmail SMTP to the recipient's real inbox (`options.email`).
// Render often times out on port 587 / IPv6, so we force IPv4 and retry 465.
const sendEmail = async options => {
    const preferredPort = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_EMAIL;
    const fromEmail = process.env.SMTP_FROM_EMAIL || user;
    const pass = (process.env.SMTP_PASSWORD || '').replace(/\s+/g, '');

    if (!user || !pass) {
        throw new Error('Gmail SMTP is not configured (SMTP_EMAIL / SMTP_PASSWORD)');
    }
    if (/yourgmail|your_16_character|mailtrap/i.test(`${user}${pass}`)) {
        throw new Error('Gmail SMTP still has placeholder values. Put your real Gmail and App Password in SMTP_EMAIL / SMTP_PASSWORD');
    }

    try {
        await sendWithPort(preferredPort, user, pass, options, fromEmail);
    } catch (error) {
        const fallbackPort = preferredPort === 465 ? 587 : 465;
        if (!isTimeout(error)) throw error;
        console.log(`SMTP port ${preferredPort} failed (${error.message}). Retrying port ${fallbackPort}...`);
        await sendWithPort(fallbackPort, user, pass, options, fromEmail);
    }
}

module.exports = sendEmail;
