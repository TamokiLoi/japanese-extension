# Privacy Policy — Nihongo Nin

Last updated: 2026-09-20

Nihongo Nin is a Japanese-learning web application with a legacy browser extension. This policy explains what data it handles.

## Data collection

Nihongo Nin does **not** sell user data, use analytics, or operate a backend server. Study data remains local unless the user explicitly chooses the optional Google Drive backup feature.

## Local storage

The application stores study data and settings on the user's own device using `localStorage` on the web or `chrome.storage.local` in the extension. This includes:

- Study progress, answers, flags, streaks, goals, and exam history
- Viewer filters, current positions, and resumable practice sessions
- Reminder and application settings

This local data is not accessible to the developer.

## Optional Google Drive backup

When the user clicks **Back up to Drive**, Nihongo Nin requests authorization through Google Identity Services and uploads a JSON copy of the application's local data to the user's private Google Drive application-data folder. When the user clicks **Restore from Drive**, the application downloads that JSON file and restores its recognized data fields locally.

- This feature is optional and only runs after an explicit user action.
- Nihongo Nin requests the narrow `drive.appdata` scope and cannot view or modify the user's other Drive files.
- The backup is stored in a hidden application-data folder associated with the selected Google Account.
- OAuth access tokens are held in browser memory only and are not saved in local storage.
- Data is transferred directly between the user's browser and Google; it does not pass through a Nihongo Nin server.

Users can revoke access at any time from their Google Account permissions. They can continue to use manual JSON export/import without connecting a Google Account.

## Permissions

- **storage** — to save the settings above locally.
- **alarms** — to schedule periodic review-reminder notifications.
- **notifications** — to show those reminders as system notifications.
- **tabs** — to open long-running practice screens in a stable browser tab.

None of these permissions are used to access, read, or transmit data from the websites you visit.

## Bundled content

The extension bundles a static Kanji dataset (readings, meanings, radicals) built from open sources (KANJIDIC2, Unihan, CC-CEDICT) plus supplementary Vietnamese meanings/mnemonics. This dataset ships with the extension package and is not fetched from any server at runtime.

## Contact

For questions about this policy, contact: loinguyenlamthanh@gmail.com
