const User = require('../models/user');
const firebase = require('../config/firebase');
const sendToken = require('../utils/jwtToken');
const { uploadFiles, destroyImages } = require('../utils/cloudinaryUpload');

const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;

// Verifies the Firebase ID token sent by the browser. Returns the decoded token or sends a 401.
const verifyToken = async (idToken, res) => {
    if (!idToken) {
        res.status(400).json({ message: 'Firebase ID token is required' });
        return null;
    }
    try {
        return await firebase.verifyFirebaseToken(idToken);
    } catch (error) {
        if (/not configured|not found/i.test(error.message)) {
            res.status(500).json({ message: error.message });
        } else {
            res.status(401).json({ message: 'Invalid or expired Firebase token. Please sign in again' });
        }
        return null;
    }
}

const checkAccountStatus = (user, res) => {
    if (user.deletedAt) {
        res.status(401).json({ message: 'This account no longer exists' });
        return false;
    }
    if (!user.isActive) {
        res.status(403).json({ message: 'Your account has been deactivated. Please contact support' });
        return false;
    }
    return true;
}

// Finds the MongoDB profile of a Firebase user (by uid, or by a verified email for accounts seeded without a uid)
const findProfile = async (decoded) => {
    let user = await User.findOne({ firebaseUid: decoded.uid });
    if (user) return { user };

    const email = (decoded.email || '').toLowerCase();
    if (email) {
        user = await User.findOne({ email });
        if (user) {
            // only link by email when Firebase confirmed the address belongs to the person signing in
            if (user.firebaseUid && user.firebaseUid !== decoded.uid) {
                return { error: 'This email is linked to a different sign-in account' };
            }
            if (!decoded.email_verified) {
                return { error: 'Please verify your email address before signing in' };
            }
            user.firebaseUid = decoded.uid;
            await user.save({ validateBeforeSave: false });
            return { user };
        }
    }
    return {};
}

const splitName = (fullName = '') => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return { fname: parts[0] || '', lname: parts.slice(1).join(' ') };
}

// Register a profile for a Firebase email/password account => /api/v1/register
// The browser first creates the user in Firebase, then sends the ID token + profile fields here.
exports.registerUser = async (req, res, next) => {
    const { idToken, username, fname, lname, phone, addressline, zipcode } = req.body;

    const decoded = await verifyToken(idToken, res);
    if (!decoded) return;
    if (!decoded.email) return res.status(400).json({ message: 'Your Firebase account has no email address' });

    // server side validation (the form validates the same rules with Yup)
    if (!fname || !fname.trim()) return res.status(400).json({ message: 'First name is required' });
    if (!lname || !lname.trim()) return res.status(400).json({ message: 'Last name is required' });
    if (!phone || !PHONE_REGEX.test(phone)) return res.status(400).json({ message: 'Please enter a valid phone number' });
    if (!addressline || !addressline.trim()) return res.status(400).json({ message: 'Address is required' });
    if (username && !/^[A-Za-z0-9_.]{3,20}$/.test(username)) {
        return res.status(400).json({ message: 'Username must be 3-20 characters (letters, numbers, _ and .)' });
    }

    const existing = await User.findOne({ $or: [{ firebaseUid: decoded.uid }, { email: decoded.email.toLowerCase() }] });
    if (existing) {
        return res.status(409).json({ message: 'An account with this email already exists. Please login instead' });
    }

    let avatar = { public_id: '', url: '' };
    if (req.file) {
        const [uploaded] = await uploadFiles([req.file], 'popstop/avatars', { width: 300, height: 300, crop: 'fill', gravity: 'face' });
        avatar = uploaded;
    }

    let user;
    try {
        user = await User.create({
            name: `${fname.trim()} ${lname.trim()}`,
            username: username ? username.trim() : undefined,
            email: decoded.email,
            firebaseUid: decoded.uid,
            fname: fname.trim(),
            lname: lname.trim(),
            phone: phone.trim(),
            addressline: addressline.trim(),
            zipcode: zipcode ? zipcode.trim() : '',
            avatar
        });
    } catch (error) {
        await destroyImages([avatar]);
        throw error;
    }

    sendToken(user, 201, res)
}

// Email/password login: the browser signs in with Firebase, then sends the ID token => /api/v1/login
exports.loginUser = async (req, res, next) => {
    const decoded = await verifyToken(req.body.idToken, res);
    if (!decoded) return;

    const { user, error } = await findProfile(decoded);
    if (error) return res.status(403).json({ message: error });
    if (!user) {
        return res.status(404).json({ message: 'No Pop Stop profile found for this account. Please register first' });
    }
    if (!checkAccountStatus(user, res)) return;

    sendToken(user, 200, res)
}

// Google (or any other Firebase provider) login - creates the profile on first sign-in => /api/v1/login/social
exports.socialLogin = async (req, res, next) => {
    const decoded = await verifyToken(req.body.idToken, res);
    if (!decoded) return;

    let { user, error } = await findProfile(decoded);
    if (error) return res.status(403).json({ message: error });

    if (!user) {
        if (!decoded.email) {
            return res.status(400).json({ message: 'Your social account did not share an email address' });
        }
        const { fname, lname } = splitName(decoded.name || decoded.email.split('@')[0]);
        user = await User.create({
            name: `${fname} ${lname}`.trim(),
            email: decoded.email,
            firebaseUid: decoded.uid,
            fname,
            lname,
            avatar: { public_id: '', url: decoded.picture || '' }
        });
        return sendToken(user, 201, res);
    }
    if (!checkAccountStatus(user, res)) return;

    // Keep a Google photo only until the person uploads their own picture.
    if (!(user.avatar && user.avatar.public_id)) {
        const picture = decoded.picture || '';
        const current = (user.avatar && user.avatar.url) || '';
        if (current !== picture) {
            user.avatar = { public_id: '', url: picture };
            await user.save({ validateBeforeSave: false });
        }
    }

    sendToken(user, 200, res)
}

