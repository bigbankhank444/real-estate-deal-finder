const { Pool } = require('pg');
const { getConfig } = require('../../config');

let pool;

function getDb() {
  if (!pool) {
    pool = new Pool({ connectionString: getConfig().db.url });
  }
  return pool;
}

module.exports = { getDb };
