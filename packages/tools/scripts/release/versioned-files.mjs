// Every place that states the current version. Each pattern captures (text before)(version)(text after), so a
// release changes only these fields. A plain search for "0.2.0" would also hit values such as "10.2.0".
const PACKAGE_VERSION = /^(\t"version": ")([^"]+)(")/gm;
const BADGE_TITLE = /(title="Version )([^"]+)(")/g;
const BADGE_TEXT = /(title="Version [^"]+">)([^<]+)(<)/g;
const BADGE = [BADGE_TITLE, BADGE_TEXT];

export const VERSION_RULES = [
	{ file: "package.json", patterns: [PACKAGE_VERSION] },
	{ file: "packages/tools/package.json", patterns: [PACKAGE_VERSION] },
	{ file: "apps/extension/package.json", patterns: [PACKAGE_VERSION] },
	{ file: "apps/extension/manifest.json", patterns: [PACKAGE_VERSION] },
	{ file: "apps/extension/popup.html", patterns: BADGE },
	{ file: "apps/extension/saver.html", patterns: BADGE },
	{ file: "apps/extension/sidepanel.html", patterns: BADGE },
	{ file: "apps/web/package.json", patterns: [PACKAGE_VERSION] },
	{ file: "apps/web/index.html", patterns: [...BADGE, /(downloads\/deviation-lens-)([^"]+)(\.zip)/g] },
	{ file: "apps/web/privacy.html", patterns: BADGE },
	// Only the badge: the entries below it are the history of past versions.
	{ file: "apps/web/changelog.html", patterns: BADGE },
	{ file: "README.md", patterns: [/(\*\*Version:\*\* `)([^`]+)(`)/g] },
	{ file: ".github/ISSUE_TEMPLATE/bug_report.yml", patterns: [/(placeholder: ")(\d+\.\d+\.\d+[^"]*)(")/g] },
];

export const CHANGELOG_PAGE = "apps/web/changelog.html";
