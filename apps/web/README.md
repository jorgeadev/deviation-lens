# Product and privacy site

This directory contains the static Deviation Lens product page and privacy policy. GitHub Pages deploys it directly from the repository without a build step.

- Entry page: [index.html](index.html)
- Privacy policy: [privacy.html](privacy.html)
- Extension source: [../extension/](../extension/)
- Deploy workflow: [../../.github/workflows/pages.yml](../../.github/workflows/pages.yml)

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** in the repository settings. The workflow packages the extension and places its versioned ZIP in downloads/ before deploying this directory.

Before deployment, verify that the privacy policy describes the current extension behavior. Set the Chrome Web Store URL in app.js after the listing is published. Run pnpm pack:extension from the repository root to prepare the download for a local preview.
