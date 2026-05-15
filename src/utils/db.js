const { Pool } = require('pg');
const { getConfig } = require('../../config');

let pool;

function getDb() {
  if (!pool) {
    const raw = getConfig().db.url;
    const isLocal = raw.includes('localhost') || raw.includes('127.0.0.1');
    if (isLocal) {
      pool = new Pool({ connectionString: raw });
    } else {
      const u = new URL(raw);
      pool = new Pool({
        host:     u.hostname,
        port:     parseInt(u.port || '5432', 10),
        database: u.pathname.replace(/^\//, ''),
        user:     decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        ssl:      { rejectUnauthorized: false },
      });
    }
  }
  return pool;
}

module.exports = { getDb };
