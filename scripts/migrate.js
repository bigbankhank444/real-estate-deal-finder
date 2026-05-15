require('dotenv').config();

const knex = require('knex')({
  client: 'pg',
  connection: process.env.DATABASE_URL,
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
