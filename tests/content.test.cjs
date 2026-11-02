const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const path = require('node:path');
const { chromium } = require('playwright-core');

const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
const contentPath = path.join(__dirname, '..', 'content.js');
const neverSelector = '[data-bbc-no-login-never]';
let browser;

before(async () => {
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
});

after(async () => {
  await browser?.close();
});

function reminder(control = '<button data-native-dismiss>Maybe later</button>') {
  return `<section class="reminder" role="dialog" aria-label="BBC account reminder">
    <h2>Sign in to get more from the BBC</h2>
    <p>Enjoy a more personal BBC experience with your account.</p>
    <a href="https://account.bbc.com/signin">Sign in</a>
    ${control}
  </section>`;
}

function fixture(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>BBC fixture</title></head>
    <body><nav><a href="https://account.bbc.com/signin">Sign in</a></nav>
    <main><h1>Today's news</h1><p id="article">Article remains available.</p></main>
    ${body}
    <script>
      window.nativeDismissals = 0;
      document.addEventListener('click', event => {
        const control = event.target.closest('[data-native-dismiss]');
        if (!control) return;
        event.preventDefault();
        window.nativeDismissals += 1;
        control.closest('.reminder')?.remove();
      });
    </script></body></html>`;
}

async function pageWith(body, { preference = false, storageDelay = 0, failWrites = false } = {}) {
  const page = await browser.newPage();
  await page.addInitScript(({ preference, storageDelay, failWrites }) => {
    const data = { neverAskToSignIn: preference };
    const listeners = [];
    window.failWrites = failWrites;
    window.chrome = {
      runtime: { lastError: undefined },
      storage: {
        local: {
          get(keys, callback) {
            const result = { ...data };
            return new Promise(resolve => {
              setTimeout(() => {
                callback?.(result);
                resolve(result);
              }, storageDelay);
            });
          },
          set(values, callback) {
            if (window.failWrites) {
              chrome.runtime.lastError = { message: 'Test storage write failure' };
              callback?.();
              chrome.runtime.lastError = undefined;
              return Promise.resolve();
            }
            const changes = {};
            for (const [key, value] of Object.entries(values)) {
              changes[key] = { oldValue: data[key], newValue: value };
              data[key] = value;
            }
            callback?.();
            for (const listener of listeners) listener(changes, 'local');
            return Promise.resolve();
          },
        },
        onChanged: {
          addListener(listener) { listeners.push(listener); },
          removeListener(listener) {
            const index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
          },
        },
      },
    };
    window.savedPreference = () => data.neverAskToSignIn;
  }, { preference, storageDelay, failWrites });
  await page.route('https://www.bbc.co.uk/**', route => route.fulfill({
    contentType: 'text/html', body: fixture(body),
  }));
  await page.goto('https://www.bbc.co.uk/news/test');
  await page.addScriptTag({ path: contentPath });
  return page;
}

async function waitForNever(page, count = 1) {
  await page.waitForFunction(({ selector, count }) =>
    document.querySelectorAll(selector).length === count, { selector: neverSelector, count });
}

test('adds Never beside an optional sign-in reminder and preserves Maybe later', async () => {
  const page = await pageWith(reminder());
  try {
    await waitForNever(page);
    assert.equal((await page.locator(neverSelector).innerText()).trim(), 'Never');
    assert.equal(await page.locator('[data-native-dismiss]').innerText(), 'Maybe later');
    assert.equal(await page.locator('#article').isVisible(), true);
    await page.locator('[data-native-dismiss]').click();
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
    assert.equal(await page.evaluate(() => window.nativeDismissals), 1);
  } finally { await page.close(); }
});

test('Never persists the choice, uses native dismissal, and dismisses later reminders', async () => {
  const page = await pageWith(reminder());
  try {
    await waitForNever(page);
    await page.locator(neverSelector).click();
    await page.waitForFunction(() => window.nativeDismissals === 1);
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
    assert.equal(await page.locator('.reminder').count(), 0);
    await page.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), reminder());
    await page.waitForFunction(() => window.nativeDismissals === 2);
    assert.equal(await page.locator('.reminder').count(), 0);
    assert.equal(await page.locator('#article').isVisible(), true);
  } finally { await page.close(); }
});

test('Never confirms the saved choice and Undo allows future reminders again', async () => {
  const page = await pageWith(reminder());
  try {
    await waitForNever(page);
    await page.locator(neverSelector).click();
    const notice = page.locator('[data-bbc-no-login-notice]');
    await notice.waitFor();
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
    assert.equal(await page.locator('.reminder').count(), 0);
    await page.locator('[data-bbc-no-login-undo]').click();
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
    await page.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), reminder());
    await waitForNever(page);
    assert.equal(await page.evaluate(() => window.nativeDismissals), 1);
    assert.equal(await page.locator('.reminder').isVisible(), true);
  } finally { await page.close(); }
});

test('a keyboard Never choice moves focus to Undo when the native dismissal leaves the page unfocused', async () => {
  const page = await pageWith(reminder());
  try {
    await waitForNever(page);
    await page.locator(neverSelector).focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-bbc-no-login-notice]').waitFor();
    assert.equal(await page.locator('[data-bbc-no-login-undo]').evaluate(button => document.activeElement === button), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
  } finally { await page.close(); }
});

test('a keyboard Never choice preserves focus restored by the native site handler', async () => {
  const page = await pageWith(`<button id="resume-reading">Resume reading</button>${reminder()}`);
  try {
    await page.evaluate(() => {
      document.addEventListener('click', event => {
        if (event.target.matches('[data-native-dismiss]')) document.querySelector('#resume-reading').focus();
      });
    });
    await waitForNever(page);
    await page.locator(neverSelector).focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-bbc-no-login-notice]').waitFor();
    assert.equal(await page.locator('#resume-reading').evaluate(button => document.activeElement === button), true);
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
  } finally { await page.close(); }
});

test('a failed keyboard Never choice returns focus to the retry control', async () => {
  const page = await pageWith(reminder(), { failWrites: true });
  try {
    await waitForNever(page);
    await page.locator(neverSelector).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator(neverSelector).evaluate(button => document.activeElement === button), true);
    assert.equal(await page.locator('[data-bbc-no-login-error]').isVisible(), true);
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
  } finally { await page.close(); }
});

test('Undo reports a failed write without losing the saved choice and can be retried', async () => {
  const page = await pageWith(reminder());
  try {
    await waitForNever(page);
    await page.locator(neverSelector).click();
    await page.locator('[data-bbc-no-login-notice]').waitFor();
    await page.evaluate(() => { window.failWrites = true; });
    await page.locator('[data-bbc-no-login-undo]').click();
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
    assert.match(await page.locator('[data-bbc-no-login-notice]').innerText(), /could not|try again|unable/i);
    assert.equal(await page.locator('[data-bbc-no-login-undo]').isEnabled(), true);
    await page.evaluate(() => { window.failWrites = false; });
    await page.locator('[data-bbc-no-login-undo]').click();
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
  } finally { await page.close(); }
});

test('a stale failed Undo respects a newer reset from another extension view', async () => {
  const page = await pageWith(reminder());
  try {
    await waitForNever(page);
    await page.locator(neverSelector).click();
    await page.locator('[data-bbc-no-login-notice]').waitFor();
    await page.evaluate(() => {
      window.originalPreferenceWrite = chrome.storage.local.set;
      chrome.storage.local.set = (_values, callback) => {
        window.failPendingUndo = () => {
          chrome.runtime.lastError = { message: 'Test delayed Undo write failure' };
          callback();
          chrome.runtime.lastError = undefined;
        };
      };
    });
    await page.locator('[data-bbc-no-login-undo]').click();
    await page.evaluate(() => {
      window.originalPreferenceWrite({ neverAskToSignIn: false }, () => {});
      window.failPendingUndo();
    });
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
    assert.match(await page.locator('[data-bbc-no-login-notice]').innerText(), /reminders allowed again/i);
    assert.doesNotMatch(await page.locator('[data-bbc-no-login-notice]').innerText(), /could not undo/i);
  } finally { await page.close(); }
});

test('automatic reminder dismissal stays quiet without showing a saved-choice notice', async () => {
  const page = await pageWith(reminder(), { preference: true });
  try {
    await page.waitForFunction(() => window.nativeDismissals === 1);
    assert.equal(await page.locator('[data-bbc-no-login-notice]').count(), 0);
    assert.equal(await page.locator('#article').isVisible(), true);
  } finally { await page.close(); }
});

for (const [label, control] of [
  ['Not now link', '<a href="#" data-native-dismiss>Not now</a>'],
  ['No thanks input', '<input type="button" data-native-dismiss value="No thanks">'],
  ['Maybe later custom button', '<div role="button" tabindex="0" data-native-dismiss><span>Maybe later</span></div>'],
]) {
  test(`remembers the preference for a ${label}`, async () => {
    const page = await pageWith(reminder(control), { preference: true });
    try {
      await page.waitForFunction(() => window.nativeDismissals === 1);
      assert.equal(await page.locator('.reminder').count(), 0);
      assert.equal(await page.locator('#article').isVisible(), true);
    } finally { await page.close(); }
  });
}

test('does not confuse a cookie prompt with a login reminder because of global navigation', async () => {
  const page = await pageWith('<section role="dialog" id="cookies"><h2>Cookie preferences</h2><button>Maybe later</button></section>', { preference: true });
  try {
    // Give the observer and deferred initial storage read time to execute.
    await page.waitForTimeout(150);
    assert.equal(await page.locator(neverSelector).count(), 0);
    assert.equal(await page.locator('#cookies').isVisible(), true);
    assert.equal(await page.evaluate(() => window.nativeDismissals), 0);
  } finally { await page.close(); }
});

test('leaves a required login form and unrelated dismissal controls intact', async () => {
  const page = await pageWith('<section id="login"><h2>Sign in to watch</h2><form><label>Email<input type="email"></label><button>Continue</button></form></section><aside><button>Maybe later</button></aside>', { preference: true });
  try {
    await page.waitForTimeout(150);
    assert.equal(await page.locator(neverSelector).count(), 0);
    assert.equal(await page.locator('#login').isVisible(), true);
    assert.equal(await page.locator('#article').isVisible(), true);
    assert.equal(await page.locator('aside button').isVisible(), true);
  } finally { await page.close(); }
});

test('finds a lazily rendered reminder without duplicating the Never control', async () => {
  const page = await pageWith('');
  try {
    await page.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), reminder());
    await waitForNever(page);
    await page.evaluate(() => {
      const paragraph = document.querySelector('.reminder p');
      paragraph.textContent = 'Register or sign in for your personalised BBC.';
      document.body.append(document.createElement('div'));
    });
    await page.waitForTimeout(100);
    assert.equal(await page.locator(neverSelector).count(), 1);
  } finally { await page.close(); }
});

test('waits for the saved preference before automatically dismissing', async () => {
  const page = await pageWith(reminder(), { preference: true, storageDelay: 250 });
  try {
    assert.equal(await page.evaluate(() => window.nativeDismissals), 0);
    await page.waitForFunction(() => window.nativeDismissals === 1);
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
  } finally { await page.close(); }
});

test('responds to resetting the preference in another extension view', async () => {
  const page = await pageWith(reminder(), { preference: true });
  try {
    await page.waitForFunction(() => window.nativeDismissals === 1);
    await page.evaluate(() => chrome.storage.local.set({ neverAskToSignIn: false }));
    await page.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), reminder());
    await waitForNever(page);
    assert.equal(await page.evaluate(() => window.nativeDismissals), 1);
    assert.equal(await page.locator('.reminder').isVisible(), true);
  } finally { await page.close(); }
});

test('does not use a header sign-in link as context for an unrelated dialog', async () => {
  const page = await pageWith('<div id="app"><header><a href="https://account.bbc.com/signin">Sign in</a></header><section role="dialog" id="survey"><h2>Try our survey</h2><button>Maybe later</button></section></div>', { preference: true });
  try {
    await page.waitForTimeout(150);
    assert.equal(await page.locator(neverSelector).count(), 0);
    assert.equal(await page.locator('#survey').isVisible(), true);
    assert.equal(await page.evaluate(() => window.nativeDismissals), 0);
  } finally { await page.close(); }
});

test('ignores a CSS-hidden reminder until it becomes visible', async () => {
  const page = await pageWith(`<style>.hidden { display: none; }</style><div id="container" class="hidden">${reminder()}</div>`);
  try {
    await page.waitForTimeout(150);
    assert.equal(await page.locator(neverSelector).count(), 0);
    await page.locator('#container').evaluate(element => element.classList.remove('hidden'));
    await waitForNever(page);
    assert.equal(await page.locator(neverSelector).isVisible(), true);
  } finally { await page.close(); }
});

test('bounds retries when a native dismissal has no effect', async () => {
  const page = await pageWith(reminder('<button id="no-op">Maybe later</button>'), { preference: true });
  try {
    await page.locator('#no-op').evaluate(element => element.addEventListener('click', () => window.nativeDismissals++));
    await page.waitForFunction(() => window.nativeDismissals === 1);
    await page.evaluate(() => {
      document.body.append(document.createElement('div'));
      document.querySelector('.reminder p').textContent = 'Sign in to enjoy more.';
    });
    await page.waitForTimeout(1600);
    assert.ok((await page.evaluate(() => window.nativeDismissals)) <= 3);
    await page.evaluate(() => document.body.append(document.createElement('div')));
    await page.waitForTimeout(150);
    assert.ok((await page.evaluate(() => window.nativeDismissals)) <= 3);
    assert.equal(await page.locator('.reminder').isVisible(), true);
    assert.equal(await page.locator('#article').isVisible(), true);
  } finally { await page.close(); }
});

test('retries a reminder whose native handler is attached after initial rendering', async () => {
  const page = await pageWith(reminder('<button id="hydrating">Maybe later</button>'), { preference: true });
  try {
    await page.evaluate(() => {
      setTimeout(() => {
        document.querySelector('#hydrating').addEventListener('click', event => {
          window.nativeDismissals++;
          event.target.closest('.reminder').remove();
        });
      }, 150);
    });
    await page.waitForFunction(() => window.nativeDismissals === 1);
    assert.equal(await page.locator('.reminder').count(), 0);
    assert.equal(await page.locator('#article').isVisible(), true);
  } finally { await page.close(); }
});

test('a failed preference write leaves the reminder available and can be retried', async () => {
  const page = await pageWith(reminder(), { failWrites: true });
  try {
    await waitForNever(page);
    await page.locator(neverSelector).click();
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
    assert.equal(await page.evaluate(() => window.nativeDismissals), 0);
    assert.equal(await page.locator('.reminder').isVisible(), true);
    assert.equal(await page.locator(neverSelector).isEnabled(), true);
    assert.equal(await page.locator('[data-bbc-no-login-error]').isVisible(), true);
    assert.equal(await page.locator('[data-bbc-no-login-notice]').count(), 0);
    await page.evaluate(() => { window.failWrites = false; });
    await page.locator(neverSelector).click();
    await page.waitForFunction(() => window.nativeDismissals === 1);
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
  } finally { await page.close(); }
});

test('a late initial storage snapshot does not overwrite a newer reset', async () => {
  const page = await pageWith(reminder(), { preference: true, storageDelay: 250 });
  try {
    await page.evaluate(() => chrome.storage.local.set({ neverAskToSignIn: false }));
    await waitForNever(page);
    await page.waitForTimeout(300);
    assert.equal(await page.locator(neverSelector).isVisible(), true);
    assert.equal(await page.evaluate(() => window.nativeDismissals), 0);
    assert.equal(await page.evaluate(() => window.savedPreference()), false);
  } finally { await page.close(); }
});

test('finds sign-in context in a dialog header outside the action form', async () => {
  const page = await pageWith('<section class="reminder" role="dialog"><header><h2>Sign in to the BBC</h2></header><form><button type="button" data-native-dismiss>Maybe later</button></form></section>');
  try {
    await waitForNever(page);
    await page.locator(neverSelector).click();
    await page.waitForFunction(() => window.nativeDismissals === 1);
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
  } finally { await page.close(); }
});

test('recognises reminder text even when HTML elements have no separating whitespace', async () => {
  const page = await pageWith('<section class="reminder"><h2>Sign in</h2><button data-native-dismiss>Maybe later</button></section>');
  try {
    await waitForNever(page);
    await page.locator(neverSelector).click();
    await page.waitForFunction(() => window.nativeDismissals === 1);
    assert.equal(await page.evaluate(() => window.savedPreference()), true);
  } finally { await page.close(); }
});
