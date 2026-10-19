const multer = require("multer");
const path = require("path");

// Files are written to the OS temp folder, uploaded to Cloudinary, then deleted (see utils/cloudinaryUpload.js)
module.exports = multer({
    limits: { fileSize: 5 * 1024 * 1024, files: 10 },
    storage: multer.diskStorage({}),
    fileFilter: (req, file, cb) => {
        let ext = path.extname(file.originalname).toLowerCase();
        if (ext !== ".jpg" && ext !== ".jpeg" && ext !== ".png" && ext !== ".webp") {
            return cb(new Error("Unsupported file type! Only .jpg, .jpeg, .png and .webp images are allowed"), false);
        }
        cb(null, true);
    },
});
