# Product and privacy site

This directory contains the static Deviation Lens product page and privacy policy. GitHub Pages deploys it directly from the repository without a build step. The product page links to the published Chrome Web Store listing and includes illustrative product previews in `assets/product-shots/`.

- Entry page: [index.html](index.html)
- Privacy policy: [privacy.html](privacy.html)
- Extension source: [../extension/](../extension/)
- Deploy workflow: [../../.github/workflows/pages.yml](../../.github/workflows/pages.yml)

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** in the repository settings. The workflow packages the extension and places its versioned ZIP in downloads/ before deploying this directory.

Before deployment, verify that the privacy policy describes the current extension behavior. The published Chrome Web Store URL is configured in `app.js`. Run `pnpm pack:extension` from the repository root to prepare the development build linked from the install section.
