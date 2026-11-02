# BBC No Login privacy policy

BBC No Login remembers whether you want optional BBC sign-in reminders dismissed. This policy describes version 1.1.0.

## Data stored

The extension stores one preference, `neverAskToSignIn`, in the browser's local extension storage. It is a true/false value. It stays in that browser profile and is not synced by the extension to other profiles or devices.

You can change the preference using the extension popup. Uninstalling the extension removes its local extension storage.

## Page access

The extension runs only on `bbc.co.uk`, `bbc.com`, and their subdomains, including matching frames. It temporarily inspects page text and controls to identify optional English-language sign-in reminders. Page content, browsing history, account details, and form entries are not recorded or sent elsewhere by the extension.

When you choose **Never**, or a matching reminder appears after that choice, the extension activates the BBC's existing defer control. The BBC website may make its normal requests or set cookies in response to that action. Those website activities are governed by the BBC's own policies.

## Data transmission and third parties

The extension makes no network requests of its own. It includes no analytics, telemetry, advertising, external scripts, or tracking services. It does not sell or share user data. It does not request or store BBC login credentials.

## Permissions

- **Storage:** saves the local preference.
- **Access to BBC pages:** detects optional reminders, adds the **Never** control, and activates the existing defer control when enabled.

The extension is an independent project and is not affiliated with or endorsed by the BBC. It does not bypass account requirements or access restrictions.

## Changes

If future versions change how data is handled, this policy must be updated to describe those changes.
