const path = require('path');
const fs   = require('fs');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envResult = require('dotenv').config({ path: envPath });
    if (envResult.error) {
        console.error('❌ Failed to load .env file:', envResult.error);
    } else {
        console.log('✓ .env file loaded successfully. JWT_SECRET exists:', !!process.env.JWT_SECRET);
    }
} else {
    console.log('i Running without local .env file (using environment variables)');
}
const express     = require('express');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');

const authRoutes   = require('./routes/auth');
const cardRoutes   = require('./routes/cards');
const orderRoutes  = require('./routes/orders');
const inboxRoutes  = require('./routes/inbox');
const adminRoutes  = require('./routes/admin');

const app  = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files if folder exists
const frontendPath = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
}

// Serve the payment QR image(s) — drop new QR files into backend/Qr/.
app.use('/qr', express.static(path.join(__dirname, 'Qr'), {
    maxAge: '1h',
    fallthrough: false,
}));

// Global rate limiter — generous cap for dev; tighten in production if needed.
app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
}));

// (auth-specific rate limit removed — was triggering 429 during normal use)

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/cards',  cardRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/inbox',  inboxRoutes);
app.use('/api/admin',  adminRoutes);

// ── SPA fallback or standalone status API ─────────────────────
if (fs.existsSync(frontendPath)) {
    app.get(/^(?!\/api).*/, (req, res) => {
        res.sendFile(path.join(frontendPath, 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.json({ status: 'ok', message: 'Dit Shop Backend API is running' });
    });
}

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error.' });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Dit Shop server running at http://localhost:${PORT}`);
    });
}

module.exports = app;
