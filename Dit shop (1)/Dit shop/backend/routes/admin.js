const router = require('express').Router();
const db     = require('../config/db');
const admin  = require('firebase-admin');
const { authenticate, requireAdmin } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin);

// GET /api/admin/stats  — dashboard overview numbers
router.get('/stats', async (req, res) => {
    try {
        const totalUsersSnap   = await db.collection('users').where('role', '==', 'user').count().get();
        const totalOrdersSnap  = await db.collection('orders').count().get();
        const pendingSnap      = await db.collection('orders').where('status', '==', 'pending').count().get();
        const totalStockSnap   = await db.collection('gift_card_codes').where('status', '==', 'available').count().get();
        
        // Sum revenue of delivered orders
        const deliveredOrdersSnap = await db.collection('orders').where('status', '==', 'delivered').get();
        let revenue = 0;
        deliveredOrdersSnap.forEach(doc => {
            revenue += (doc.data().total_price || 0);
        });

        res.json({ 
            total_users: totalUsersSnap.data().count, 
            total_orders: totalOrdersSnap.data().count, 
            pending: pendingSnap.data().count, 
            total_stock: totalStockSnap.data().count, 
            revenue 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stats.' });
    }
});

// GET /api/admin/users  — list all users
router.get('/users', async (req, res) => {
    try {
        const snap = await db.collection('users').get();
        const rows = snap.docs.map(doc => {
            const data = doc.data();
            if (data.created_at) data.created_at = db.formatDate(data.created_at);
            return {
                id: data.id,
                username: data.username,
                email: data.email,
                full_name: data.full_name,
                role: data.role,
                created_at: data.created_at
            };
        });

        // Sort DESC in memory
        rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/admin/stock  — all card types with their available code counts
router.get('/stock', async (req, res) => {
    try {
        const cardsSnap = await db.collection('gift_cards').get();
        const rows = [];

        for (const doc of cardsSnap.docs) {
            const card = doc.data();
            if (card.created_at) card.created_at = db.formatDate(card.created_at);

            const availableSnap = await db.collection('gift_card_codes')
                .where('gift_card_id', '==', card.id)
                .where('status', '==', 'available')
                .count()
                .get();

            const usedSnap = await db.collection('gift_card_codes')
                .where('gift_card_id', '==', card.id)
                .where('status', '==', 'used')
                .count()
                .get();

            const available = availableSnap.data().count;
            const used_count = usedSnap.data().count;

            rows.push({
                ...card,
                available,
                used_count,
                total_codes: available + used_count
            });
        }

        // Sort by ID in memory
        rows.sort((a, b) => a.id.localeCompare(b.id));
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/admin/orders  — all orders with user + card details
router.get('/orders', async (req, res) => {
    try {
        const { status } = req.query;
        let queryRef = db.collection('orders');
        
        if (status) {
            queryRef = queryRef.where('status', '==', status);
        }

        const snap = await queryRef.get();
        const rows = [];
        
        const usersCache = {};
        const cardsCache = {};
        const codesCache = {};

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
                cardsCache[cid] = doc.exists ? doc.data() : { name: 'Unknown Card', denomination: 0, currency: 'USD' };
            }
            return cardsCache[cid];
        }

        async function getAssignedCode(codeId) {
            if (!codeId) return null;
            if (!codesCache[codeId]) {
                const doc = await db.collection('gift_card_codes').doc(codeId).get();
                codesCache[codeId] = doc.exists ? doc.data().code : 'Unknown';
            }
            return codesCache[codeId];
        }

        for (const doc of snap.docs) {
            const order = doc.data();
            const user = await getUserInfo(order.user_id);
            const card = await getCardInfo(order.gift_card_id);
            const assigned_code = await getAssignedCode(order.code_id);

            if (order.created_at) order.created_at = db.formatDate(order.created_at);
            if (order.updated_at) order.updated_at = db.formatDate(order.updated_at);
            if (order.confirmed_at) order.confirmed_at = db.formatDate(order.confirmed_at);

            rows.push({
                ...order,
                username: user.username,
                email: user.email,
                card_name: card.name,
                denomination: card.denomination,
                currency: card.currency,
                assigned_code
            });
        }

        // Sort DESC in memory
        rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// GET /api/admin/messages  — all HELP messages from users
router.get('/messages', async (req, res) => {
    try {
        const snap = await db.collection('inbox_messages')
            .where('is_help', '==', true)
            .where('user_id', '==', req.user.id)
            .get();

        const rows = [];
        const usersCache = {};

        async function getUserInfo(uid) {
            if (!usersCache[uid]) {
                const doc = await db.collection('users').doc(uid).get();
                usersCache[uid] = doc.exists ? doc.data() : { username: 'Unknown', email: 'Unknown', full_name: 'Unknown' };
            }
            return usersCache[uid];
        }

        for (const doc of snap.docs) {
            const msg = doc.data();
            const user = await getUserInfo(msg.from_user_id);

            if (msg.created_at) msg.created_at = db.formatDate(msg.created_at);

            rows.push({
                ...msg,
                username: user.username,
                email: user.email,
                full_name: user.full_name
            });
        }

        // Sort DESC in memory
        rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch messages.' });
    }
});

// GET /api/admin/messages/unread-count  — pending help messages for this admin
router.get('/messages/unread-count', async (req, res) => {
    try {
        const countSnap = await db.collection('inbox_messages')
            .where('is_help', '==', true)
            .where('is_read', '==', false)
            .where('user_id', '==', req.user.id)
            .count()
            .get();

        res.json({ count: countSnap.data().count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// PATCH /api/admin/messages/:id/read  — mark a help message as read
router.patch('/messages/:id/read', async (req, res) => {
    try {
        const docRef = db.collection('inbox_messages').doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Message not found.' });

        const msg = doc.data();
        if (!msg.is_help) return res.status(404).json({ error: 'Message not found.' });
        if (msg.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });

        await docRef.update({ is_read: true });
        res.json({ message: 'Marked as read.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/admin/messages/:id/reply  — admin replies; lands in target user's inbox
router.post('/messages/:id/reply', async (req, res) => {
    try {
        const subject     = (req.body.subject    || '').trim();
        const body        = (req.body.body       || '').trim();
        const rawAttach   = req.body.attachments;
        const legacyUrl   = (req.body.image_url  || '').trim() || null;
        const attachments = Array.isArray(rawAttach)
            ? rawAttach.filter(Boolean)
            : (legacyUrl ? [legacyUrl] : []);
        const image_url   = attachments.length ? JSON.stringify(attachments) : null;
        
        if (!subject || !body) {
            return res.status(400).json({ error: 'Subject and reply body are required.' });
        }
        if (subject.length > 200 || body.length > 4000) {
            return res.status(400).json({ error: 'Subject or body too long.' });
        }

        const originalRef = db.collection('inbox_messages').doc(req.params.id);
        const originalDoc = await originalRef.get();
        
        if (!originalDoc.exists || !originalDoc.data().is_help || !originalDoc.data().from_user_id) {
            return res.status(404).json({ error: 'Original help message not found.' });
        }

        const original = originalDoc.data();
        const adminName = req.user.username || 'Support';
        
        const replyRef = db.collection('inbox_messages').doc();
        await replyRef.set({
            id: replyRef.id,
            user_id: original.from_user_id,
            from_user_id: req.user.id,
            sender: adminName,
            subject,
            body,
            image_url,
            parent_id: original.id,
            is_help: false,
            is_read: false,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        // Mark the original help message as read since we've handled it.
        await originalRef.update({ is_read: true });

        res.status(201).json({ message: 'Reply sent.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send reply.' });
    }
});

// DELETE /api/admin/messages/:id  — dismiss a help thread from admin's view
router.delete('/messages/:id', async (req, res) => {
    try {
        const docRef = db.collection('inbox_messages').doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Message not found.' });

        const msg = doc.data();
        if (!msg.is_help) return res.status(404).json({ error: 'Message not found.' });
        if (msg.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });

        await docRef.delete();
        res.json({ message: 'Message dismissed.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
