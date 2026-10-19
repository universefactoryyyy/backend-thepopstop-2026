const cookieOptions = () => {
    const isProduction = process.env.NODE_ENV === 'production';
    return {
        httpOnly: true,
        path: '/',
        // browsers only accept SameSite=None cookies over https
        secure: isProduction,
        sameSite: process.env.COOKIE_SAMESITE || (isProduction ? 'none' : 'lax'),
    }
}

// Issues our own session JWT (httpOnly cookie) after a Firebase ID token has been verified
const sendToken = (user, statusCode, res) => {

    // Create Jwt token
    const token = user.getJwtToken();

    // Options for cookie
    const options = {
        ...cookieOptions(),
        expires: new Date(
            Date.now() + (Number(process.env.COOKIE_EXPIRES_TIME) || 7) * 24 * 60 * 60 * 1000
        ),
    }

    res.status(statusCode).cookie('token', token, options).json({
        success: true,
        user
    })

}

sendToken.cookieOptions = cookieOptions;

module.exports = sendToken;
