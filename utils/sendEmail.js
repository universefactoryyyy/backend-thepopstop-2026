const nodemailer = require('nodemailer');

// Sends mail through Gmail SMTP to the recipient's real inbox (`options.email`).
const sendEmail = async options => {
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_EMAIL;
    const fromEmail = process.env.SMTP_FROM_EMAIL || user;

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure: port === 465,
        requireTLS: port === 587,
        auth: {
            user,
            pass: process.env.SMTP_PASSWORD
        }
    });

    await transporter.sendMail({
        from: `${process.env.SMTP_FROM_NAME || 'The Pop Stop'} <${fromEmail}>`,
        to: options.email,
        subject: options.subject,
        html: options.html || `<p>${options.message}</p>`,
        attachments: options.attachments || []
    });
}

module.exports = sendEmail;
