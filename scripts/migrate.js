require('dotenv').config();

const rawUrl = process.env.DATABASE_URL || '';
const isLocal = rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1');

let connection;
if (isLocal) {
  connection = rawUrl;
} else {
  const u = new URL(rawUrl);
  connection = {
    host:     u.hostname,
    port:     parseInt(u.port || '5432', 10),
    database: u.pathname.replace(/^\//, ''),
    user:     decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl:      true,
  };
}

const knex = require('knex')({
  client: 'pg',
  connection,
  migrations: {
    directory: './src/db/migrations',
  },
});

knex.migrate
  .latest()
  .then(([batchNo, log]) => {
    if (log.length === 0) {
      console.log('Already up to date');
    } else {
      console.log(`Batch ${batchNo} run: ${log.length} migration(s)`);
      log.forEach(file => console.log(` - ${file}`));
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
