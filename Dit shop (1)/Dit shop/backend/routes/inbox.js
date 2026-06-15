const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const db     = require('../config/db');
const admin  = require('firebase-admin');
const { authenticate } = require('../middleware/auth');

// ── Message-image upload setup ────────────────────────────────
const MSG_IMG_DIR = path.join(__dirname, '..', '..', 'frontend', 'img', 'uploads', 'messages');
fs.mkdirSync(MSG_IMG_DIR, { recursive: true });

const msgImgStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MSG_IMG_DIR),
    filename: (_req, file, cb) => {
        const ext = (path.extname(file.originalname) || '.png').toLowerCase();
        const safeExt = /^\.(jpe?g|png|gif|webp)$/.test(ext) ? ext : '.png';
        cb(null, `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExt}`);
    },
});
const msgImgUpload = multer({
    storage: msgImgStorage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) =>
        /^(image|video)\//.test(file.mimetype)
            ? cb(null, true)
            : cb(new Error('Only image and video files are allowed.')),
});

// POST /api/inbox/upload-image  — shared by user + admin, returns { url }
router.post('/upload-image', authenticate, (req, res, next) => {
    msgImgUpload.single('image')(req, res, err => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    res.status(201).json({ url: `/img/uploads/messages/${req.file.filename}` });
});

// GET /api/inbox  — user's messages (excludes their own help requests)
router.get('/', authenticate, async (req, res) => {
    try {
        const snap = await db.collection('inbox_messages')
            .where('user_id', '==', req.user.id)
            .where('is_help', '==', false)
            .get();
            
        const rows = snap.docs.map(doc => {
            const data = doc.data();
            if (data.created_at) data.created_at = db.formatDate(data.created_at);
            return data;
        });

        // Sort DESC in memory
        rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch inbox.' });
    }
});

// GET /api/inbox/unread-count
router.get('/unread-count', authenticate, async (req, res) => {
    try {
        const countSnap = await db.collection('inbox_messages')
            .where('user_id', '==', req.user.id)
            .where('is_help', '==', false)
            .where('is_read', '==', false)
            .count()
            .get();
            
        res.json({ count: countSnap.data().count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/inbox/help  — user sends a HELP message to admin
router.post('/help', authenticate, async (req, res) => {
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
            return res.status(400).json({ error: 'Subject and message are required.' });
        }
        if (subject.length > 200) {
            return res.status(400).json({ error: 'Subject is too long (max 200 chars).' });
        }
        if (body.length > 4000) {
            return res.status(400).json({ error: 'Message is too long (max 4000 chars).' });
        }

        // Deliver one HELP row to every admin's inbox
        const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
        if (adminsSnap.empty) {
            return res.status(503).json({ error: 'No admin available right now.' });
        }

        const senderName = req.user.username || `User #${req.user.id}`;
        const batch = db.batch();

        adminsSnap.docs.forEach(adminDoc => {
            const msgRef = db.collection('inbox_messages').doc();
            batch.set(msgRef, {
                id: msgRef.id,
                user_id: adminDoc.id,
                from_user_id: req.user.id,
                sender: senderName,
                subject,
                body,
                image_url,
                is_help: true,
                parent_id: null,
                is_read: false,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        res.status(201).json({ message: 'Your message was sent to support.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send help message.' });
    }
});

// GET /api/inbox/sent  — user's own outgoing HELP messages
router.get('/sent', authenticate, async (req, res) => {
    try {
        const snap = await db.collection('inbox_messages')
            .where('from_user_id', '==', req.user.id)
            .where('is_help', '==', true)
            .get();
            
        const map = {};
        snap.docs.forEach(doc => {
            const data = doc.data();
            if (data.created_at) data.created_at = db.formatDate(data.created_at);
            
            // Deduplicate across multi-admin deliveries using a hash key
            const key = `${data.subject}_${data.body}_${data.created_at}`;
            if (!map[key]) {
                map[key] = {
                    id: data.id,
                    subject: data.subject,
                    body: data.body,
                    image_url: data.image_url,
                    created_at: data.created_at
                };
            }
        });
        
        const rows = Object.values(map);
        // Sort DESC in memory
        rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// PATCH /api/inbox/read-all  — mark all of recipient's normal messages as read
router.patch('/read-all', authenticate, async (req, res) => {
    try {
        const snap = await db.collection('inbox_messages')
            .where('user_id', '==', req.user.id)
            .where('is_help', '==', false)
            .where('is_read', '==', false)
            .get();
            
        if (!snap.empty) {
            const batch = db.batch();
            snap.docs.forEach(doc => {
                batch.update(doc.ref, { is_read: true });
            });
            await batch.commit();
        }
        res.json({ message: 'All messages marked as read.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// PATCH /api/inbox/:id/read  — mark single message as read
router.patch('/:id/read', authenticate, async (req, res) => {
    try {
        const docRef = db.collection('inbox_messages').doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Message not found.' });
        
        const msg = doc.data();
        if (msg.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });
        
        await docRef.update({ is_read: true });
        res.json({ message: 'Marked as read.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// DELETE /api/inbox/:id
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const docRef = db.collection('inbox_messages').doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Message not found.' });
        
        const msg = doc.data();
        if (msg.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });
        
        await docRef.delete();
        res.json({ message: 'Message deleted.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
