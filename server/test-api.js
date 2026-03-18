const axios = require('axios');
(async () => {
  try {
    // Assuming we have a local dev way or just checking the route
    const fs = require('fs');
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database('./database.sqlite');
    db.all("SELECT id, title, length(elements) as elements_len FROM canvases LIMIT 5", (err, rows) => {
        console.log(rows);
    });
  } catch(e) { console.error(e) }
})();
