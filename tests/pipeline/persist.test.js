jest.mock('../../src/utils/db');

const { getDb } = require('../../src/utils/db');
const { persist } = require('../../src/pipeline/persist');

const SAMPLE_LISTING = {
  address: '123 Main St, Youngstown, OH 44501',
  owner_name: 'Jane Doe',
  signal_type: 'tax_delinquent',
  asking_price: 50000,
  estimated_value: 80000,
  arv: 90000,
  fair_offer: 45000,
  comparables: [{ address: '125 Main St', price: 85000 }],
  contact_info: 'jane@example.com',
  source_url: 'https://example.com/listing/1',
  raw: { original: true },
  score: 72,
};

const SAMPLE_ROW = { id: 1, ...SAMPLE_LISTING, created_at: new Date(), updated_at: new Date() };

describe('persist', () => {
  let mockQuery;

  beforeEach(() => {
    mockQuery = jest.fn().mockResolvedValue({ rows: [SAMPLE_ROW] });
    getDb.mockReturnValue({ query: mockQuery });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls query once per listing', async () => {
    const listings = [SAMPLE_LISTING, { ...SAMPLE_LISTING, address: '456 Elm St, Youngstown, OH 44501' }];
    await persist(listings);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('returns the rows from RETURNING *', async () => {
    const row1 = { ...SAMPLE_ROW, id: 1 };
    const row2 = { ...SAMPLE_ROW, id: 2, address: '456 Elm St, Youngstown, OH 44501' };
    mockQuery
      .mockResolvedValueOnce({ rows: [row1] })
      .mockResolvedValueOnce({ rows: [row2] });

    const listings = [
      SAMPLE_LISTING,
      { ...SAMPLE_LISTING, address: '456 Elm St, Youngstown, OH 44501' },
    ];
    const result = await persist(listings);

    expect(result).toEqual([row1, row2]);
  });

  it('returns empty array for empty input', async () => {
    const result = await persist([]);
    expect(result).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
