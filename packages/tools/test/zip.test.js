const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const zlib = require("node:zlib");

require("../../../apps/extension/lib/zip.js");
const { crc32, planParts, buildZip, partName, isTooLarge } = globalThis.DeviationLens.zip;

function entry(name, text) {
	const bytes = Buffer.from(text);
	return { name, data: new Blob([bytes]), size: bytes.length, crc: crc32(bytes) };
}

// Reads the archive the way an unzip tool does: from the end record, through the central directory, to each local header.
function parseZip(buffer) {
	const endOffset = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
	assert.ok(endOffset >= 0, "end record present");
	assert.equal(endOffset, buffer.length - 22, "end record is last, with no comment");
	const count = buffer.readUInt16LE(endOffset + 10);
	let cursor = buffer.readUInt32LE(endOffset + 16);
	const directoryEnd = cursor + buffer.readUInt32LE(endOffset + 12);
	assert.equal(directoryEnd, endOffset, "central directory ends at the end record");
	const files = [];
	for (let i = 0; i < count; i++) {
		assert.equal(buffer.readUInt32LE(cursor), 0x02014b50, "central header signature");
		const flags = buffer.readUInt16LE(cursor + 8);
		const method = buffer.readUInt16LE(cursor + 10);
		const crc = buffer.readUInt32LE(cursor + 16);
		const size = buffer.readUInt32LE(cursor + 24);
		const nameLength = buffer.readUInt16LE(cursor + 28);
		const local = buffer.readUInt32LE(cursor + 42);
		const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
		assert.equal(buffer.readUInt32LE(local), 0x04034b50, "local header signature");
		assert.equal(buffer.readUInt16LE(local + 26), nameLength, "local and central name lengths agree");
		const start = local + 30 + nameLength;
		const data = buffer.subarray(start, start + size);
		files.push({ name, flags, method, crc, size, data });
		cursor += 46 + nameLength;
	}
	return files;
}

test("crc32 matches zlib", () => {
	for (const text of ["", "a", "Deviation Lens", "x".repeat(70000)]) {
		const bytes = Buffer.from(text);
		assert.equal(crc32(bytes), zlib.crc32(bytes));
	}
});

test("buildZip stores entries with correct checksums and UTF-8 names", async () => {
	const names = ["plain.png", "folder/nested.jpg", "日本語の絵.png", "ñandú (2).webp"];
	const blob = buildZip(names.map((name) => entry(name, `contents of ${name}`)));
	assert.equal(blob.type, "application/zip");
	const files = parseZip(Buffer.from(await blob.arrayBuffer()));
	assert.deepEqual(
		files.map((f) => f.name),
		names,
	);
	for (const file of files) {
		assert.equal(file.method, 0, "STORE");
		assert.equal(file.flags & 0x0800, 0x0800, "UTF-8 flag");
		assert.equal(zlib.crc32(file.data), file.crc);
		assert.equal(file.data.toString(), `contents of ${file.name}`);
	}
});

test("an independent tool can extract the archive", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dl-zip-"));
	try {
		const blob = buildZip([entry("a.txt", "alpha"), entry("sub/b.txt", "bravo"), entry("empty.txt", "")]);
		fs.writeFileSync(path.join(dir, "out.zip"), Buffer.from(await blob.arrayBuffer()));
		// Windows ships bsdtar, which reads ZIP files. The tar found first on PATH may be GNU tar, which does not.
		if (process.platform === "win32") execFileSync(path.join(process.env.SystemRoot, "System32", "tar.exe"), ["-xf", "out.zip"], { cwd: dir });
		else execFileSync("unzip", ["-q", "out.zip"], { cwd: dir });
		assert.equal(fs.readFileSync(path.join(dir, "a.txt"), "utf8"), "alpha");
		assert.equal(fs.readFileSync(path.join(dir, "sub", "b.txt"), "utf8"), "bravo");
		assert.equal(fs.statSync(path.join(dir, "empty.txt")).size, 0);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("an empty archive is still valid", async () => {
	assert.deepEqual(parseZip(Buffer.from(await buildZip([]).arrayBuffer())), []);
});

test("planParts rolls over at the limit and keeps order", () => {
	const entries = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, size: 400 }));
	const parts = planParts(entries, { limit: 1000 });
	assert.deepEqual(
		parts.map((p) => p.map((e) => e.name)),
		[["f0", "f1"], ["f2", "f3"], ["f4"]],
	);
});

test("planParts counts the reserve in every part", () => {
	const entries = Array.from({ length: 2 }, (_, i) => ({ name: `f${i}`, size: 400 }));
	assert.equal(planParts(entries, { limit: 1000 }).length, 1);
	assert.equal(planParts(entries, { limit: 1000, reserve: 300 }).length, 2);
});

test("planParts gives an oversized entry its own part", () => {
	const parts = planParts(
		[
			{ name: "a", size: 10 },
			{ name: "huge", size: 5000 },
			{ name: "b", size: 10 },
		],
		{ limit: 1000 },
	);
	assert.deepEqual(
		parts.map((p) => p.map((e) => e.name)),
		[["a"], ["huge"], ["b"]],
	);
});

test("planParts respects the entry count limit", () => {
	const entries = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, size: 1 }));
	assert.equal(planParts(entries, { maxEntries: 2 }).length, 3);
});

test("isTooLarge flags entries past the ZIP32 limit", () => {
	assert.equal(isTooLarge("a.png", 1024), false);
	assert.equal(isTooLarge("a.png", 0xffffffff), true);
});

test("partName only changes the name when there are several parts", () => {
	assert.equal(partName("art.zip", 0, 1), "art.zip");
	assert.equal(partName("art.zip", 0, 3), "art_part1.zip");
	assert.equal(partName("art.zip", 2, 3), "art_part3.zip");
});
