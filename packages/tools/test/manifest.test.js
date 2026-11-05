const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../apps/extension/manifest.json"), "utf8"));

// A new permission can trigger a warning that disables the extension for existing users until they accept it,
// and each one needs a justification in the store listing. Adding one here should be a deliberate decision.
test("the extension asks only for the permissions it uses", () => {
	assert.deepEqual([...manifest.permissions].sort(), ["downloads", "offscreen", "scripting", "sidePanel", "storage", "tabs"]);
});

test("built-in site access is limited to HTTPS DeviantArt and its image host", () => {
	assert.deepEqual([...manifest.host_permissions].sort(), ["https://*.deviantart.com/*", "https://*.wixmp.com/*"]);
	assert.deepEqual(manifest.content_scripts[0].matches, ["https://*.deviantart.com/*"]);
});

test("other sites stay optional, and pages cannot read extension files", () => {
	assert.deepEqual(manifest.optional_host_permissions, ["*://*/*"]);
	assert.equal(manifest.web_accessible_resources, undefined);
});

test("the version is a plain number Chrome accepts", () => {
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(manifest.version_name, undefined);
});
