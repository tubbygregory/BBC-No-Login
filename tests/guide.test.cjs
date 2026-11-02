const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

let browser;
before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
});
after(async () => { await browser?.close(); });

async function guideWith({ copyFails = false, viewport = { width: 1200, height: 900 } } = {}) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(copyFails => {
    window.copiedAddresses = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(value) {
          if (copyFails) throw new Error('Test clipboard permission failure');
          window.copiedAddresses.push(value);
        },
      },
    });
  }, copyFails);
  // This managed browser blocks file:// pages. Serve the exact static guide
  // resources through a routed fixture so its UI still gets functional checks.
  await page.route('https://www.bbc.co.uk/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (!['START-HERE.html', 'guide.js', 'guide.css'].includes(name) && !/^icons\/icon\d+\.png$/.test(name)) return route.abort();
    const contentType = name.endsWith('.html') ? 'text/html; charset=utf-8'
      : name.endsWith('.css') ? 'text/css; charset=utf-8'
        : name.endsWith('.png') ? 'image/png' : 'application/javascript; charset=utf-8';
    await route.fulfill({ contentType, body: await readFile(path.resolve(__dirname, '..', name)) });
  });
  await page.goto('https://www.bbc.co.uk/START-HERE.html');
  return page;
}

test('the installation guide opens directly from the extracted folder', async (t) => {
  const page = await browser.newPage();
  try {
    try {
      await page.goto(pathToFileURL(path.resolve(__dirname, '..', 'START-HERE.html')).href);
    } catch (error) {
      if (error.message.includes('net::ERR_BLOCKED_BY_ADMINISTRATOR')) {
        t.skip('Managed Chromium blocks local file pages; routed static-guide interaction tests still execute.');
        return;
      }
      throw error;
    }
    await page.getByRole('radio', { name: 'Microsoft Edge', exact: true }).check();
    assert.equal(await page.locator('#extensions-address').inputValue(), 'edge://extensions');
  } finally { await page.close(); }
});

test('the extracted installation guide selects the correct browser address and instructions', async () => {
  const page = await guideWith();
  try {
    assert.equal(await page.locator('#extensions-address').inputValue(), 'chrome://extensions');
    assert.equal(await page.locator('#extensions-address').isEditable(), false);
    for (const [name, address] of [['Microsoft Edge', 'edge://extensions'], ['Brave', 'brave://extensions'], ['Chrome', 'chrome://extensions']]) {
      await page.getByRole('radio', { name, exact: true }).check();
      assert.equal(await page.locator('#extensions-address').inputValue(), address);
      if (name === 'Microsoft Edge') assert.match(await page.locator('#developer-mode-hint').innerText(), /left sidebar/i);
    }
  } finally { await page.close(); }
});

test('the installation guide copies the selected browser address and announces success', async () => {
  const page = await guideWith();
  try {
    await page.getByRole('radio', { name: 'Microsoft Edge', exact: true }).check();
    await page.locator('#copy-address').click();
    assert.deepEqual(await page.evaluate(() => window.copiedAddresses), ['edge://extensions']);
    assert.equal(await page.locator('#copy-address').evaluate(button => document.activeElement === button), true);
    assert.match(await page.locator('#copy-status').innerText(), /copied/i);
    assert.equal(await page.locator('#copy-status').getAttribute('role'), 'status');
    assert.equal(await page.locator('#copy-status').getAttribute('aria-live'), 'polite');
  } finally { await page.close(); }
});

test('clipboard failure offers a working selected-text fallback without claiming success', async () => {
  const page = await guideWith({ copyFails: true });
  try {
    await page.locator('#copy-address').click();
    assert.deepEqual(await page.evaluate(() => window.copiedAddresses), []);
    assert.match(await page.locator('#copy-status').innerText(), /select and copy/i);
    assert.doesNotMatch(await page.locator('#copy-status').innerText(), /address copied/i);
    assert.deepEqual(await page.locator('#extensions-address').evaluate(input => ({
      focused: document.activeElement === input,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      length: input.value.length,
    })), { focused: true, selectionStart: 0, selectionEnd: 19, length: 19 });
  } finally { await page.close(); }
});

test('the installation guide is keyboard operable and fits a narrow screen', async () => {
  const page = await guideWith({ viewport: { width: 375, height: 812 } });
  try {
    const chrome = page.getByRole('radio', { name: 'Chrome', exact: true });
    await chrome.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('radio', { name: 'Microsoft Edge', exact: true }).isChecked(), true);
    assert.equal(await page.locator('#extensions-address').inputValue(), 'edge://extensions');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.locator('#copy-address').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.copiedAddresses), ['edge://extensions']);
    assert.equal(await page.locator('#copy-address').evaluate(button => document.activeElement === button), true);
  } finally { await page.close(); }
});
