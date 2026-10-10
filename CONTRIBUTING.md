# Contributing to Deviation Lens

Contributions are welcome through GitHub issues and pull requests. Open an issue first for a substantial feature or behavior change so maintainers can discuss its fit and scope.

## Development setup

1. Install the pinned package manager with Corepack if needed.
2. Run corepack pnpm install from the repository root.
3. Load apps/extension as an unpacked extension in a Chromium browser.
4. Run the relevant checks listed in the root package.json before opening a pull request.

Browser-driven checks may require local browser files under packages/tools/browsers/. Generated browser files and output are not part of the source contribution.

## Branches and pull requests

- Create focused branches from develop, using names such as feature/short-description, fix/short-description, or docs/short-description.
- Open feature and fix pull requests against develop. Release pull requests go from develop to main.
- Keep changes scoped to one issue or purpose. Use a clear commit message that describes the change.
- Explain the user-visible effect and relevant implementation decisions in the pull request.
- Link related issues when available. Include screenshots for visual changes.
- State which checks you ran and include their results. If you did not run checks, say so.
- Update user or contributor documentation when behavior, setup, or release steps change.
- Do not include secrets, personal data, generated browser binaries, test output, or release ZIP files.

## Artwork and other assets

Only contribute images, icons, screenshots, and other assets that you created or have permission to redistribute. Do not add artwork downloaded from DeviantArt unless its creator has explicitly licensed it for inclusion.

## Security reports

Do not report vulnerabilities in public issues. Follow SECURITY.md to contact the maintainers privately.

## Licensing contributions

The project is licensed under the MIT License. By submitting a contribution, you agree that your contribution is offered under that license. You retain copyright to your contribution. Identify any third-party material and its license, and do not submit material whose terms conflict with the project license.
