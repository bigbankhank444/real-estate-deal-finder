const { Pool } = require('pg');
const { getConfig } = require('../../config');

let pool;

function getDb() {
  if (!pool) {
    const ssl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
    pool = new Pool({ connectionString: getConfig().db.url, ssl });
  }
  return pool;
}

module.exports = { getDb };
