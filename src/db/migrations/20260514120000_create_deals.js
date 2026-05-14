exports.up = function(knex) {
  return knex.schema.createTable('deals', (t) => {
    t.increments('id').primary();
    t.text('address').notNullable();
    t.text('owner_name');
    t.text('signal_type').notNullable();
    t.integer('asking_price');
    t.integer('estimated_value');
    t.integer('arv');
    t.integer('fair_offer');
    t.jsonb('comparables');
    t.text('contact_info');
    t.text('source_url');
    t.jsonb('raw');
    t.integer('score');
    t.timestamps(true, true);
    t.unique(['address', 'signal_type']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('deals');
};
