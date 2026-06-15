const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const multer = require('multer');
const db     = require('../config/db');
const admin  = require('firebase-admin');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ── Image upload setup ───────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'frontend', 'img', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = (path.extname(file.originalname) || '.png').toLowerCase();
        const safeExt = /^\.(jpe?g|png|gif|webp|svg)$/.test(ext) ? ext : '.png';
        cb(null, `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${safeExt}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max
    fileFilter: (_req, file, cb) =>
        /^image\//.test(file.mimetype)
            ? cb(null, true)
            : cb(new Error('Only image files are allowed.')),
});

const ALLOWED_CURRENCIES = ['USD', 'LAK', 'THB'];
const normCurrency = c => ALLOWED_CURRENCIES.includes(c) ? c : 'USD';

// Helper to get stock count for a single card
async function getStockCount(cardId) {
    const countSnap = await db.collection('gift_card_codes')
        .where('gift_card_id', '==', cardId)
        .where('status', '==', 'available')
        .count()
        .get();
    return countSnap.data().count;
}

// ============================================================
// PUBLIC routes
// ============================================================

// GET /api/cards  — public storefront listing
router.get('/', async (req, res) => {
    try {
        const { category } = req.query;
        let queryRef = db.collection('gift_cards').where('is_active', '==', true);
        
        if (category) {
            queryRef = queryRef.where('category', '==', category);
        }
        
        const snap = await queryRef.get();
        const cards = [];
        
        for (const doc of snap.docs) {
            const card = doc.data();
            card.stock_count = await getStockCount(card.id);
            if (card.created_at) {
                card.created_at = db.formatDate(card.created_at);
            }
            cards.push(card);
        }
        
        // Sort by created_at DESC in Node memory
        cards.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        res.json(cards);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch gift cards.' });
    }
});

// GET /api/cards/:id  — single card detail
router.get('/:id', async (req, res) => {
    try {
        const doc = await db.collection('gift_cards').doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ error: 'Card not found.' });
        
        const card = doc.data();
        if (!card.is_active) return res.status(404).json({ error: 'Card not found.' });
        
        card.stock_count = await getStockCount(card.id);
        if (card.created_at) {
            card.created_at = db.formatDate(card.created_at);
        }
        res.json(card);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// ============================================================
// ADMIN routes
// ============================================================

// POST /api/cards/upload-image  — file upload
router.post('/upload-image',
    authenticate, requireAdmin,
    (req, res, next) => {
        upload.single('image')(req, res, err => {
            if (err) return res.status(400).json({ error: err.message });
            next();
        });
    },
    (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
        res.status(201).json({ url: `/img/uploads/${req.file.filename}` });
    }
);

// POST /api/cards  — create new card type
router.post('/', authenticate, requireAdmin, async (req, res) => {
    const { name, description, denomination, price, image_url, category, currency } = req.body;
    if (!name || !denomination || !price) {
        return res.status(422).json({ error: 'name, denomination, and price are required.' });
    }
    try {
        const gcRef = db.collection('gift_cards').doc();
        const newCard = {
            id: gcRef.id,
            name,
            description: description || null,
            denomination: Number(denomination),
            price: Number(price),
            currency: normCurrency(currency),
            image_url: image_url || null,
            category: category || null,
            is_active: true,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await gcRef.set(newCard);
        res.status(201).json({ id: gcRef.id, message: 'Gift card created.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create gift card.' });
    }
});

// PUT /api/cards/:id  — update card
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
    const fields = ['name','description','denomination','price','currency','image_url','category','is_active'];
    const updates = {};
    
    fields.forEach(f => {
        if (req.body[f] !== undefined) {
            let val = req.body[f];
            if (f === 'currency') val = normCurrency(val);
            if (f === 'denomination' || f === 'price') val = Number(val);
            updates[f] = val;
        }
    });
    
    if (Object.keys(updates).length === 0) {
        return res.status(422).json({ error: 'Nothing to update.' });
    }
    
    try {
        const docRef = db.collection('gift_cards').doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Card not found.' });
        
        await docRef.update(updates);
        res.json({ message: 'Gift card updated.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Update failed.' });
    }
});

// DELETE /api/cards/:id  — delete a card type, its codes AND its orders
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const docRef = db.collection('gift_cards').doc(req.params.id);
        const cardDoc = await docRef.get();
        if (!cardDoc.exists) return res.status(404).json({ error: 'Card not found.' });

        const batch = db.batch();

        // 1. Delete all orders for this card
        const ordersQuery = await db.collection('orders').where('gift_card_id', '==', req.params.id).get();
        ordersQuery.forEach(doc => {
            batch.delete(doc.ref);
        });

        // 2. Delete all codes for this card
        const codesQuery = await db.collection('gift_card_codes').where('gift_card_id', '==', req.params.id).get();
        codesQuery.forEach(doc => {
            batch.delete(doc.ref);
        });

        // 3. Delete the card itself
        batch.delete(docRef);

        await batch.commit();
        res.json({ message: 'Gift card deleted.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete gift card.' });
    }
});

// POST /api/cards/:id/codes  — add codes to stock
router.post('/:id/codes', authenticate, requireAdmin, async (req, res) => {
    const { codes } = req.body;
    if (!Array.isArray(codes) || !codes.length) {
        return res.status(422).json({ error: 'Provide a non-empty array of codes.' });
    }
    try {
        const cardRef = db.collection('gift_cards').doc(req.params.id);
        const cardDoc = await cardRef.get();
        if (!cardDoc.exists) return res.status(404).json({ error: 'Card not found.' });

        const batch = db.batch();
        let addedCount = 0;

        for (const c of codes) {
            const codeTrim = c.trim();
            if (!codeTrim) continue;
            
            // Check uniqueness of code
            const existingCodeQuery = await db.collection('gift_card_codes')
                .where('code', '==', codeTrim)
                .limit(1)
                .get();
                
            if (existingCodeQuery.empty) {
                const codeRef = db.collection('gift_card_codes').doc();
                batch.set(codeRef, {
                    id: codeRef.id,
                    gift_card_id: req.params.id,
                    code: codeTrim,
                    status: 'available',
                    added_by: req.user.id,
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                });
                addedCount++;
            }
        }

        if (addedCount > 0) {
            await batch.commit();
        }
        
        res.status(201).json({ message: `${addedCount} code(s) added.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add codes.' });
    }
});

