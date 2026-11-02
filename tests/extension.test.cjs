const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');

test('unpacked MV3 extension works on both BBC domains and resets through its popup', { timeout: 30000 }, async (t) => {
  const extensionPath = path.resolve(__dirname, '..');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'bbc-no-login-test-'));
  let context;
  const html = `<!doctype html><html lang="en"><title>BBC fixture</title><body>
    <main id="article">A BBC article.</main>
    <section role="dialog" id="reminder"><h2>Sign in to the BBC</h2>
    <a href="https://account.bbc.com/signin">Sign in</a><button id="later">Maybe later</button></section>
    <script>window.dismissed = 0; document.addEventListener('click', e => {
      if (e.target.id === 'later') { window.dismissed++; document.querySelector('#reminder').remove(); }
    });</script></body></html>`;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-extension-debugging',
      ],
    });
    context.setDefaultTimeout(8000);
    const session = await context.browser().newBrowserCDPSession();
    let extensionId;
    try {
      ({ id: extensionId } = await session.send('Extensions.loadUnpacked', { path: extensionPath }));
    } catch (error) {
      if (error.message.endsWith('Protocol error (Extensions.loadUnpacked): Loading of unpacked extensions is disabled by the administrator.')) {
        t.skip('Managed Chromium policy prohibits unpacked extensions; DOM and popup fixture tests still execute.');
        return;
      }
      throw error;
    }
    await context.route(/^https:\/\/(www\.)?bbc\.(co\.uk|com)\//, route => route.fulfill({
      contentType: 'text/html', body: html,
    }));
    const news = await context.newPage();
    await news.goto('https://www.bbc.co.uk/news/test');
    await news.locator('[data-bbc-no-login-never]').waitFor();
    await news.locator('[data-bbc-no-login-never]').click();
    await news.waitForFunction(() => window.dismissed === 1);
    assert.equal(await news.locator('#article').isVisible(), true);

    const international = await context.newPage();
    await international.goto('https://www.bbc.com/news/test');
    await international.waitForFunction(() => window.dismissed === 1);
    assert.equal(await international.locator('#article').isVisible(), true);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForFunction(() => document.querySelector('#never-reminders')?.checked);
    assert.equal(await popup.locator('#allow-reminders').isEnabled(), true);
    await popup.locator('#allow-reminders').click();
    await popup.waitForFunction(() => !document.querySelector('#never-reminders').checked);
    assert.equal((await popup.evaluate(() => chrome.storage.local.get('neverAskToSignIn'))).neverAskToSignIn, false);
    await international.reload();
    await international.locator('[data-bbc-no-login-never]').waitFor();
    assert.equal(await international.evaluate(() => window.dismissed), 0);
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
