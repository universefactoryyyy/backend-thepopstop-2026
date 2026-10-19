const fs = require('fs');
const cloudinary = require('cloudinary');

const removeTempFile = (file) => {
    if (file && file.path) fs.unlink(file.path, () => { });
}

// Uploads multer files (req.files / req.file) to a Cloudinary folder
// and returns [{ public_id, url }] - the shape stored in product.images / user.avatar
exports.uploadFiles = async (files = [], folder = 'popstop/products', options = {}) => {
    const uploaded = [];
    try {
        for (const file of files) {
            const result = await cloudinary.v2.uploader.upload(file.path, { folder, ...options });
            uploaded.push({ public_id: result.public_id, url: result.secure_url });
        }
    } catch (error) {
        // don't leave half a product's photos behind
        await exports.destroyImages(uploaded);
        throw error;
    } finally {
        files.forEach(removeTempFile);
    }
    return uploaded;
}

// Deletes the multer temp files when a request is rejected before anything is uploaded
exports.discardFiles = (files = []) => files.forEach(removeTempFile);

exports.destroyImages = async (images = []) => {
    for (const image of images) {
        if (!image || !image.public_id) continue;
        try {
            await cloudinary.v2.uploader.destroy(image.public_id);
        } catch (error) {
            console.log(`Could not delete Cloudinary image ${image.public_id}: ${error.message}`);
        }
    }
}
