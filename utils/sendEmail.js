const toBase64 = (content) => {
    if (!content) return '';
    if (Buffer.isBuffer(content)) return content.toString('base64');
    return Buffer.from(content).toString('base64');
};

const sendEmail = async options => {
    const apiKey = (process.env.BREVO_API_KEY || '').trim();
    const fromName = process.env.BREVO_FROM_NAME || 'The Pop Stop';
    const fromEmail = process.env.BREVO_FROM_EMAIL;

    if (!apiKey) {
        throw new Error('Email is not configured. Set BREVO_API_KEY');
    }
    if (!fromEmail) {
        throw new Error('Email is not configured. Set BREVO_FROM_EMAIL to a sender verified in Brevo');
    }

    const payload = {
        sender: { name: fromName, email: fromEmail },
        to: [{ email: options.email }],
        subject: options.subject,
        htmlContent: options.html || `<p>${options.message || ''}</p>`,
    };
    if (options.attachments && options.attachments.length) {
        payload.attachment = options.attachments.map((file) => ({
            name: file.filename,
            content: toBase64(file.content),
        }));
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'api-key': apiKey,
        },
        body: JSON.stringify(payload),
    });

    if (response.ok) return;
    let detail = `Brevo HTTP ${response.status}`;
    try {
        const body = await response.json();
        detail = body.message || body.error || JSON.stringify(body);
    } catch (error) {
        // keep status text
    }
    throw new Error(detail);
};

module.exports = sendEmail;
