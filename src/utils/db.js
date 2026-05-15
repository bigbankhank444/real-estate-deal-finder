const { Pool } = require('pg');
const { getConfig } = require('../../config');

let pool;

function getDb() {
  if (!pool) {
    const url = getConfig().db.url;
    const ssl = url.includes('localhost') ? false : { rejectUnauthorized: false };
    pool = new Pool({ connectionString: url, ssl });
  }
  return pool;
}

module.exports = { getDb };
