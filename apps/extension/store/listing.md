# Chrome Web Store listing draft

## Name

Deviation Lens

## Short description

Find image variants on DeviantArt, compare available quality, and save the files you choose.

## Detailed description

Deviation Lens helps you find the image files available on a DeviantArt page. Scan the current page to see detected image variants, dimensions, and estimated file sizes. Choose the best available version, download selected images, or copy their URLs.

Explore sections are excluded by default and can be included with a saved setting. An optional “Find images on any page” setting enables scans beyond DeviantArt and its image host; Chrome asks for site access when needed. The extension processes page content in your browser and does not send scan results to a developer-operated service.

The quality available depends on the source page and image host. DeviantArt and its image hosts are third-party services and are not affiliated with this extension.

## Suggested category

Productivity

## Privacy policy URL

`https://jorgeadev.github.io/deviation-lens/privacy.html`

Confirm the page is publicly accessible after the GitHub Pages deployment before submitting.

## Support URL

https://github.com/jorgeadev/deviation-lens/issues

## Permission justifications

- **activeTab**: read the active tab URL and connect the panel to the page the user chose to scan.
- **scripting**: load the scanner into the active tab after the user opens the extension; extra sites require an optional origin grant.
- **downloads**: save user-selected image files through Chrome.
- **storage**: remember image filtering and download preferences.
- **sidePanel**: display the extension beside the current page.
- **tabs**: follow the active tab and its navigation so results stay associated with the page the user chose to scan.
- **Optional site access**: scan an additional site only after the user enables “Find images on any page” and grants Chrome's site permission.
- **DeviantArt and WixMP host access**: scan supported DeviantArt pages and request image metadata from the related image host.

## Data use notes for the dashboard

The extension reads page content only to identify supported image URLs and dimensions after the user opens or rescans it. Preferences and selected folder access are stored locally. Downloads are requested from Chrome or fetched from the selected image source. No analytics, account system, or developer server is included in this package. Select the dashboard's data-use categories and certify these statements against the final code and policies before submission.
