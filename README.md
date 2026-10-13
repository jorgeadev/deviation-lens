# Deviation Lens

Deviation Lens is the Chrome extension in [`apps/extension/`](apps/extension/) for finding image variants on the page you are viewing, comparing their available quality, and saving the images you choose.

**Version:** `0.1.0-alpha.1` · **Status:** Alpha · **Minimum Chrome version:** 141

> The extension is in active development. Features and behavior may change before a stable release.

## Features

- Scan DeviantArt pages for supported images and available image variants.
- Review image dimensions, estimated file sizes, and quality details in the extension side panel.
- Exclude images from DeviantArt Explore sections by default, or opt in to include them. The preference is saved.
- Optionally scan other websites after enabling **Find images on any page** and granting Chrome access to that site.
- Select images to download, download all results, or copy image URLs.
- Rescan the current page and follow navigation in the active tab.

Results depend on the page and its image host. Deviation Lens does not control which image variants a source makes available.

## Install

Install the published [Chrome Web Store release](https://chromewebstore.google.com/detail/deviation-lens/gkcejfnaghdbhhggjndkhpnfajnfpigc), or try the current alpha from source:

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Choose **Load unpacked** and select the `apps/extension` folder.

The [extension manifest](apps/extension/manifest.json) requires Chrome 141 or newer.

## Permissions and privacy

The [extension manifest](apps/extension/manifest.json) lists the permissions used for the current features:

| Permission | Purpose |
| --- | --- |
| `activeTab` | Access the page you choose to scan. |
| `scripting` | Run the page scanner after you use the extension. |
| `sidePanel` | Show scan results beside the page. |
| `downloads` | Save images you choose through Chrome. |
| `storage` | Save extension preferences. |
| `tabs` | Identify the active tab and update results when its page changes. |
| DeviantArt and WixMP host access | Scan supported DeviantArt pages and access related image hosts. |
| Optional access to other sites | Scan a site only after you enable **Find images on any page** and grant Chrome access. |

The extension processes the page details needed to find images, such as image URLs and dimensions, in your browser. Scan results are not sent to a developer-operated service. Preferences are stored locally. When you download an image or check its file size, Chrome may request it from the image's source host, which has its own privacy practices.

Read the [privacy policy](apps/web/privacy.html) for details. Store publishers should review Google's current [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/) and [permission guidance](https://developer.chrome.com/docs/webstore/program-policies/permissions/) before submission. Store disclosures must match the behavior of the submitted extension.

## Development

Install the repository's development dependencies from the root:

```sh
corepack pnpm install
```

Common commands:

| Command | Purpose |
| --- | --- |
| `pnpm check` | Check extension JavaScript syntax. |
| `pnpm check:biome` | Run Biome formatting and lint checks. |
| `pnpm format` | Format supported files with Biome. |
| `pnpm lint` | Run Biome lint rules. |
| `pnpm test:smoke` | Run the save-folder support smoke check. |
| `pnpm test:e2e` | Run browser end-to-end checks. |
| `pnpm test:e2e:profile` | Run profile-page checks. |
| `pnpm test:visual` | Run visual checks. |
| `pnpm test:sidebar` | Run side-panel checks. |

The repository recommends the Biome VS Code extension. Formatting and Biome fixes run on save when that extension is installed. Browser test binaries and generated output are local files under `packages/tools/browsers/` and `packages/tools/out/`.

## Package a release

Run the packer from the repository root:

```sh
pnpm pack:extension
```

It creates versioned ZIP archives in `dist/extension/` and `apps/web/downloads/`. The packer reads the app version and checks that the extension package and manifest match it. `pnpm publish:extension` runs the same packaging step; it prepares the archive for manual submission and does not upload it to the Chrome Web Store.

The Chrome manifest uses a numeric version, while `version_name` displays the alpha label. Increase the numeric manifest version for each future extension release. Store listing copy and graphics are in [`apps/extension/store/`](apps/extension/store/). Those materials still need final screenshots, publisher contact details, and review against the submitted build.

## Contributing

Contributions are welcome. Read the [contribution guide](CONTRIBUTING.md) before opening a pull request. Please also follow the [code of conduct](CODE_OF_CONDUCT.md).

- [Report a bug or request a feature](https://github.com/jorgeadev/deviation-lens/issues)
- [Report a security issue](SECURITY.md)
- [Get support](SUPPORT.md)

Only submit artwork, screenshots, icons, and other assets that you created or have permission to redistribute. Do not include artwork downloaded from DeviantArt without the creator's permission.

## License and affiliation

Original source code and documentation are licensed under the [MIT License](LICENSE). Third-party materials, artwork, and trademarks may have separate rights. DeviantArt and related marks belong to their respective owners. Deviation Lens is an independent project and is not affiliated with or endorsed by DeviantArt.
