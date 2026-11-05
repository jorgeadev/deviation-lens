const assert = require("node:assert/strict");
const { test } = require("node:test");

require("../../../apps/extension/lib/naming.js");
const { sanitize, sanitizePath, unknownTokens, renderTemplate, uniquePath, withoutQuery, csvCell, buildManifestCsv } =
	globalThis.DeviationLens.naming;

const VALUES = { artist: "Ana", title: "Sunset Valley", date: "2026-01-15", id: "123", width: 1920, height: 1080 };

test("sanitize removes characters Windows rejects", () => {
	assert.equal(sanitize('a<b>c:d"e/f\\g|h?i*j'), "a_b_c_d_e_f_g_h_i_j");
	assert.equal(sanitize("  ..name.. "), "name");
	assert.equal(sanitize(null), "");
});

test("sanitizePath cleans each level and cannot escape upward", () => {
	assert.equal(sanitizePath("a/b/c.png"), "a/b/c.png");
	assert.equal(sanitizePath("../../etc/passwd"), "etc/passwd");
	assert.equal(sanitizePath("a\\..\\b.png"), "a/b.png");
	assert.equal(sanitizePath("//a//b//"), "a/b");
	assert.equal(sanitizePath(".."), "");
});

test("sanitizePath avoids Windows reserved device names", () => {
	assert.equal(sanitizePath("con.png"), "_con.png");
	assert.equal(sanitizePath("NUL/x.png"), "_NUL/x.png");
	assert.equal(sanitizePath("console.png"), "console.png");
});

test("sanitizePath shortens long names but keeps the extension", () => {
	const result = sanitizePath(`${"x".repeat(300)}.png`);
	assert.equal(result.length, 180);
	assert.ok(result.endsWith(".png"));
});

test("renderTemplate substitutes tokens and adds the extension", () => {
	assert.equal(renderTemplate("{artist}_{date}_{title}", VALUES, "png"), "Ana_2026-01-15_Sunset Valley.png");
	assert.equal(renderTemplate("{artist}/{width}x{height}/{id}", VALUES, "jpg"), "Ana/1920x1080/123.jpg");
});

test("renderTemplate does not let token values add folders", () => {
	const hostile = { ...VALUES, title: "../../evil/name", artist: "a/b" };
	assert.equal(renderTemplate("{artist}/{title}", hostile, "png"), "a_b/_.._evil_name.png");
});

test("renderTemplate falls back for missing values", () => {
	assert.equal(renderTemplate("{artist}_{title}_{date}_{id}_{width}", {}, "png"), "unknown-artist_untitled_undated_no-id_0.png");
	assert.equal(renderTemplate("{title}", { title: "..." }, "png"), "untitled.png");
});

test("renderTemplate never returns an empty name", () => {
	assert.equal(renderTemplate("", VALUES, "png"), "image.png");
	assert.equal(renderTemplate("///", VALUES, "png"), "image.png");
	assert.equal(renderTemplate("{artist}/", VALUES, "png"), "Ana.png");
});

test("unknownTokens reports only unsupported tokens", () => {
	assert.deepEqual(unknownTokens("{artist}/{date}_{title}"), []);
	assert.deepEqual(unknownTokens("{artist}_{colour}_{colour}_{}"), ["colour", ""]);
	assert.deepEqual(unknownTokens(""), []);
});

test("uniquePath numbers duplicates case-insensitively", () => {
	const used = new Set();
	assert.equal(uniquePath("a/b.png", used), "a/b.png");
	assert.equal(uniquePath("a/b.png", used), "a/b (2).png");
	assert.equal(uniquePath("A/B.PNG", used), "A/B (3).PNG");
	assert.equal(uniquePath("c/b.png", used), "c/b.png");
	assert.equal(uniquePath("noext", used), "noext");
	assert.equal(uniquePath("noext", used), "noext (2)");
});

test("uniquePath respects reserved names", () => {
	const used = new Set(["manifest.csv"]);
	assert.equal(uniquePath("manifest.csv", used), "manifest (2).csv");
});

test("withoutQuery drops signed tokens", () => {
	assert.equal(withoutQuery("https://x.test/a.png?token=secret#f"), "https://x.test/a.png");
	assert.equal(withoutQuery(undefined), "");
});

test("csvCell neutralises spreadsheet formulas in text", () => {
	for (const hostile of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx"]) {
		assert.equal(csvCell(hostile)[1], "'", hostile);
	}
	assert.equal(csvCell("Sunset"), '"Sunset"');
	assert.equal(csvCell(-5), '"-5"');
});

test("csvCell quotes separators, quotes and new lines", () => {
	assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
	assert.equal(csvCell(null), '""');
});

test("buildManifestCsv writes a BOM, header and one row per item", () => {
	const csv = buildManifestCsv([{ file: "a.png", status: "saved", artist: "Ana", width: 10, height: 20, bytes: 30 }]);
	assert.equal(csv.charCodeAt(0), 0xfeff);
	const lines = csv.slice(1).trimEnd().split("\r\n");
	assert.equal(lines.length, 2);
	assert.ok(lines[0].startsWith('"file","status","artist"'));
	assert.ok(lines[1].startsWith('"a.png","saved","Ana"'));
});
