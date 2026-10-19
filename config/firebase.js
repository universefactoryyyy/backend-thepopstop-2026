const fs = require('fs');
const path = require('path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

let app = null;

// Reads the service account either from a JSON file (FIREBASE_SERVICE_ACCOUNT_PATH)
// or from the FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY variables.
const loadCredentials = () => {
    const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (filePath) {
        const resolved = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);
        if (!fs.existsSync(resolved)) {
            throw new Error(`Firebase service account file not found: ${resolved}`);
        }
        return JSON.parse(fs.readFileSync(resolved, 'utf8'));
    }
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        return {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        };
    }
    throw new Error('Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH (or the FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY variables) in backend/.env');
}

const getFirebaseApp = () => {
    if (!app) {
        app = getApps()[0] || initializeApp({ credential: cert(loadCredentials()) });
    }
    return app;
}

// firebase-admin v14 exports initializeApp/cert/getAuth directly. This wrapper
// keeps the auth() shape the seeder already calls.
const getFirebaseAdmin = () => {
    const firebaseApp = getFirebaseApp();
    return { auth: () => getAuth(firebaseApp) };
}

const isFirebaseConfigured = () =>
    Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
        (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY));

// Verifies a Firebase ID token sent by the browser. Throws when the token is invalid/expired.
const verifyFirebaseToken = async (idToken) => {
    return getAuth(getFirebaseApp()).verifyIdToken(idToken);
}

module.exports = { getFirebaseAdmin, isFirebaseConfigured, verifyFirebaseToken }
