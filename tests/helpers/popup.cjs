const { readFile } = require('node:fs/promises');
const path = require('node:path');

async function popupWith(browser, {
  preference = false,
  failReads = false,
  deferReads = false,
  deferWrites = false,
  waitReady = true,
  colorScheme = 'light',
} = {}) {
  const page = await browser.newPage({ viewport: { width: 360, height: 760 }, colorScheme });
  await page.addInitScript(({ preference, failReads, deferReads, deferWrites }) => {
    const data = { neverAskToSignIn: preference };
    const listeners = [];
    const reads = [];
    const writes = [];
    window.failReads = failReads;
    window.failWrites = false;
    window.chrome = {
      runtime: { getManifest: () => ({ version: '1.1.0' }) },
      storage: {
        local: {
          get(defaults, callback) {
            const snapshot = { ...data };
            const finish = () => {
              if (window.failReads) chrome.runtime.lastError = { message: 'Test read failure' };
              callback(window.failReads ? undefined : snapshot);
              chrome.runtime.lastError = undefined;
            };
            if (deferReads) reads.push(finish);
            else finish();
          },
          set(values, callback) {
            const finish = () => {
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
            };
            if (deferWrites) writes.push(finish);
            else finish();
          },
        },
        onChanged: { addListener(listener) { listeners.push(listener); } },
      },
    };
    window.savedPreference = () => data.neverAskToSignIn;
    window.externalPreference = (value) => {
      const oldValue = data.neverAskToSignIn;
      data.neverAskToSignIn = value;
      for (const listener of listeners) listener({ neverAskToSignIn: { oldValue, newValue: value } }, 'local');
    };
    window.flushReads = () => { while (reads.length) reads.shift()(); };
    window.flushWrites = () => { while (writes.length) writes.shift()(); };
  }, { preference, failReads, deferReads, deferWrites });
  await page.route('https://www.bbc.co.uk/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (!['popup.html', 'popup.js', 'popup.css'].includes(name) && !/^icons\/icon\d+\.png$/.test(name)) return route.abort();
    const contentType = name.endsWith('.html') ? 'text/html; charset=utf-8'
      : name.endsWith('.css') ? 'text/css; charset=utf-8'
        : name.endsWith('.png') ? 'image/png' : 'application/javascript; charset=utf-8';
    await route.fulfill({ contentType, body: await readFile(path.join(__dirname, '../..', name)) });
  });
  await page.goto('https://www.bbc.co.uk/popup.html');
  if (waitReady) await page.waitForFunction(() => !document.querySelector('#never-reminders').disabled);
  return page;
}

module.exports = { popupWith };
