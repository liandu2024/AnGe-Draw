import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('./server/excalidraw.db');
db.all("SELECT id, title, user_id FROM canvases;", (err, rows) => console.log(rows));
