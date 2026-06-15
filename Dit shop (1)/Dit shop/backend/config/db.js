// ============================================================
// Dit Shop — Cloud Firestore Database Adapter
// ============================================================
const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

// Initialize Firebase Admin with automated credential fallback
if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
        try {
            const serviceAccount = JSON.parse(
                Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
            );
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: serviceAccount.project_id || 'dit-shop-d9bd9'
            });
            console.log('✓ Firebase Admin initialized using FIREBASE_SERVICE_ACCOUNT_BASE64 env variable');
        } catch (e) {
            console.error('❌ Failed to initialize Firebase using Base64 env:', e);
        }
    } else {
        const pathA = path.join(__dirname, 'service-account.json');
        const pathB = path.join(__dirname, '..', 'service-account.json');
        let serviceAccountPath = null;
        
        if (fs.existsSync(pathA)) {
            serviceAccountPath = pathA;
        } else if (fs.existsSync(pathB)) {
            serviceAccountPath = pathB;
        }

        if (serviceAccountPath) {
            const serviceAccount = require(serviceAccountPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: 'dit-shop-d9bd9'
            });
            console.log(`✓ Firebase Admin initialized locally using service account from ${path.basename(serviceAccountPath)}`);
        } else {
            admin.initializeApp({
                projectId: process.env.GCLOUD_PROJECT || 'dit-shop-d9bd9'
            });
            console.log('✓ Firebase Admin initialized using default cloud credentials');
        }
    }
}

const db = admin.firestore();

// Helper to convert Firestore timestamp to JS Date string
db.formatDate = (timestamp) => {
    if (!timestamp) return new Date().toISOString();
    if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toISOString();
    }
    return new Date(timestamp).toISOString();
};

// Idempotent seeding function
async function seedDatabase() {
    try {
        const usersColl = db.collection('users');
        const adminQuery = await usersColl.where('role', '==', 'admin').limit(1).get();
        if (adminQuery.empty) {
            const adminRef = usersColl.doc('admin_bandit');
            await adminRef.set({
                id: adminRef.id,
                username: 'Bandit',
                email: 'nicklpb1123@gmail.com',
                password: '$2a$10$927TdaX/0ZdUIyhe/KLz8esFpjs8Eev/wz2di51c2TDkOBPvtwdMu', // bcrypt of "khamphet"
                full_name: 'Bandit',
                role: 'admin',
                avatar_url: null,
                created_at: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log('✓ Seeded admin account in Firestore: nicklpb1123@gmail.com');
        }

        const cardsColl = db.collection('gift_cards');
        const cardsQuery = await cardsColl.limit(1).get();
        if (cardsQuery.empty) {
            const samples = [
                { name: 'Steam Gift Card $10',   description: 'Use on any Steam purchase.',              denomination: 10.00, price: 10.50, category: 'Gaming',    image_url: '/img/steam.png' },
                { name: 'Netflix Gift Card $25', description: '1 month premium subscription voucher.',   denomination: 25.00, price: 26.00, category: 'Streaming', image_url: '/img/netflix.png' },
                { name: 'Google Play $15',       description: 'Buy apps, games, or movies on Google.',   denomination: 15.00, price: 15.75, category: 'Mobile',    image_url: '/img/google.png' },
                { name: 'Amazon Gift Card $50',  description: 'Shop anything on Amazon.com.',            denomination: 50.00, price: 51.00, category: 'Shopping', image_url: '/img/amazon.png' },
                { name: 'Spotify Premium $10',   description: '1 month ad-free music streaming.',        denomination: 10.00, price: 10.25, category: 'Streaming', image_url: '/img/spotify.png' },
            ];
            
            const batch = db.batch();
            for (const s of samples) {
                const ref = cardsColl.doc();
                batch.set(ref, {
                    id: ref.id,
                    ...s,
                    currency: 'USD',
                    is_active: true,
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            await batch.commit();
            console.log(`✓ Seeded ${samples.length} sample gift cards in Firestore`);
        }
    } catch (err) {
        console.error('❌ Database seeding failed:', err);
    }
}

// Run seeding in the background
seedDatabase();

module.exports = db;
