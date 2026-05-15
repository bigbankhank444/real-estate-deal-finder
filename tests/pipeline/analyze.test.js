jest.mock('../../src/utils/openrouter');

const { chat } = require('../../src/utils/openrouter');
const { analyze } = require('../../src/pipeline/analyze');

const SAMPLE_LISTING = {
  address: '123 Main St, Youngstown, OH 44501',
  owner_name: null,
  signal_type: 'tax_delinquent',
  asking_price: 50000,
  estimated_value: 80000,
  arv: 90000,
  fair_offer: 45000,
  comparables: [{ address: '125 Main St', price: 85000 }],
  contact_info: null,
  source_url: 'https://example.com',
  raw: { original: true },
};

describe('analyze', () => {
  beforeEach(() => {
    chat.mockReset();
  });

  it('calls openrouter once per listing with correct prompt structure', async () => {
    chat.mockResolvedValue('{"score": 85, "rationale": "Great deal"}');

    const listing2 = { ...SAMPLE_LISTING, address: '456 Elm St, Youngstown, OH 44501' };
    await analyze([SAMPLE_LISTING, listing2]);

    expect(chat).toHaveBeenCalledTimes(2);

    const firstCall = chat.mock.calls[0][0];
    expect(Array.isArray(firstCall)).toBe(true);
    expect(firstCall[0].role).toBe('user');
    expect(firstCall[0].content).toContain(SAMPLE_LISTING.address);
    expect(firstCall[0].content).toContain(SAMPLE_LISTING.signal_type);
    expect(firstCall[0].content).toContain(String(SAMPLE_LISTING.asking_price));
    expect(firstCall[0].content).toContain(String(SAMPLE_LISTING.estimated_value));

    const secondCall = chat.mock.calls[1][0];
    expect(secondCall[0].content).toContain(listing2.address);
  });

  it('sets listing.score and listing.raw.rationale from parsed response', async () => {
    chat.mockResolvedValue('{"score": 72, "rationale": "Solid distressed deal"}');

    const results = await analyze([SAMPLE_LISTING]);

    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(72);
    expect(results[0].raw.rationale).toBe('Solid distressed deal');
    expect(results[0].raw.original).toBe(true);
  });

  it('leaves score null and does not throw if openrouter fails for a listing', async () => {
    chat.mockRejectedValue(new Error('Network error'));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const results = await analyze([SAMPLE_LISTING]);

    expect(results).toHaveLength(1);
    expect(results[0].score).toBeNull();
    warnSpy.mockRestore();
  });

  it('handles empty input and returns []', async () => {
    const results = await analyze([]);
    expect(results).toEqual([]);
    expect(chat).not.toHaveBeenCalled();
  });
});
