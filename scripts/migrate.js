require('dotenv').config();

const rawUrl = process.env.DATABASE_URL || '';
const isLocal = rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1');

const knex = require('knex')({
  client: 'pg',
  connection: {
    connectionString: rawUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  },
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
