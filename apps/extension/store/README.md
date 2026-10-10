# Chrome Web Store publishing materials

This directory contains draft listing copy and graphics for Deviation Lens. The Chrome Web Store listing has not been published.

- Listing copy and permission notes: [listing.md](listing.md)
- Store graphics and their specifications: [assets/README.md](assets/README.md)

## Prepare a submission

1. Run pnpm pack:extension from the repository root. Upload the generated archive in dist/extension/ to the Chrome Web Store Developer Dashboard.
2. Deploy the privacy policy with GitHub Pages and confirm its URL is publicly accessible. The draft listing uses https://jorgeadev.github.io/deviation-lens/privacy.html.
3. Use the support URL in [listing.md](listing.md), and provide the verified publisher contact details in the Developer Dashboard.
4. Set STORE_URL in [apps/web/app.js](../../web/app.js) after Google publishes the listing.
5. Replace the screenshots with accurate captures of the final release. The current screenshots predate the Deviation Lens name and the Explore and any-page settings; do not upload them as final listing screenshots.
6. Complete the dashboard privacy declarations and review permission justifications against the exact extension package and Google's current policies.

The Chrome manifest uses a numeric version, while version_name displays the alpha label. Increase the numeric manifest version for each future extension release. The packer checks that the app, extension package, and manifest versions agree before creating the archive.

The Pages workflow deploys apps/web from main. Configure GitHub Pages to use GitHub Actions before merging a site release.
