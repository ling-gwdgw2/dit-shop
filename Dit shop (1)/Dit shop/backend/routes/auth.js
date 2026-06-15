const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db      = require('../config/db');
const admin   = require('firebase-admin');
const { authenticate } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', [
    body('username').trim().isLength({ min: 3, max: 50 }).matches(/^\w+$/),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('full_name').optional().trim().isLength({ max: 100 }),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { username, email, password, full_name } = req.body;
    try {
        // Check if username or email already exists in Firestore
        const usernameQuery = await db.collection('users').where('username', '==', username).limit(1).get();
        if (!usernameQuery.empty) {
            return res.status(409).json({ error: 'Username or email already taken.' });
        }

        const emailQuery = await db.collection('users').where('email', '==', email).limit(1).get();
        if (!emailQuery.empty) {
            return res.status(409).json({ error: 'Username or email already taken.' });
        }

        const hash = await bcrypt.hash(password, 10);
        const userRef = db.collection('users').doc();
        
        const newUser = {
            id: userRef.id,
            username,
            email,
            password: hash,
            full_name: full_name || null,
            role: 'user',
            avatar_url: null,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        };

        await userRef.set(newUser);

        const token = jwt.sign(
            { id: userRef.id, username, role: 'user' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.status(201).json({ 
            token, 
            user: { 
                id: userRef.id, 
                username, 
                email, 
                role: 'user' 
            } 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed.' });
    }
});

// POST /api/auth/login
router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
        const userQuery = await db.collection('users').where('email', '==', email).limit(1).get();
        if (userQuery.empty) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }
        
        const userDoc = userQuery.docs[0];
        const user = userDoc.data();

        if (!(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        const { password: _, created_at, ...safeUser } = user;
        
        // Format created_at if it's a Firestore Timestamp
        if (created_at) {
            safeUser.created_at = db.formatDate(created_at);
        }

        res.json({ token, user: safeUser });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed.' });
    }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.id).get();
        if (!userDoc.exists) return res.status(404).json({ error: 'User not found.' });
        
        const user = userDoc.data();
        const { password: _, created_at, ...safeUser } = user;
        
        if (created_at) {
            safeUser.created_at = db.formatDate(created_at);
        }

        res.json(safeUser);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/auth/google/config
router.get('/google/config', (req, res) => {
    res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
});

// POST /api/auth/google
router.post('/google', async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) {
        return res.status(400).json({ error: 'Google ID token is required.' });
    }

    try {
        // Verify the ID token using Google's tokeninfo API
        const googleUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
        const googleRes = await fetch(googleUrl);
        
        if (!googleRes.ok) {
            const errData = await googleRes.json().catch(() => ({}));
            return res.status(400).json({ error: errData.error_description || 'Invalid Google token.' });
        }

        const payload = await googleRes.json();

        // Validate client ID / audience matches
        const expectedClientId = process.env.GOOGLE_CLIENT_ID;
        if (!expectedClientId) {
            return res.status(500).json({ error: 'Google Login is not configured on the backend.' });
        }

        if (payload.aud !== expectedClientId) {
            return res.status(400).json({ error: 'Google token client ID mismatch.' });
        }

        const email = payload.email;
        const fullName = payload.name || '';
        const avatarUrl = payload.picture || null;

        if (!email) {
            return res.status(400).json({ error: 'Email not provided by Google account.' });
        }

        // Check if user exists in Firestore
        const userQuery = await db.collection('users').where('email', '==', email).limit(1).get();
        let user;

        if (userQuery.empty) {
            // Register new user: generate a unique username from email
            let baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
            if (!baseUsername || baseUsername.length < 3) {
                baseUsername = 'user_' + Math.random().toString(36).substring(2, 7);
            }
            
            let username = baseUsername;
            let counter = 1;
            while (true) {
                const checkU = await db.collection('users').where('username', '==', username).limit(1).get();
                if (checkU.empty) break;
                username = baseUsername + counter;
                counter++;
            }

            const userRef = db.collection('users').doc();
            user = {
                id: userRef.id,
                username,
                email,
                password: '', // OAuth users have no local password hash
                full_name: fullName,
                role: 'user',
                avatar_url: avatarUrl,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            };

            await userRef.set(user);
            console.log(`✓ Google login: registered new user ${username} (${email})`);
        } else {
            // Existing user
            const userDoc = userQuery.docs[0];
            user = userDoc.data();

            // Optionally update avatar if they don't have one
            if (!user.avatar_url && avatarUrl) {
                await userDoc.ref.update({ avatar_url: avatarUrl });
                user.avatar_url = avatarUrl;
            }
            console.log(`✓ Google login: logged in existing user ${user.username} (${email})`);
        }

        // Generate local JWT token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // Format created_at if it exists
        const { password: _, created_at, ...safeUser } = user;
        if (created_at) {
            safeUser.created_at = db.formatDate(created_at);
        }

        res.json({ token, user: safeUser });
    } catch (err) {
        console.error('❌ Google Login error:', err);
        res.status(500).json({ error: 'Google Sign-In failed.' });
    }
});

module.exports = router;
