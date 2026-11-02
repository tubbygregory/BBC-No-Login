# BBC No Login

Add a **Never** option to optional BBC sign-in reminders. Choose it once, and matching reminders are dismissed automatically across BBC websites in this browser profile.

Works with **Chrome, Microsoft Edge, Brave, and other Chromium-based browsers** on desktop.

## Install from GitHub

**[Download BBC No Login (ZIP)](https://github.com/tubbygregory/BBC-No-Login/archive/refs/heads/main.zip)**

1. Download the ZIP above and **extract it**. You can also choose **Code → Download ZIP** on this page.
2. Move the extracted `BBC-No-Login-main` folder somewhere you will keep it. The browser loads the extension from this folder, so don't delete it after installation.
3. Open your browser's extensions page:

   | Browser | Enter this in the address bar |
   | --- | --- |
   | Chrome | `chrome://extensions` |
   | Microsoft Edge | `edge://extensions` |
   | Brave | `brave://extensions` |

4. Turn on **Developer mode**. In Edge, this is in the left-hand sidebar.
5. Click **Load unpacked** and select the extracted folder **containing `manifest.json`**. Select the folder, not the ZIP file. If there is another folder inside the one you extracted, open it until you see `manifest.json`.
6. Reload your BBC tabs.

You don't need to install Node.js, run commands, or build anything. This extension is distributed through GitHub, not a browser store. Chrome and Edge require **Developer mode** to install it this way; opening the ZIP alone will not install it. Browsers managed by a workplace or school may block unpacked extensions.

## Choose Never

When a supported BBC sign-in reminder appears, look for **Never** beside **Maybe later**, **Not now**, or **No thanks**.

Click **Never** to save your choice. The extension then uses the BBC's own dismiss option. Future matching reminders are dismissed automatically, including ones that appear after the page loads.

Your choice applies to `bbc.co.uk`, `bbc.com`, and their subdomains in the same browser profile. It stays saved when you close the browser. It does not sync to other profiles or devices.

## Change your mind

Open your browser's extensions menu (usually the puzzle-piece icon) and select **BBC No Login**. You can pin it to your toolbar for easier access.

- Turn on **Never ask me to sign in** to enable the preference without waiting for a reminder.
- Click **Allow reminders again** to reset it. This allows future reminders; it does not reopen one already dismissed.

## What it does — and its limits

- Handles optional, English-language sign-in reminders with a recognised dismiss option. BBC page changes or different wording may need an extension update.
- Leaves ordinary sign-in links, cookie consent prompts, and required account screens alone.
- Does not bypass login requirements, subscriptions, or geographical restrictions. **iPlayer still requires an account.**
- A reminder may briefly appear before it is dismissed. The extension relies on the BBC's dismiss option working.

## Privacy

Your preference is saved locally in your browser. The extension has no analytics, tracking, or external server. It only runs on BBC pages and matching BBC frames. Using a BBC dismiss button may trigger the site's normal requests or cookies.

See the [privacy policy](PRIVACY.md) for details. The permission to read and change BBC pages is used to find reminders and add **Never**; the storage permission remembers your choice.

## Update or remove

To update, download the ZIP again and replace the files **in the same installation folder**. Go to your browser's extensions page, click **Reload** for BBC No Login, and reload your BBC tabs. Keeping the same folder preserves the extension's identity and saved preference.

To uninstall, choose **Remove** on the extensions page. Removing the extension also removes its saved preference.

## Something not working?

Check that the extension is enabled, then reload the BBC tab. If a reminder still has no **Never** option, its wording or layout may not be supported yet.

[Report a problem](https://github.com/tubbygregory/BBC-No-Login/issues) with your browser version and the page URL. If you include a screenshot, remove any personal information first.

This is an independent extension, not affiliated with or endorsed by the BBC.

---

For contributors: [development, tests, and release packaging](docs/DEVELOPMENT.md).
