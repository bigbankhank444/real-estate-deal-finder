'use strict';

const { withRetry } = require('../../src/utils/retry');

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

test('withRetry: resolves immediately on first success', async () => {
  const fn = jest.fn().mockResolvedValue('ok');
  const result = await withRetry(fn, 3, 0);
  expect(result).toBe('ok');
  expect(fn).toHaveBeenCalledTimes(1);
});

test('withRetry: retries on failure and resolves on second attempt', async () => {
  const fn = jest.fn()
    .mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValue('ok');
  const result = await withRetry(fn, 3, 0);
  expect(result).toBe('ok');
  expect(fn).toHaveBeenCalledTimes(2);
});

test('withRetry: throws after all retries exhausted', async () => {
  const err = new Error('always fails');
  const fn = jest.fn().mockRejectedValue(err);
  await expect(withRetry(fn, 3, 0)).rejects.toThrow('always fails');
  expect(fn).toHaveBeenCalledTimes(3);
});

test('withRetry: retries=1 means one attempt only, no retries', async () => {
  const fn = jest.fn().mockRejectedValue(new Error('fail'));
  await expect(withRetry(fn, 1, 0)).rejects.toThrow('fail');
  expect(fn).toHaveBeenCalledTimes(1);
});
