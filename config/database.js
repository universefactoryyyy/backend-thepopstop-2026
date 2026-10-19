const mongoose = require('mongoose');

const connectDatabase = async () => {
    if (!process.env.DB_URI) {
        console.error('DB_URI is not set. Copy backend/.env.example to backend/.env and fill it in.');
        process.exit(1);
    }
    try {
        const con = await mongoose.connect(process.env.DB_URI);
        console.log(`MongoDB Database connected with HOST: ${con.connection.host}`);
    } catch (error) {
        console.error(`MongoDB connection failed: ${error.message}`);
        process.exit(1);
    }
}

module.exports = connectDatabase
