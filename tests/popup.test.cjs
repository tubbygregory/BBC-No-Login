const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
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

async function popupWith(preference) {
  const page = await browser.newPage();
  await page.addInitScript(preference => {
    const data = { neverAskToSignIn: preference };
    const listeners = [];
    window.failWrites = false;
    window.chrome = {
      runtime: {},
      storage: {
        local: {
          get(defaults, callback) { callback({ ...data }); },
          set(values, callback) {
            if (window.failWrites) {
              chrome.runtime.lastError = { message: 'Test write failure' };
              callback?.();
              chrome.runtime.lastError = undefined;
              return;
            }
            const changes = {};
            for (const [key, value] of Object.entries(values)) {
              changes[key] = { oldValue: data[key], newValue: value };
              data[key] = value;
            }
            callback?.();
            for (const listener of listeners) listener(changes, 'local');
          },
        },
        onChanged: { addListener(listener) { listeners.push(listener); } },
      },
    };
    window.savedPreference = () => data.neverAskToSignIn;
  }, preference);
  await page.route('https://www.bbc.co.uk/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (!['popup.html', 'popup.js', 'popup.css'].includes(name)) return route.abort();
    const type = name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'application/javascript';
    await route.fulfill({ contentType: type, body: await readFile(path.join(__dirname, '..', name), 'utf8') });
  });
  await page.goto('https://www.bbc.co.uk/popup.html');
  await page.waitForFunction(() => !document.querySelector('#never-reminders').disabled);
  return page;
}

test('popup can enable Never and explicitly allow reminders again', async () => {
  const page = await popupWith(false);
  try {
    assert.equal(await page.locator('#never-reminders').isChecked(), false);
    assert.equal(await page.locator('#allow-reminders').isDisabled(), true);
    await page.locator('#never-reminders').check();
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
    assert.equal(await page.locator('#allow-reminders').isEnabled(), true);
    await page.locator('#allow-reminders').click();
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
    assert.equal(await page.locator('#never-reminders').isChecked(), false);
    assert.equal(await page.locator('#allow-reminders').isDisabled(), true);
  } finally { await page.close(); }
});

test('popup reflects changes from another tab', async () => {
  const page = await popupWith(false);
  try {
    await page.evaluate(() => chrome.storage.local.set({ neverAskToSignIn: true }));
    assert.equal(await page.locator('#never-reminders').isChecked(), true);
    assert.equal(await page.locator('#allow-reminders').isEnabled(), true);
  } finally { await page.close(); }
});

test('popup reports storage write failure and preserves the saved choice', async () => {
  const page = await popupWith(true);
  try {
    await page.evaluate(() => { window.failWrites = true; });
    await page.locator('#allow-reminders').click();
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
    assert.equal(await page.locator('#never-reminders').isChecked(), true);
    assert.match(await page.locator('#status').innerText(), /could not be saved/i);
  } finally { await page.close(); }
});
