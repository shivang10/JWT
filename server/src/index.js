require('dotenv/config');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { verify } = require('jsonwebtoken');
const { hash, compare } = require('bcryptjs');
const { fakeDB } = require('./fakeDB');
const {
    createAccessToken,
    createRefreshToken,
    sendRefreshToken,
    sendAccessToken
} = require('./tokens');
const { isAuth } = require('./isAuth');

//1. Register a user
//2. Login user
//3. Logout a user
//4. Setup a protected route
//5. Get a new accesstoken with a refresh token

const server = express();

//use express middleware for easier cookie handling
server.use(cookieParser());

server.use(
    cors({
        origin: 'http://localhost:3000',
        credentials: true,
    })
);

// needed to be able to read data
server.use(express.json()); // to support JSON encoded bodies
server.use(express.urlencoded({ extended: true })); // support URL encoded bodies


//1. register a user
server.post('/register', async (req, res) => {

    const { email, password } = req.body;

    try {
        //1. Check is user exist
        const user = fakeDB.find(user => user.email === email);

        if (user) throw new Error("User already exist");

        //2. If not user exist, hash the password
        const hashedPassword = await hash(password, 10);

        //3. Insert the user in database
        fakeDB.push({
            id: fakeDB.length,
            email,
            password: hashedPassword
        });
        res.send({ message: 'User created' });
        console.log(fakeDB);
    } catch (err) {
        res.send({
            error: `${err.message}`,
        })
    }
});


//2. Login a user
server.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {

        //1. Find user in database. If not exist throw error
        const user = fakeDB.find(user => user.email === email);
        if (!user) throw new Error("User does not exist");

        //2. Compare crypted password and see if it checks out. Send error if not
        const valid = await compare(password, user.password);
        if (!valid) throw new Error("Password  does not match");

        //3. Create Refresh- and Accesstoken
        const accesstoken = createAccessToken(user.id);
        const refreshtoken = createRefreshToken(user.id);

        //4. Put the refreshtoken in the database
        user.refreshtoken = refreshtoken;
        //console.log(fakeDB);

        //5. Send token. Refreshtoken as a cookie and accesstoken as a regular response
        sendRefreshToken(res, refreshtoken);
        sendAccessToken(res, req, accesstoken);

    }
    catch (err) {
        res.send({
            error: `${err.message}`
        })
    }
});

//3. Logout a user
server.post('/logout', (_req, res) => {
    res.clearCookie('refreshtoken', { path: '/refresh_token' });
    return res.send({
        message: 'Logged out',
    })
});


//4. Protected route
server.post('/protected', async (req, res) => {
    try {
        const userId = isAuth(req);
        if (userId !== null) {
            res.send({
                data: 'This is protected data.'
            })
        }
    } catch (err) {
        res.send({
            error: `${err.message}`,
        })
    }
});

//5. Get a new access token with a refresh token
server.post('/refresh_token', (req, res) => {
    const token = req.cookies.refreshtoken;

    if (!token) return res.send({ accesstoken: '' });

    let payload = null;
    try {
        payload = verify(token, process.env.REFRESH_TOKEN_SECRET);
    } catch (err) {
        return res.send({ accesstoken: '' });
    }

    //Token is valid, check if user exist
    const user = fakeDB.find(user => user.id === payload.userId);
    if (!user) return res.send({ accesstoken: '' });
    //user exist, check is refreshtoken exist on user
    if (user.refreshtoken !== token) {
        return res.send({ accesstoken: '' });
    }
    // Token exist, create new refresh and Accesstoken
    const accesstoken = createAccessToken(user.id);
    const refreshtoken = createRefreshToken(user.id);
    // update refreshtoken on user in db
    // Could have different versions instead!
    user.refreshtoken = refreshtoken;
    //All good to go, send new refreshtoken and accesstoken
    sendRefreshToken(res, refreshtoken);
    return res.send({ accesstoken });

});


server.listen(process.env.PORT, () =>
    console.log(`Server listening on port ${process.env.PORT}`)
);
