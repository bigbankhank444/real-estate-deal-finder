const { chromium } = require('playwright');

/**
 * Launch a Playwright browser instance with anti-detection measures.
 * Returns the browser, context, and page so callers can manage their lifecycle.
 *
 * @returns {Promise<{ browser: object, context: object, page: object }>}
 */
async function launchBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // Create context with userAgent and viewport options (newPage ignores these)
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    // Hide webdriver property to avoid detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Random delay before first interaction (1-3 seconds)
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

    return { browser, context, page };
  } catch (error) {
    // Close browser on any failure to prevent process leaks
    await browser.close();
    throw error;
  }
}

module.exports = { launchBrowser };