// Lets people log in with a username: returns the email the browser must use with Firebase => /api/v1/login/lookup
exports.lookupUsername = async (req, res, next) => {
    const identifier = String(req.body.identifier || '').trim().toLowerCase();
    const user = identifier ? await User.findOne({ username: identifier, deletedAt: null }) : null;
    if (!user) {
        return res.status(401).json({ message: 'Invalid username or password' })
    }
    return res.status(200).json({ success: true, email: user.email })
}

exports.getUserProfile = async (req, res, next) => {
    return res.status(200).json({
        success: true,
        user: req.user
    })
}

exports.updateProfile = async (req, res, next) => {
    const { fname, lname, username, phone, addressline, zipcode } = req.body;

    if (!fname || !fname.trim()) return res.status(400).json({ message: 'First name is required' });
    if (!lname || !lname.trim()) return res.status(400).json({ message: 'Last name is required' });
    if (!phone || !PHONE_REGEX.test(phone)) return res.status(400).json({ message: 'Please enter a valid phone number' });
    if (!addressline || !addressline.trim()) return res.status(400).json({ message: 'Address is required' });
    if (username && !/^[A-Za-z0-9_.]{3,20}$/.test(username)) {
        return res.status(400).json({ message: 'Username must be 3-20 characters (letters, numbers, _ and .)' });
    }

    const newUserData = {
        name: `${fname.trim()} ${lname.trim()}`,
        fname: fname.trim(),
        lname: lname.trim(),
        phone: phone.trim(),
        addressline: addressline.trim(),
        zipcode: zipcode ? zipcode.trim() : ''
    }
    if (username) newUserData.username = username.trim().toLowerCase();

    // Update avatar (Cloudinary)
    let uploadedAvatar = null;
    if (req.file) {
        [uploadedAvatar] = await uploadFiles([req.file], 'popstop/avatars', { width: 300, height: 300, crop: 'fill', gravity: 'face' });
        newUserData.avatar = uploadedAvatar;
    }

    let user;
    try {
        user = await User.findByIdAndUpdate(req.user.id, newUserData, {
            returnDocument: 'after',
            runValidators: true,
        })
    } catch (error) {
        if (uploadedAvatar) await destroyImages([uploadedAvatar]);
        throw error;
    }

    if (uploadedAvatar && req.user.avatar && req.user.avatar.public_id) {
        await destroyImages([req.user.avatar]);
    }

    return res.status(200).json({
        success: true,
        user
    })
}

// ------------------------- admin -------------------------

exports.allUsers = async (req, res, next) => {
    const users = await User.find({ deletedAt: null }).sort({ createdAt: -1 });
    res.status(200).json({
        success: true,
        users
    })
}

exports.getUserDetails = async (req, res, next) => {
    const user = await User.findById(req.params.id);

    if (!user || user.deletedAt) {
        return res.status(404).json({ message: `User does not found with id: ${req.params.id}` })
    }

    res.status(200).json({
        success: true,
        user
    })
}

// role assignment + status moderation
exports.updateUser = async (req, res, next) => {
    const user = await User.findById(req.params.id);
    if (!user || user.deletedAt) {
        return res.status(404).json({ message: `User does not found with id: ${req.params.id}` })
    }

    const isSelf = user._id.equals(req.user._id);
    const { role, isActive, name } = req.body;

    if (role !== undefined) {
        if (!['customer', 'employee', 'admin'].includes(role)) return res.status(400).json({ message: 'Role must be customer, employee, or admin' });
        if (isSelf && role !== user.role) return res.status(400).json({ message: 'You cannot change your own role' });
        user.role = role;
    }
    if (isActive !== undefined) {
        if (!isActive && user.role === 'admin') {
            return res.status(400).json({ message: 'You cannot deactivate an admin account' });
        }
        user.isActive = Boolean(isActive);
    }
    if (name !== undefined && name.trim()) user.name = name.trim();

    await user.save();

    return res.status(200).json({
        success: true,
        user
    })
}

// soft delete
exports.deleteUser = async (req, res, next) => {
    const user = await User.findById(req.params.id);

    if (!user || user.deletedAt) {
        return res.status(404).json({ message: `User does not found with id: ${req.params.id}` })
    }
    if (user._id.equals(req.user._id)) {
        return res.status(400).json({ message: 'You cannot delete your own account' })
    }

    user.deletedAt = new Date();
    user.isActive = false;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
        success: true,
    })
}

exports.logout = async (req, res, next) => {
    const options = sendToken.cookieOptions();
    res.cookie('token', '', { ...options, expires: new Date(0), maxAge: 0 });
    res.clearCookie('token', options);

    return res.status(200).json({
        success: true,
        message: 'Logged out'
    })
}
