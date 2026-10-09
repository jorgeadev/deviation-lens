# Deviation Lens

Deviation Lens is a browser extension for finding artwork images on DeviantArt and downloading them at the best quality available. The repository also contains the static product and privacy pages.

## Get started

Install development dependencies from the repository root with corepack pnpm install. In a Chromium browser, enable Developer mode and load packages/extension as an unpacked extension.

The root package provides these commands:

- corepack pnpm check checks the extension JavaScript files.
- corepack pnpm test:smoke runs the browser check for save-folder support behavior.
- corepack pnpm test:e2e runs the browser end-to-end checks.
- corepack pnpm test:e2e:profile runs the profile checks.
- corepack pnpm test:visual runs the visual checks.
- corepack pnpm test:sidebar runs the sidebar checks.

Browser binaries and test output are local generated files. The repository ignores tools/browsers/ and tools/out/. Keep the scripts and package metadata under tools/ versioned.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Community policies are in the [Code of conduct](CODE_OF_CONDUCT.md), [Security policy](SECURITY.md), and [Support guide](SUPPORT.md).

## Project pages

- Product and privacy pages: [publish/web/](publish/web/).
- Chrome Web Store listing materials: [publish/chrome-web-store/](publish/chrome-web-store/).
- GitHub Pages deployment workflow: [.github/workflows/pages.yml](.github/workflows/pages.yml).

## License

Original source code and documentation are licensed under the MIT License. Artwork, third-party materials, trademarks, and brand assets may have separate rights. See [LICENSE](LICENSE).
