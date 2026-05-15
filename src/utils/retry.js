'use strict';

async function withRetry(fn, retries = 3, delayMs = 5000) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const wait = delayMs * attempt;
        console.warn(`[retry] Attempt ${attempt}/${retries} failed: ${err.message}. Retrying in ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

module.exports = { withRetry };
