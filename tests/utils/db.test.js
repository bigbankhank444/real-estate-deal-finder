jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: jest.fn() })),
}));

describe('getDb', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('creates a Pool with the DATABASE_URL from config', () => {
    process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/testdb';
    const { Pool } = require('pg');
    const { getDb } = require('../../src/utils/db');

    getDb();

    expect(Pool).toHaveBeenCalledWith({
      connectionString: 'postgres://test:test@localhost:5432/testdb',
    });
  });

  it('returns the same Pool instance on repeated calls', () => {
    const { Pool } = require('pg');
    const { getDb } = require('../../src/utils/db');

    const first = getDb();
    const second = getDb();

    expect(first).toBe(second);
    expect(Pool).toHaveBeenCalledTimes(1);
  });
});
