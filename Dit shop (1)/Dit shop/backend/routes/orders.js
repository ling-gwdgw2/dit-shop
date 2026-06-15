const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const db     = require('../config/db');
const admin  = require('firebase-admin');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Server-side currency formatter
const CURRENCY_SYMBOL = { USD: '$', LAK: '₭', THB: '฿' };
const fmtPrice = (amount, code = 'USD') =>
    `${CURRENCY_SYMBOL[code] || '$'}${parseFloat(amount).toFixed(2)}`;

// ── Payment-proof upload setup ───────────────────────────────
const PROOF_DIR = path.join(__dirname, '..', '..', 'frontend', 'img', 'uploads', 'proofs');
fs.mkdirSync(PROOF_DIR, { recursive: true });

const proofStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PROOF_DIR),
    filename: (_req, file, cb) => {
        const ext = (path.extname(file.originalname) || '.png').toLowerCase();
        const safeExt = /^\.(jpe?g|png|gif|webp)$/.test(ext) ? ext : '.png';
        cb(null, `proof_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExt}`);
    },
});

const proofUpload = multer({
    storage: proofStorage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
    fileFilter: (_req, file, cb) =>
        /^image\//.test(file.mimetype)
            ? cb(null, true)
            : cb(new Error('Only image files are allowed.')),
});

// POST /api/orders/upload-proof  — buyer uploads a payment receipt
router.post('/upload-proof',
    authenticate,
    (req, res, next) => {
        proofUpload.single('proof')(req, res, err => {
            if (err) return res.status(400).json({ error: err.message });
            next();
        });
    },
    (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
        res.status(201).json({ url: `/img/uploads/proofs/${req.file.filename}` });
    }
);

// POST /api/orders  — place an order
router.post('/', authenticate, async (req, res) => {
    const { gift_card_id, payment_ref, payment_proof_url, notes } = req.body;
    const quantity = 1;
    if (!gift_card_id)         return res.status(422).json({ error: 'gift_card_id is required.' });
    if (!payment_proof_url)    return res.status(422).json({ error: 'A payment receipt photo is required.' });

    try {
        const result = await db.runTransaction(async (t) => {
            // 1. Verify card exists
            const cardRef = db.collection('gift_cards').doc(gift_card_id);
            const cardDoc = await t.get(cardRef);
            if (!cardDoc.exists) throw new Error('CARD_NOT_FOUND');
            const card = cardDoc.data();
            if (!card.is_active) throw new Error('CARD_NOT_ACTIVE');

            // 2. Count stock
            const codesQuery = db.collection('gift_card_codes')
                .where('gift_card_id', '==', gift_card_id)
                .where('status', '==', 'available');
            const codesSnap = await t.get(codesQuery);
            if (codesSnap.size < quantity) throw new Error('OUT_OF_STOCK');

            const total_price = parseFloat(card.price) * quantity;
            const orderRef = db.collection('orders').doc();

            // 3. Write order document
            t.set(orderRef, {
                id: orderRef.id,
                user_id: req.user.id,
                gift_card_id,
                code_id: null,
                quantity,
                total_price,
                status: 'pending',
                payment_ref: payment_ref || null,
                payment_proof_url,
                notes: notes || null,
                confirmed_by: null,
                confirmed_at: null,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });

            // 4. Create inbox welcome message
            const msgRef = db.collection('inbox_messages').doc();
            t.set(msgRef, {
                id: msgRef.id,
                user_id: req.user.id,
                from_user_id: null,
                order_id: orderRef.id,
                sender: 'Dit Shop',
                subject: `Order #${orderRef.id} Received`,
                body: `Hi ${req.user.username}, we've received your order for "${card.name}".\nTotal: ${fmtPrice(total_price, card.currency)}.\nWe will verify your payment and deliver your gift card code shortly!`,
                is_help: false,
                parent_id: null,
                is_read: false,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            });

            return { orderId: orderRef.id, total_price };
        });

        res.status(201).json({ id: result.orderId, message: 'Order placed successfully.', total_price: result.total_price });
    } catch (err) {
        console.error(err);
        if (err.message === 'CARD_NOT_FOUND' || err.message === 'CARD_NOT_ACTIVE') {
            return res.status(404).json({ error: 'Gift card not found.' });
        }
        if (err.message === 'OUT_OF_STOCK') {
            return res.status(409).json({ error: 'Not enough stock available.' });
        }
        res.status(500).json({ error: 'Failed to place order.' });
    }
});

