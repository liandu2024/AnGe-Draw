import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, 'excalidraw.db');

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password_hash TEXT,
            role TEXT,
            auth_type TEXT DEFAULT 'local'
        )`,
      (err) => {
        if (err) {
          console.error('Error creating users table', err);
        } else {
          // Check if admin exists
          db.get(`SELECT * FROM users WHERE username = 'admin'`, async (err, row) => {
            if (!row) {
              const hash = await bcrypt.hash('admin', 10);
              db.run(`INSERT INTO users (username, password_hash, role, auth_type) VALUES (?, ?, ?, ?)`, ['admin', hash, 'ADMIN', 'local']);
              console.log('Default admin user created.');
            }
          });
        }
      }
    );

    db.run(`CREATE TABLE IF NOT EXISTS canvases (
        id TEXT PRIMARY KEY,
        user_id INTEGER,
        title TEXT,
        elements TEXT,
        appState TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`, (err) => {
      if (err) {
        console.error('Error creating canvases table', err);
      } else {
        db.run(`CREATE TABLE IF NOT EXISTS oidc_config (
          id INTEGER PRIMARY KEY DEFAULT 1,
          provider_name TEXT DEFAULT 'OIDC登录',
          client_id TEXT,
          client_secret TEXT,
          issuer_url TEXT,
          redirect_uri TEXT,
          username_claim TEXT DEFAULT 'name',
          enabled BOOLEAN DEFAULT 0
        )`, (err) => {
          if (err) {
            console.error('Error creating oidc_config table', err);
          } else {
            db.run(`INSERT OR IGNORE INTO oidc_config (id, enabled) VALUES (1, 0)`);
            // Add username_claim column if it doesn't exist (for existing databases)
            db.run(`ALTER TABLE oidc_config ADD COLUMN username_claim TEXT DEFAULT 'name'`, () => {});
            // Add auth_type column to users if it doesn't exist (for existing databases)
            db.run(`ALTER TABLE users ADD COLUMN auth_type TEXT DEFAULT 'local'`, () => {});
            
            db.run(`CREATE TABLE IF NOT EXISTS user_library (
              user_id INTEGER PRIMARY KEY,
              library_data TEXT,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(user_id) REFERENCES users(id)
            )`, (err) => {
              if (err) console.error('Error creating user_library table', err);
            });
          }
        });
      }
    });
  }
});
