# Development

The extension is plain Manifest V3 JavaScript and CSS. Work in the existing checkout; no bundler, server, or separate Git worktree is needed. Edit the files, reload the unpacked extension on the browser's extensions page, then reload the BBC tab.

- `manifest.json` declares the extension and BBC site access.
- `content.js` and `content.css` add the option and dismiss matching reminders.
- `popup.html`, `popup.js`, and `popup.css` provide the preference controls.

## Browser checks

Use Node.js 22 or later and Chromium:

```sh
npm ci
npm test
```

The tests use `/usr/bin/chromium` by default; set `CHROMIUM_PATH` to use another executable. They exercise representative reminder fixtures and the popup in a real browser with a simulated storage API. A separate test loads the actual unpacked extension to check cross-domain preferences and popup reset; it reports a skip only if browser administrator policy explicitly prohibits unpacked extensions, as it does in the cloud development environment.

Keep skipped checks distinct from passes when reporting results. A browser-policy skip does not validate unpacked installation, and fixture checks do not establish compatibility with every live BBC prompt.

For a manual check, load the unpacked extension, visit a BBC page showing an optional sign-in reminder, choose **Never**, then verify a later reminder is dismissed and the preference can be reset from the popup. Check both `bbc.co.uk` and `bbc.com`, with an already-open tab as well as a newly loaded page.

## Build a release ZIP

Use Python 3.9 or later; the script needs only its standard library:

```sh
python3 scripts/package.py
```

This creates `dist/BBC-No-Login-<version>.zip`, with `manifest.json` and the standalone `START-HERE.html` installation guide at the ZIP root. It includes the runtime scripts, CSS, popup resources, guide resources, icons, and privacy document. It also writes `dist/SHA256SUMS.txt` for the release download. It excludes tests, development dependencies, and Git metadata. The script checks local resource references, rejects missing or escaping paths, verifies ZIP integrity, and uses fixed archive metadata so unchanged inputs produce the same ZIP bytes.

For GitHub's **Code → Download ZIP** source archive, users load the extracted repository folder directly. No build command or Node installation is needed to use the extension.

## Publish a GitHub release

1. Update `version` in `manifest.json` for a new release, and run the browser checks and packaging command.
2. Push the reviewed source changes to the repository.
3. Create and push a matching tag, for example:

   ```sh
   git tag v1.1.0
   git push origin v1.1.0
   ```

The **Package extension release** GitHub Actions workflow validates the tag against the manifest version, creates the runtime ZIP, uploads it as a workflow artifact, and creates a GitHub Release with installation instructions. Repository Actions must be enabled and the workflow must be allowed to write repository contents. It does not submit anything to a browser store.

The workflow can also be started manually with an existing matching version tag to retry a failed release. It intentionally fails rather than replacing assets on an already-created release. Resolve an incomplete release deliberately before retrying; do not silently overwrite a ZIP that users may have downloaded.

GitHub releases and source archives still install through **Developer mode → Load unpacked**. Chrome, Edge, and Brave do not offer one-click installation or automatic extension updates from an ordinary GitHub ZIP.

Keep user instructions in [the installation guide](INSTALL.md). Verify that the published release asset downloads successfully before describing a release as available to users.
