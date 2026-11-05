# Proposed Chrome Web Store listing update

## Name

Deviation Lens

## Short description

DeviantArt image downloader: find available variants, compare quality, and save the files you choose.

## Detailed description

Deviation Lens is an independent DeviantArt image downloader. Scan the current page to find supported image variants, compare dimensions, formats, and estimated file sizes, then download the best available version or the images you select. Saving several images creates one ZIP, with a manifest crediting each artist and source. You can also set a minimum image size, choose how files are named, optionally skip artwork you already saved, and copy image URLs.

Explore sections are excluded by default and can be included with a saved setting. An optional “Find images on any page” setting enables scans on other websites after you grant Chrome access. The extension processes page content in your browser and does not send scan results to a developer-operated service.

Deviation Lens is not affiliated with or endorsed by DeviantArt. It only finds image files made available by the page and its image host. Do not use it to bypass access restrictions; download and use artwork only when you have permission.

## Suggested category

Productivity

## Privacy policy URL

`https://jorgeadev.github.io/deviation-lens/privacy.html`

Confirm the page is publicly accessible after the GitHub Pages deployment before submitting.

## Support URL

https://github.com/jorgeadev/deviation-lens/issues

## Privacy practices form

### Single purpose description

Find artwork images on the current page, compare their available dimensions and file sizes, and download the images the user selects. DeviantArt is supported by default. Scanning other sites requires the user to enable the option and grant access to that site.

### Permission justifications

- **downloads**: Saves image files after the user chooses a download action, using Chrome's download manager.
- **offscreen**: Builds a ZIP file in the browser from the images the user chose to download. Service workers cannot create the file URL that the downloads API needs, and an offscreen document also lets the ZIP finish if the side panel is closed. It closes when no longer needed.
- **Host permissions**: HTTPS access to DeviantArt pages lets the extension scan DeviantArt artwork and gallery pages. HTTPS access to WixMP image hosts lets it inspect and download the images served for that artwork. Access to other sites is optional and requested only after the user enables “Find images on any page” and grants Chrome permission for the site being scanned.
- **scripting**: Injects the packaged `content.js` scanner into a DeviantArt tab that was opened before the extension was installed or updated, and into other sites only after the user's optional site grant.
- **sidePanel**: Opens the image results interface beside the current browser page.
- **storage**: Stores the user's scan and download preferences, including Explore filtering, image options, minimum size, ZIP and file name settings, and download mode.
- **tabs**: Reads the active tab URL, follows active-tab changes and navigation while the extension is open, and opens image links and the settings page.

### Remote code declaration

Select **No, I am not using remote code**. The extension executes JavaScript and CSS files packaged with the extension. The scanner may read page script text to find image URLs, but it does not evaluate or execute code from the page or a remote server.

### Data use disclosure and certification

Disclose the page content and active-tab URL that the extension processes. Select the matching dashboard categories for website content and browsing activity. Local processing still requires disclosure. The scanner reads the current page URL, headings, image URLs, dimensions, and related page details to create the results requested through the extension interface. These results are processed locally and are not sent to a developer-operated service. Preferences are stored in Chrome extension storage. A custom folder handle is stored in the browser's local database. If the user turns on "Remember saved images and skip them," which is off by default, the addresses of saved images and the time they were saved are kept in a separate local database, which the user can clear. They are not sent to a developer-operated service.

When the extension checks an image's file size or downloads an image, the browser sends a request to that image's source host. Some source requests include the browser's existing credentials so the source can provide resources available to the signed-in user. If the dashboard has an authentication-information category, disclose this use. The extension does not read or store cookie values, and it does not send credentials to a developer-operated service. If the dashboard has a separate category for locally stored folder access or other user data, disclose the custom folder handle there.

Certify the dashboard statements only after confirming they match the code and privacy policy. The extension has no analytics or developer-operated data service, and the project team does not read scan results. Chrome's dashboard requires the publisher to complete the data-use certification before publication.
