const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'blog.db');
let db;
let initialized = false;

async function getDB() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
  }
  if (!initialized) {
    initDB();
    initialized = true;
  }
  return wrapDB(db);
}

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      content TEXT,
      category TEXT,
      status TEXT DEFAULT 'draft',
      seo_title TEXT,
      seo_description TEXT,
      tags TEXT,
      featured_image TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM categories`);
  const result = countStmt.get();

  if (result.count === 0) {
    const defaults = [
      'Logistics',
      'Freight',
      'Supply Chain',
      'Industry News',
      'Company Updates',
      'Customs & Compliance',
      'East Africa Trade'
    ];
    const insertStmt = db.prepare(`INSERT OR IGNORE INTO categories (name) VALUES (?)`);
    for (const name of defaults) {
      insertStmt.run(name);
    }
  }
}

// Wrap node:sqlite's synchronous API to look like an async db.query() API
// so the rest of server.js doesn't need to change.
function wrapDB(rawDb) {
  return {
    async query(sql, params = []) {
      const trimmed = sql.trim().toUpperCase();
      const stmt = rawDb.prepare(sql);

      if (trimmed.startsWith('SELECT')) {
        return stmt.all(...params);
      } else {
        // INSERT / UPDATE / DELETE
        const info = stmt.run(...params);
        return [{ lastInsertRowid: info.lastInsertRowid, changes: info.changes }];
      }
    }
  };
}

module.exports = { getDB };