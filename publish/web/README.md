# Deviation Lens product page

Static, dependency-free website. GitHub Actions deploys this folder to GitHub Pages using `.github/workflows/pages.yml`; `index.html` is the entry point and `privacy.html` is the public privacy policy.

Before deployment:

1. Replace the contact placeholder in `privacy.html` with a monitored email address.
2. Set `STORE_URL` in `app.js` to the published Chrome Web Store item URL.
3. Replace the illustrative product preview with a current extension capture if you want to use a screenshot on the page.

No build step is required. In the repository settings, select **Settings → Pages → Build and deployment → Source → GitHub Actions**. The workflow deploys changes from `main` when files under `publish/web/` change. The package has no analytics, fonts, or runtime dependencies hosted elsewhere.
