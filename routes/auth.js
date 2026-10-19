const express = require('express');
const router = express.Router();
const upload = require("../utils/multer");

const {
    registerUser,
    loginUser,
    socialLogin,
    lookupUsername,
    getUserProfile,
    updateProfile,
    allUsers,
    deleteUser,
    getUserDetails,
    updateUser,
    logout,
} = require('../controllers/auth');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth')


router.post('/register', upload.single("avatar"), registerUser);
router.post('/login', loginUser);
router.post('/login/social', socialLogin);
router.post('/login/lookup', lookupUsername);
router.get('/logout', logout);
router.get('/me', isAuthenticatedUser, getUserProfile)
router.put('/me/update', isAuthenticatedUser, upload.single("avatar"), updateProfile)

router.get('/admin/users', isAuthenticatedUser, authorizeRoles('admin'), allUsers)
router.route('/admin/user/:id')
    .get(isAuthenticatedUser, authorizeRoles('admin'), getUserDetails)
    .put(isAuthenticatedUser, authorizeRoles('admin'), updateUser)
    .delete(isAuthenticatedUser, authorizeRoles('admin'), deleteUser)

module.exports = router;