// GET /api/orders  — user's own orders (or all orders for admin)
router.get('/', authenticate, async (req, res) => {
    try {
        let queryRef = db.collection('orders');
        if (req.user.role !== 'admin') {
            queryRef = queryRef.where('user_id', '==', req.user.id);
        }

        const snap = await queryRef.get();
        const orders = [];

        // Simple cache
        const usersCache = {};
        const cardsCache = {};

        async function getUserInfo(uid) {
            if (!usersCache[uid]) {
                const doc = await db.collection('users').doc(uid).get();
                usersCache[uid] = doc.exists ? doc.data() : { username: 'Unknown', email: 'Unknown' };
            }
            return usersCache[uid];
        }

        async function getCardInfo(cid) {
            if (!cardsCache[cid]) {
                const doc = await db.collection('gift_cards').doc(cid).get();
                cardsCache[cid] = doc.exists ? doc.data() : { name: 'Unknown Card', denomination: 0, currency: 'USD', image_url: '/img/placeholder.png' };
            }
            return cardsCache[cid];
        }

        for (const doc of snap.docs) {
            const order = doc.data();
            const card = await getCardInfo(order.gift_card_id);
            
            // Format order timestamps
            if (order.created_at) order.created_at = db.formatDate(order.created_at);
            if (order.updated_at) order.updated_at = db.formatDate(order.updated_at);
            if (order.confirmed_at) order.confirmed_at = db.formatDate(order.confirmed_at);

            const row = {
                ...order,
                card_name: card.name,
                denomination: card.denomination,
                currency: card.currency,
                image_url: card.image_url
            };

            if (req.user.role === 'admin') {
                const user = await getUserInfo(order.user_id);
                row.username = user.username;
                row.email = user.email;
            }

            orders.push(row);
        }

        // Sort DESC in memory
        orders.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        res.json(orders);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch orders.' });
    }
});

// GET /api/orders/:id
router.get('/:id', authenticate, async (req, res) => {
    try {
        const doc = await db.collection('orders').doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: 'Order not found.' });
        
        const order = doc.data();
        if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Forbidden.' });
        }

        const cardDoc = await db.collection('gift_cards').doc(order.gift_card_id).get();
        const card = cardDoc.exists ? cardDoc.data() : { name: 'Unknown Card', denomination: 0, currency: 'USD', image_url: '/img/placeholder.png' };

        if (order.created_at) order.created_at = db.formatDate(order.created_at);
        if (order.updated_at) order.updated_at = db.formatDate(order.updated_at);
        if (order.confirmed_at) order.confirmed_at = db.formatDate(order.confirmed_at);

        res.json({
            ...order,
            card_name: card.name,
            denomination: card.denomination,
            currency: card.currency,
            image_url: card.image_url
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/orders/:id/confirm  — admin confirms and assigns a code
router.post('/:id/confirm', authenticate, requireAdmin, async (req, res) => {
    try {
        const orderRef = db.collection('orders').doc(req.params.id);

        const result = await db.runTransaction(async (t) => {
            const orderDoc = await t.get(orderRef);
            if (!orderDoc.exists) throw new Error('ORDER_NOT_FOUND');
            const order = orderDoc.data();
            if (order.status !== 'pending') throw new Error(`ORDER_ALREADY_${order.status.toUpperCase()}`);

            // Pick an available code
            const codesQuery = db.collection('gift_card_codes')
                .where('gift_card_id', '==', order.gift_card_id)
                .where('status', '==', 'available')
                .limit(1);
            
            const codesSnap = await t.get(codesQuery);
            if (codesSnap.empty) throw new Error('NO_STOCK');

            const codeDoc = codesSnap.docs[0];
            const code = codeDoc.data();

            // Mark code as used
            t.update(codeDoc.ref, { status: 'used' });

            // Update order
            t.update(orderRef, {
                status: 'delivered',
                code_id: code.id,
                confirmed_by: req.user.id,
                confirmed_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });

            // Get buyer and card name for messaging
            const userDoc = await t.get(db.collection('users').doc(order.user_id));
            const user = userDoc.exists ? userDoc.data() : { username: 'Customer' };
            const cardDoc = await t.get(db.collection('gift_cards').doc(order.gift_card_id));
            const card = cardDoc.exists ? cardDoc.data() : { name: 'Gift Card' };

            // Send code to user inbox
            const msgRef = db.collection('inbox_messages').doc();
            t.set(msgRef, {
                id: msgRef.id,
                user_id: order.user_id,
                from_user_id: null,
                order_id: order.id,
                sender: 'Dit Shop',
                subject: `Your Gift Card Code for Order #${order.id}`,
                body: `Hi ${user.username},\n\nYour order has been confirmed!\n\nGift Card: ${card.name}\nYour Code: ${code.code}\n\nThank you for shopping at Dit Shop! Enjoy your gift card.`,
                is_help: false,
                parent_id: null,
                is_read: false,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            });

            return { codeValue: code.code };
        });

        res.json({ message: 'Order confirmed and code delivered to user inbox.', code: result.codeValue });
    } catch (err) {
        console.error(err);
        if (err.message === 'ORDER_NOT_FOUND') {
            return res.status(404).json({ error: 'Order not found.' });
        }
        if (err.message.startsWith('ORDER_ALREADY_')) {
            return res.status(409).json({ error: 'Order has already been processed.' });
        }
        if (err.message === 'NO_STOCK') {
            return res.status(409).json({ error: 'No available codes in stock for this card.' });
        }
        res.status(500).json({ error: 'Failed to confirm order.' });
    }
});

// POST /api/orders/:id/cancel  — cancel (user or admin)
router.post('/:id/cancel', authenticate, async (req, res) => {
    try {
        const docRef = db.collection('orders').doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Order not found.' });
        
        const order = doc.data();
        if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Forbidden.' });
        }
        if (order.status !== 'pending') {
            return res.status(409).json({ error: `Cannot cancel an order that is ${order.status}.` });
        }
        
        await docRef.update({
            status: 'cancelled',
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({ message: 'Order cancelled.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
