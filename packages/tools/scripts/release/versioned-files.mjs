// Files that carry the release version as literal text. Paths are relative to the repository root.
export const VERSIONED_FILES = [
	"package.json",
	"packages/tools/package.json",
	"apps/extension/package.json",
	"apps/extension/manifest.json",
	"apps/extension/popup.html",
	"apps/extension/saver.html",
	"apps/extension/sidebar.html",
	"apps/extension/sidepanel.html",
	"apps/web/package.json",
	"apps/web/index.html",
	"apps/web/privacy.html",
	"README.md",
	".github/ISSUE_TEMPLATE/bug_report.yml",
];

// Pages that show the version to users. The packer refuses to build if one of them is out of date.
export const VERSIONED_PAGES = VERSIONED_FILES.filter((file) => file.endsWith(".html"));

export const PRERELEASE_VERSION = /\b\d+\.\d+\.\d+-[a-z]+\.\d+\b/gi;
