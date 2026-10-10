import { deflateRawSync } from "node:zlib";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "../../../..");
const extensionDir = path.join(rootDir, "apps", "extension");
const outputDirs = [path.join(rootDir, "dist", "extension"), path.join(rootDir, "apps", "web", "downloads")];

const app = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
const extension = JSON.parse(await fs.readFile(path.join(extensionDir, "package.json"), "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(extensionDir, "manifest.json"), "utf8"));
const version = app.version;

if (!version || extension.version !== version || manifest.version_name !== version) {
	throw new Error(`Version mismatch: app=${version}, extension=${extension.version}, manifest=${manifest.version_name}`);
}
if (manifest.version !== version.split("-")[0]) {
	throw new Error(`Chrome manifest version ${manifest.version} does not match app version ${version.split("-")[0]}.`);
}

const files = [];
async function collectFiles(dir, relativeDir = "") {
	for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
		if (entry.name === "package.json" || entry.name === "store") continue;
		const absolutePath = path.join(dir, entry.name);
		const relativePath = path.posix.join(relativeDir, entry.name);
		if (entry.isDirectory()) {
			await collectFiles(absolutePath, relativePath);
		} else if (entry.isFile()) {
			files.push({ absolutePath, relativePath });
		}
	}
}
await collectFiles(extensionDir);
files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
	let value = n;
	for (let bit = 0; bit < 8; bit++) {
		value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	}
	crcTable[n] = value >>> 0;
}

function crc32(buffer) {
	let value = 0xffffffff;
	for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
	return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
	return {
		date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
		time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
	};
}

function makeZip(entries) {
	const localParts = [];
	const centralParts = [];
	let offset = 0;

	for (const entry of entries) {
		const name = Buffer.from(entry.relativePath, "utf8");
		const source = entry.data;
		const compressed = deflateRawSync(source);
		const checksum = crc32(source);
		const { date, time } = dosDateTime(new Date());
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6);
		local.writeUInt16LE(8, 8);
		local.writeUInt16LE(time, 10);
		local.writeUInt16LE(date, 12);
		local.writeUInt32LE(checksum, 14);
		local.writeUInt32LE(compressed.length, 18);
		local.writeUInt32LE(source.length, 22);
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(0, 28);
		localParts.push(local, name, compressed);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(8, 10);
		central.writeUInt16LE(time, 12);
		central.writeUInt16LE(date, 14);
		central.writeUInt32LE(checksum, 16);
		central.writeUInt32LE(compressed.length, 20);
		central.writeUInt32LE(source.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt16LE(0, 30);
		central.writeUInt16LE(0, 32);
		central.writeUInt16LE(0, 34);
		central.writeUInt16LE(0, 36);
		central.writeUInt32LE(0, 38);
		central.writeUInt32LE(offset, 42);
		centralParts.push(central, name);
		offset += local.length + name.length + compressed.length;
	}

	const centralDirectory = Buffer.concat(centralParts);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralDirectory.length, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20);
	return Buffer.concat([...localParts, centralDirectory, end]);
}

const archiveEntries = await Promise.all(
	files.map(async (file) => ({
		relativePath: file.relativePath,
		data: await fs.readFile(file.absolutePath),
	})),
);
const archive = makeZip(archiveEntries);
const fileName = `deviation-lens-${version}.zip`;

for (const outputDir of outputDirs) {
	await fs.mkdir(outputDir, { recursive: true });
	for (const name of await fs.readdir(outputDir)) {
		if (/^deviation-lens-.+\.zip$/i.test(name)) {
			await fs.unlink(path.join(outputDir, name));
		}
	}
	await fs.writeFile(path.join(outputDir, fileName), archive);
}

console.log(`Packaged ${files.length} extension files for v${version}:`);
for (const outputDir of outputDirs) {
	console.log(path.relative(rootDir, path.join(outputDir, fileName)));
}
