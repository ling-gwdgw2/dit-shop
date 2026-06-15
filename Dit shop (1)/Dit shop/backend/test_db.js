const path = require('path');
const fs = require('fs');

console.log('=== Starting Database Verification Test ===\n');

// 1. Check local credentials file
const serviceAccountPath = path.join(__dirname, 'service-account.json');
if (fs.existsSync(serviceAccountPath)) {
    console.log(`✓ service-account.json found at: ${serviceAccountPath}`);
} else {
    console.log(`i service-account.json not found locally at backend/service-account.json`);
}

// 2. Load the database config adapter (db.js)
console.log('\nLoading database adapter (backend/config/db.js)...');
let db;
try {
    db = require('./config/db');
    console.log('✓ Database adapter loaded successfully.');
} catch (error) {
    console.error('❌ Failed to load backend/config/db.js:', error);
    process.exit(1);
}

// 3. Test Firestore connectivity by fetching collections
async function testFirestore() {
    console.log('\nTesting connection to Cloud Firestore...');
    try {
        const usersSnapshot = await db.collection('users').get();
        console.log(`✓ Firestore Connection Successful.`);
        console.log(`✓ Collection 'users': ${usersSnapshot.size} document(s) found.`);
        usersSnapshot.forEach(doc => {
            console.log(`  - User: ${doc.data().username} (${doc.data().role || 'user'})`);
        });

        const cardsSnapshot = await db.collection('gift_cards').get();
        console.log(`✓ Collection 'gift_cards': ${cardsSnapshot.size} document(s) found.`);
        cardsSnapshot.forEach(doc => {
            console.log(`  - Card: ${doc.data().name} ($${doc.data().denomination})`);
        });
    } catch (error) {
        console.error('❌ Firestore read failed:', error);
    }
}

// 4. Test SQLite database file presence
function checkSQLite() {
    const sqlitePath = path.join(__dirname, '..', 'database', 'ditshop.sqlite');
    console.log('\nChecking SQLite Local Database status...');
    if (fs.existsSync(sqlitePath)) {
        const stats = fs.statSync(sqlitePath);
        console.log(`✓ SQLite database file exists at: ${sqlitePath}`);
        console.log(`✓ Size: ${stats.size} bytes`);
    } else {
        console.log(`i SQLite database file not found at: ${sqlitePath}`);
    }
}

// Run tests
(async () => {
    await testFirestore();
    checkSQLite();
    console.log('\n=== Database Verification Completed ===');
    process.exit(0);
})();
