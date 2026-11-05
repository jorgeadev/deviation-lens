const assert = require("node:assert/strict");
const zlib = require("node:zlib");

// Reads an archive the way an unzip tool does: from the end record, through the central directory, to each local header.
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
		assert.equal(zlib.crc32(data), crc, `checksum of ${name}`);
		files.push({ name, flags, method, crc, size, data });
		cursor += 46 + nameLength;
	}
	return files;
}

module.exports = { parseZip };
