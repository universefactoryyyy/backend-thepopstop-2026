// load backend/.env before anything else reads process.env
require('./config/env');

const app = require('./app');
const connectDatabase = require('./config/database')
const { configureCloudinary, isCloudinaryConfigured } = require('./config/cloudinary');
const { isFirebaseConfigured } = require('./config/firebase');

const missing = ['DB_URI', 'JWT_SECRET'].filter(key => !process.env[key]);
if (missing.length) {
    console.error(`Missing required environment variable(s): ${missing.join(', ')}. Copy backend/.env.example to backend/.env and fill it in.`);
    process.exit(1);
}

connectDatabase();
configureCloudinary();

if (!isCloudinaryConfigured()) console.warn('WARNING: Cloudinary is not configured - image uploads will fail.');
if (!isFirebaseConfigured()) console.warn('WARNING: Firebase Admin is not configured - login/registration will fail.');
const smtpReady = process.env.SMTP_HOST && process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD
    && !/yourgmail|your_16_character|mailtrap/i.test(`${process.env.SMTP_EMAIL}${process.env.SMTP_PASSWORD}`);
if (!smtpReady) {
    console.warn('WARNING: Gmail SMTP is not configured - order emails will fail. Set SMTP_EMAIL and SMTP_PASSWORD (App Password) in .env and on Render.');
}

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
    console.log(`server started on port: ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});
