# Install BBC No Login

Get **Never** alongside optional BBC sign-in reminders, with a choice that stays saved in your browser.

BBC No Login works with desktop Chrome, Microsoft Edge, Brave, and other Chromium-based browsers. Installation uses your browser's **Load unpacked** option. You don't need to run commands or install any development tools.

## 1. Download and extract

**[Get the latest release](https://github.com/tubbygregory/BBC-No-Login/releases/latest)**

Under **Assets**, download the file named `BBC-No-Login-<version>.zip`. Extract it into a permanent folder, such as `Documents/BBC-No-Login`.

Keep that folder after installation: the browser loads the extension from it. A folder with a stable name also makes future updates easier.

Open **START-HERE.html** in the extracted folder for a guided setup. You can select your browser and copy its extensions-page address. The steps below are the same guide in text form.

Inside the folder, you should see these files:

```text
BBC-No-Login/
├── manifest.json
├── content.js
├── popup.html
└── icons/
```

There will be other extension files alongside them. The important part is finding `manifest.json` directly inside the folder you select.

If a release is not available, [download the source ZIP](https://github.com/tubbygregory/BBC-No-Login/archive/refs/heads/main.zip) instead. Extract it and use the `BBC-No-Login-main` folder containing `manifest.json`. No build step is needed.

## 2. Add it to your browser

Enter the address for your browser in its address bar:

| Browser | Extensions page | Developer mode |
| --- | --- | --- |
| Google Chrome | `chrome://extensions` | Top-right corner |
| Microsoft Edge | `edge://extensions` | Left-hand sidebar |
| Brave | `brave://extensions` | Top-right corner |

1. Turn on **Developer mode**.
2. Choose **Load unpacked**.
3. Select the extracted folder containing `manifest.json`. Select the folder, not the ZIP.
4. Check that **BBC No Login** appears and is enabled.
5. Reload any BBC tabs that were already open.

You only need to do this once for each browser profile you use. Chrome and Edge do not install an extension directly when you open a GitHub ZIP. A workplace or school may disable Developer mode or block unpacked extensions.

## 3. Make your choice

When a supported reminder appears on a BBC page, choose **Never** beside **Maybe later**, **Not now**, or **No thanks**. Your choice is saved, the reminder is dismissed, and future matching reminders are dismissed automatically.

A small confirmation offers **Undo** if you change your mind immediately. You can also reset your choice from the popup at any time.

You can also enable it immediately:

1. Open your browser's extensions menu, usually the puzzle-piece icon.
2. Select **BBC No Login**.
3. Turn on **Never ask me to sign in**.

Pin BBC No Login to the toolbar if you would like easier access. In Edge, the corresponding option may be labelled **Show in toolbar**.

Your choice covers `bbc.co.uk`, `bbc.com`, and their subdomains in the same browser profile. It stays saved after you close the browser and does not sync to other profiles or devices.

## Change your mind

Open BBC No Login from your toolbar or extensions menu and choose **Allow reminders again**, or turn off **Never ask me to sign in**.

This allows future reminders. It does not reopen a reminder you have already dismissed, and it does not sign you in or out of the BBC.

## Keep it up to date

GitHub installations do not update automatically.

1. Download and extract the latest release.
2. Replace the extension files **inside your existing installation folder**. Keep the folder's name and location the same.
3. Open your browser's extensions page and click **Reload** for BBC No Login.
4. Reload your BBC tabs.

Keeping the same installation folder preserves the extension's identity and saved choice. Loading a different folder may create a separate installation.

## Remove the extension

Open your browser's extensions page and choose **Remove** for BBC No Login. This also removes its saved preference. You can then delete the installation folder.

## Need a hand?

| What you see | What to try |
| --- | --- |
| “Manifest file is missing or unreadable” | Extract the ZIP first. If the extracted folder contains another folder, open it until you see `manifest.json`, then load that folder. |
| No **Load unpacked** button | Turn on **Developer mode**. If the browser is managed and that option is unavailable, your administrator controls extension installation. |
| The switch is temporarily greyed out | Wait for the saved preference to load or finish saving. If an error appears, use the retry option or reopen the popup. If it persists, reload the extension from the extensions page. |
| A BBC reminder has no **Never** option | Check that the extension is enabled and reload the BBC tab. Detection supports English-language reminders with a recognised dismiss option; a changed layout or different wording may need an extension update. |
| A page still requires sign-in | BBC No Login handles optional reminders. It does not bypass services that require an account, including iPlayer. |
| It works in one profile but not another | Install and set your choice separately in each browser profile. Your choice does not sync. |
| It does not run in a private window | Browsers disable extensions in Incognito or InPrivate by default. You can choose whether to allow it in the extension's details on the extensions page. |

If you still need help, [report a problem](https://github.com/tubbygregory/BBC-No-Login/issues). Include your browser version and the affected page URL. Remove personal information from any screenshot before sharing it.

BBC No Login is independent and is not affiliated with or endorsed by the BBC. Read the [privacy policy](../PRIVACY.md) for how your local preference and BBC page access are used.
