# Deviation Lens publishing kit

This folder contains the static product page and Chrome Web Store listing files. The site is buildless: GitHub Pages deploys the tracked `web/` source from the repository root using the workflow in `.github/workflows/pages.yml`. In GitHub, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

## Chrome Web Store

Upload `packages/deviation-lens-0.1.0-alpha.1.zip` to the Chrome Web Store Developer Dashboard. Upload the icon, small promo image, screenshots, and optional marquee from `chrome-web-store/assets/`. The listing text and permission notes are in `chrome-web-store/listing.md`.

The static page source is in `web/`; GitHub Pages deploys that folder directly. The ignored ZIP archive can be regenerated for manual hosting. The separate `packages/deviation-lens-store-assets.zip` is a convenience archive of the graphics and their README.

The listing screenshots are based on real UI captures already in this repository. The captures predate the Deviation Lens name and the newer Explore/any-page options, so replace them with fresh captures of the release build before submission. The page preview is illustrative and is not a store screenshot.

## Before publishing

- Replace the placeholder contact address in `web/privacy.html` and `chrome-web-store/listing.md`.
- Publish the privacy page and put its public URL in the Developer Dashboard.
- Add the final Chrome Web Store listing URL to `web/app.js` (`STORE_URL`).
- Refresh the store screenshots from the release build, including the persistent Explore and any-page options.
- Review the permission justifications and data-use answers against the exact extension build in the dashboard.
- Keep the package release label at `0.1.0-alpha.1`. Chrome requires a numeric manifest.json version; this release uses `0.1.0` and displays `0.1.0-alpha.1` through version_name. Increase the numeric manifest version for each future extension update, then rebuild the archive.

The source and Pages workflow are prepared locally; the site is not deployed until this branch reaches `main` and GitHub Pages is set to use GitHub Actions.
