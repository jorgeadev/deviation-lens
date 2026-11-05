# Chrome Web Store publishing materials

This directory contains Chrome Web Store listing copy and graphics for Deviation Lens. The live listing is [published here](https://chromewebstore.google.com/detail/deviation-lens/gkcejfnaghdbhhggjndkhpnfajnfpigc); `listing.md` is the proposed copy for a future metadata update.

- Listing copy and permission notes: [listing.md](listing.md)
- Store graphics and their specifications: [assets/README.md](assets/README.md)

## Release checklist

Run these from the repository root.

### Before merging

1. `pnpm version:set <version>`, and add that version to [the changelog](../../web/changelog.html) with its release month. Update the "What's new" heading in [index.html](../../web/index.html).
   If the UI changed, run `pnpm shots` after setting the version. It creates `apps/web/assets/<version>/`, so past images stay untouched. Then point the image paths in `index.html` at the new folder. If the UI did not change, keep using the existing folder.
2. `pnpm check`, `pnpm test:unit`, `pnpm test:smoke`, and `pnpm pack:extension`.
3. Extract `dist/extension/deviation-lens-<version>.zip` to a temporary folder, and run `pnpm test:e2e:zip` with `DEVIATION_LENS_EXT` set to that folder. This tests exactly what will be uploaded.
4. Load the same folder with **Load unpacked** and try the steps Chrome will not let a test operate:
   - Choose a real folder from the first-download dialog, in the real side panel.
   - Restart Chrome with a custom folder set, then download. An access prompt should appear rather than an error.
   - In "Ask every time", confirm one Save As dialog for a single image and one for a ZIP.
   - On a site outside DeviantArt, enable "Find images on any page", grant access, and download. Confirm "Save failed as separate files" recovers any image that could not join the ZIP.
   - Update from the previous published version, and confirm that no permission prompt appears and settings survive.

### Publish the site

5. Merge the release into `main`. [pages.yml](../../../.github/workflows/pages.yml) packages the extension and deploys `apps/web`. GitHub Pages must use **GitHub Actions** as its source (**Settings → Pages**).
6. Confirm that these load: the [home page](https://jorgeadev.github.io/deviation-lens/), the [privacy policy](https://jorgeadev.github.io/deviation-lens/privacy.html), and the [changelog](https://jorgeadev.github.io/deviation-lens/changelog.html). The privacy policy must be live before the store review.

### Publish the extension

7. In the Chrome Web Store Developer Dashboard, upload `dist/extension/deviation-lens-<version>.zip` as a new package for the existing item.
8. Update the listing from [listing.md](listing.md), and replace the screenshots with the JPEG files in `apps/web/assets/<version>/store/`.
9. On the **Privacy** tab, update the permission justifications and data disclosures from [listing.md](listing.md). Remove any justification for a permission the manifest no longer requests. Check them against the uploaded package and Google's current policies.
10. Submit for review. After approval, tag the published commit: `git tag v<version>` and `git push origin v<version>`.

Keep `STORE_URL` in [apps/web/app.js](../../web/app.js) aligned if the listing URL changes.

Versions are plain major.minor.patch numbers. Each store upload needs a higher version than the last.
