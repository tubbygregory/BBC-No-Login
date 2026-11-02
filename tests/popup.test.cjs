const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { chromium } = require('playwright-core');
const { popupWith: createPopup } = require('./helpers/popup.cjs');

let browser;
before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
});
after(async () => { await browser?.close(); });

const popupWith = (preference, options = {}) => createPopup(browser, { preference, ...options });

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
    await page.evaluate(() => { window.failWrites = false; });
    await page.locator('#retry-preference').click();
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
    assert.equal(await page.locator('#never-reminders').isChecked(), false);
  } finally { await page.close(); }
});

test('popup keeps the preference unknown until its saved value has loaded', async () => {
  const page = await popupWith(true, { deferReads: true, waitReady: false });
  try {
    assert.equal(await page.locator('body').getAttribute('data-state'), 'loading');
    assert.equal(await page.locator('#never-reminders').isDisabled(), true);
    assert.equal(await page.locator('#allow-reminders').isDisabled(), true);
    assert.doesNotMatch(await page.locator('#state-label').innerText(), /\boff\b/i);
    await page.evaluate(() => window.flushReads());
    assert.equal(await page.locator('#never-reminders').isChecked(), true);
    assert.equal(await page.locator('body').getAttribute('data-state'), 'on');
  } finally { await page.close(); }
});

test('popup disables its controls while a choice is being saved', async () => {
  const page = await popupWith(false, { deferWrites: true });
  try {
    await page.locator('#never-reminders').check();
    assert.equal(await page.locator('body').getAttribute('data-state'), 'saving');
    assert.equal(await page.locator('#never-reminders').isDisabled(), true);
    assert.equal(await page.locator('#allow-reminders').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
    await page.evaluate(() => window.flushWrites());
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
    assert.equal(await page.locator('body').getAttribute('data-state'), 'on');
    assert.equal(await page.locator('#never-reminders').isEnabled(), true);
  } finally { await page.close(); }
});

test('a stale failed write does not replace a newer preference received from another view', async () => {
  const page = await popupWith(true, { deferWrites: true });
  try {
    await page.locator('#allow-reminders').click();
    assert.equal(await page.locator('body').getAttribute('data-state'), 'saving');
    await page.evaluate(() => {
      window.externalPreference(false);
      window.failWrites = true;
      window.flushWrites();
    });
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
    assert.equal(await page.locator('#never-reminders').isChecked(), false);
    assert.equal(await page.locator('body').getAttribute('data-state'), 'off');
    assert.equal(await page.locator('#retry-preference').isVisible(), false);
    assert.doesNotMatch(await page.locator('#status').innerText(), /could not be saved/i);
  } finally { await page.close(); }
});

test('popup reports an unreadable preference without calling it off and offers a working retry', async () => {
  const page = await popupWith(true, { failReads: true, waitReady: false });
  try {
    assert.equal(await page.locator('body').getAttribute('data-state'), 'error');
    assert.equal(await page.locator('#never-reminders').isDisabled(), true);
    assert.equal(await page.locator('#retry-preference').isVisible(), true);
    assert.doesNotMatch(await page.locator('#state-label').innerText(), /\boff\b/i);
    await page.evaluate(() => { window.failReads = false; });
    await page.locator('#retry-preference').click();
    assert.equal(await page.locator('#never-reminders').isChecked(), true);
    assert.equal(await page.locator('#never-reminders').isEnabled(), true);
    assert.equal(await page.locator('#retry-preference').isVisible(), false);
  } finally { await page.close(); }
});

test('popup preference and reset are operable with the keyboard', async () => {
  const page = await popupWith(false);
  try {
    const toggle = page.getByRole('switch', { name: 'Never ask me to sign in' });
    await toggle.focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
    assert.equal(await toggle.evaluate(input => document.activeElement === input), true);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
    assert.equal(await toggle.evaluate(input => document.activeElement === input), true);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
    await page.getByRole('button', { name: 'Allow reminders again' }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
  } finally { await page.close(); }
});

for (const colorScheme of ['light', 'dark']) {
  test(`popup fits its viewport and provides usable links in ${colorScheme} mode`, async () => {
    const page = await popupWith(true, { colorScheme });
    try {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight), true);
      assert.equal(await page.evaluate(() => document.body.getBoundingClientRect().height <= 600), true,
        'The default popup content must fit Chromium\'s 600px action-popup height');
      assert.equal(await page.getByRole('link', { name: 'Help', exact: true }).isVisible(), true);
      assert.match(await page.getByRole('link', { name: 'Help', exact: true }).getAttribute('href'), /docs\/INSTALL\.md$/);
      assert.match(await page.getByRole('link', { name: 'Report a problem', exact: true }).getAttribute('href'), /\/issues\/new$/);
      assert.equal(await page.getByRole('switch', { name: 'Never ask me to sign in' }).isChecked(), true);
    } finally { await page.close(); }
  });
}

test('popup read error and retry fit within Chromium action-popup height', async () => {
  const page = await popupWith(true, { failReads: true, waitReady: false });
  try {
    assert.equal(await page.locator('#retry-preference').isVisible(), true);
    assert.equal(await page.evaluate(() => document.body.getBoundingClientRect().height <= 600), true);
  } finally { await page.close(); }
});
