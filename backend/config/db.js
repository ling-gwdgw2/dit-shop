// ============================================================
// Dit Shop — Database Connection Adapter (MySQL / SQLite)
// ============================================================
// Supports MySQL (XAMPP / Production) via mysql2/promise, as well as
// SQLite fallback via better-sqlite3 for zero-config local development.

const path = require('path');
const fs   = require('fs');
require('dotenv').config();

const driver = (process.env.DB_DRIVER || (process.env.DB_HOST ? 'mysql' : 'sqlite')).toLowerCase();

if (driver === 'mysql') {
    const mysql = require('mysql2/promise');

    const pool = mysql.createPool({
        host:             process.env.DB_HOST     || 'localhost',
        port:             parseInt(process.env.DB_PORT || '3306', 10),
        user:             process.env.DB_USER     || 'root',
        password:         process.env.DB_PASSWORD || '',
        database:         process.env.DB_NAME     || 'ditshop',
        waitForConnections: true,
        connectionLimit:  10,
        queueLimit:       0,
        dateStrings:      true
    });

    console.log(`✓ Connected to MySQL database (${process.env.DB_NAME || 'ditshop'} @ ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306})`);

    module.exports = {
        execute:       (sql, params) => pool.execute(sql, params),
        query:         (sql, params) => pool.query(sql, params),
        getConnection: () => pool.getConnection(),
        _pool:         pool
    };

} else {
    // SQLite driver mode
    const Database = require('better-sqlite3');

    const DB_PATH = process.env.DB_PATH ||
                    path.join(__dirname, '..', '..', 'database', 'ditshop.sqlite');

    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    const sqlite = new Database(DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    // Bootstrap SQLite schema if needed
    const schemaPath = path.join(__dirname, '..', '..', 'database', 'schema.sqlite.sql');
    if (fs.existsSync(schemaPath)) {
        sqlite.exec(fs.readFileSync(schemaPath, 'utf8'));
    }

    function hasColumn(table, col) {
        return sqlite.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
    }
    if (!hasColumn('gift_cards', 'currency')) {
        sqlite.exec("ALTER TABLE gift_cards ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'");
    }
    if (!hasColumn('orders', 'payment_proof_url')) {
        sqlite.exec("ALTER TABLE orders ADD COLUMN payment_proof_url TEXT");
    }
    if (!hasColumn('inbox_messages', 'from_user_id')) {
        sqlite.exec("ALTER TABLE inbox_messages ADD COLUMN from_user_id INTEGER");
    }
    if (!hasColumn('inbox_messages', 'is_help')) {
        sqlite.exec("ALTER TABLE inbox_messages ADD COLUMN is_help INTEGER NOT NULL DEFAULT 0");
    }
    if (!hasColumn('inbox_messages', 'parent_id')) {
        sqlite.exec("ALTER TABLE inbox_messages ADD COLUMN parent_id INTEGER");
    }
    if (!hasColumn('inbox_messages', 'image_url')) {
        sqlite.exec("ALTER TABLE inbox_messages ADD COLUMN image_url TEXT");
    }
    sqlite.exec("CREATE INDEX IF NOT EXISTS idx_inbox_help ON inbox_messages(is_help, is_read)");

    // Seed admin
    const ADMIN_EMAIL = 'nicklpb1123@gmail.com';
    const ADMIN_HASH  = '$2a$10$927TdaX/0ZdUIyhe/KLz8esFpjs8Eev/wz2di51c2TDkOBPvtwdMu';
    const existingAdmin = sqlite.prepare('SELECT id, email FROM users WHERE role = ? LIMIT 1').get('admin');
    if (!existingAdmin) {
        sqlite.prepare(
            `INSERT INTO users (username, email, password, full_name, role)
             VALUES (?,?,?,?,?)`
        ).run('Bandit', ADMIN_EMAIL, ADMIN_HASH, 'Bandit', 'admin');
    }

    function translate(sql, params) {
        sql = sql.replace(/\bNOW\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP');
        sql = sql.replace(/\bINSERT\s+IGNORE\b/gi, 'INSERT OR IGNORE');
        sql = sql.replace(/\bFOR\s+UPDATE\b/gi, '');
        const batchMatch = /VALUES\s*\?\s*$/i.exec(sql.trim());
        if (batchMatch && Array.isArray(params[0]) && Array.isArray(params[0][0])) {
            const rows  = params[0];
            const cols  = rows[0].length;
            const tuple = '(' + Array(cols).fill('?').join(',') + ')';
            sql    = sql.replace(/VALUES\s*\?\s*$/i, 'VALUES ' + rows.map(() => tuple).join(','));
            params = rows.flat();
        }
        return { sql, params };
    }

    function remapError(err) {
        if (err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT_UNIQUE')) {
            err.code = 'ER_DUP_ENTRY';
        }
        return err;
    }

    function isSelect(sql) {
        return /^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql);
    }

    function runOne(sql, params) {
        ({ sql, params } = translate(sql, params || []));
        try {
            const stmt = sqlite.prepare(sql);
            if (isSelect(sql)) {
                return [stmt.all(...params), []];
            }
            const info = stmt.run(...params);
            return [{
                insertId:     info.lastInsertRowid,
                affectedRows: info.changes,
                changedRows:  info.changes,
            }, []];
        } catch (err) {
            throw remapError(err);
        }
    }

    console.log(`✓ Connected to SQLite database (${DB_PATH})`);

    module.exports = {
        execute: async (sql, params = []) => runOne(sql, params),
        query:   async (sql, params = []) => runOne(sql, params),
        getConnection: async () => {
            let active = false;
            return {
                async execute(sql, params = []) { return runOne(sql, params); },
                async query  (sql, params = []) { return runOne(sql, params); },
                async beginTransaction() { if (!active) { sqlite.exec('BEGIN');    active = true;  } },
                async commit()           { if (active)  { sqlite.exec('COMMIT');   active = false; } },
                async rollback()         { if (active)  { sqlite.exec('ROLLBACK'); active = false; } },
                release() {}
            };
        },
        _raw: sqlite
    };
}
