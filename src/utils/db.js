const { Pool } = require('pg');
const { getConfig } = require('../../config');

let pool;

function getDb() {
  if (!pool) {
    const raw = getConfig().db.url;
    const isLocal = raw.includes('localhost') || raw.includes('127.0.0.1');
    pool = new Pool({
      connectionString: raw,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

module.exports = { getDb };