// GET /api/cards/:id/codes  — list codes for a card (admin)
router.get('/:id/codes', authenticate, requireAdmin, async (req, res) => {
    try {
        const snap = await db.collection('gift_card_codes')
            .where('gift_card_id', '==', req.params.id)
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
        res.status(500).json({ error: 'Server error.' });
    }
});

// PUT /api/cards/:cardId/codes/:codeId  — edit a code's value (admin)
router.put('/:id/codes/:codeId', authenticate, requireAdmin, async (req, res) => {
    const newCode = (req.body.code || '').toString().trim();
    if (!newCode) return res.status(422).json({ error: 'Code value is required.' });

    try {
        const codeRef = db.collection('gift_card_codes').doc(req.params.codeId);
        const codeDoc = await codeRef.get();
        if (!codeDoc.exists || codeDoc.data().gift_card_id !== req.params.id) {
            return res.status(404).json({ error: 'Code not found.' });
        }
        
        const existingCodeData = codeDoc.data();
        if (existingCodeData.status === 'used') {
            return res.status(409).json({ error: 'Cannot edit a code that has already been delivered.' });
        }

        // Check if new code value is already taken
        const duplicateCheck = await db.collection('gift_card_codes')
            .where('code', '==', newCode)
            .limit(1)
            .get();
            
        if (!duplicateCheck.empty && duplicateCheck.docs[0].id !== req.params.codeId) {
            return res.status(409).json({ error: 'That code already exists in stock.' });
        }

        await codeRef.update({ code: newCode });
        res.json({ message: 'Code updated.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update code.' });
    }
});

// DELETE /api/cards/:cardId/codes/:codeId  — remove a code from stock (admin)
router.delete('/:id/codes/:codeId', authenticate, requireAdmin, async (req, res) => {
    try {
        const codeRef = db.collection('gift_card_codes').doc(req.params.codeId);
        const codeDoc = await codeRef.get();
        if (!codeDoc.exists || codeDoc.data().gift_card_id !== req.params.id) {
            return res.status(404).json({ error: 'Code not found.' });
        }
        
        if (codeDoc.data().status === 'used') {
            return res.status(409).json({ error: 'Cannot delete a code that has already been delivered.' });
        }

        await codeRef.delete();
        res.json({ message: 'Code deleted.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete code.' });
    }
});

module.exports = router;
