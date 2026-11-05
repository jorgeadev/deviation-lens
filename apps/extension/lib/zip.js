// Minimal ZIP writer. Images are already compressed, so entries use the STORE method and need no compression library.
(() => {
	const TWO_GIB = 2 * 1024 * 1024 * 1024;
	const ZIP32_MAX = 0xffffffff;
	const MAX_ENTRIES_PER_PART = 65000;
	const LOCAL_HEADER = 30;
	const CENTRAL_HEADER = 46;
	const END_RECORD = 22;
	const UTF8_FLAG = 0x0800;
	const VERSION = 20;
	const encoder = new TextEncoder();

	const crcTable = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let value = n;
		for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		crcTable[n] = value >>> 0;
	}

	function crc32(bytes) {
		let value = 0xffffffff;
		for (let i = 0; i < bytes.length; i++) value = crcTable[(value ^ bytes[i]) & 0xff] ^ (value >>> 8);
		return (value ^ 0xffffffff) >>> 0;
	}

	function dosDateTime(date) {
		return {
			date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
			time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
		};
	}

	function entryBytes(name, size) {
		const nameLength = encoder.encode(name).length;
		return LOCAL_HEADER + CENTRAL_HEADER + 2 * nameLength + size;
	}

	// Splits entries into parts that stay under the limit. `reserve` is room kept free in every part, such as for a manifest.
	function planParts(entries, { limit = TWO_GIB, reserve = 0, maxEntries = MAX_ENTRIES_PER_PART } = {}) {
		const parts = [];
		let current = [];
		let used = END_RECORD + reserve;
		for (const entry of entries) {
			const bytes = entryBytes(entry.name, entry.size);
			if (current.length && (used + bytes > limit || current.length >= maxEntries)) {
				parts.push(current);
				current = [];
				used = END_RECORD + reserve;
			}
			current.push(entry);
			used += bytes;
		}
		if (current.length) parts.push(current);
		return parts;
	}

	// An entry this large could not be addressed by 32-bit ZIP offsets, even alone in its own part.
	function isTooLarge(name, size, reserve = 0) {
		return entryBytes(name, size) + END_RECORD + reserve > ZIP32_MAX;
	}

	// Entries are { name, data: Blob, size, crc }. The returned Blob references the data rather than copying it.
	function buildZip(entries, date = new Date()) {
		const { date: dosDate, time: dosTime } = dosDateTime(date);
		const parts = [];
		const central = [];
		let offset = 0;
		let centralSize = 0;

		for (const entry of entries) {
			const name = encoder.encode(entry.name);
			const local = new DataView(new ArrayBuffer(LOCAL_HEADER));
			local.setUint32(0, 0x04034b50, true);
			local.setUint16(4, VERSION, true);
			local.setUint16(6, UTF8_FLAG, true);
			local.setUint16(8, 0, true);
			local.setUint16(10, dosTime, true);
			local.setUint16(12, dosDate, true);
			local.setUint32(14, entry.crc, true);
			local.setUint32(18, entry.size, true);
			local.setUint32(22, entry.size, true);
			local.setUint16(26, name.length, true);
			local.setUint16(28, 0, true);
			parts.push(local.buffer, name, entry.data);

			const record = new DataView(new ArrayBuffer(CENTRAL_HEADER));
			record.setUint32(0, 0x02014b50, true);
			record.setUint16(4, VERSION, true);
			record.setUint16(6, VERSION, true);
			record.setUint16(8, UTF8_FLAG, true);
			record.setUint16(10, 0, true);
			record.setUint16(12, dosTime, true);
			record.setUint16(14, dosDate, true);
			record.setUint32(16, entry.crc, true);
			record.setUint32(20, entry.size, true);
			record.setUint32(24, entry.size, true);
			record.setUint16(28, name.length, true);
			record.setUint32(42, offset, true);
			central.push(record.buffer, name);
			centralSize += CENTRAL_HEADER + name.length;
			offset += LOCAL_HEADER + name.length + entry.size;
		}

		const end = new DataView(new ArrayBuffer(END_RECORD));
		end.setUint32(0, 0x06054b50, true);
		end.setUint16(8, entries.length, true);
		end.setUint16(10, entries.length, true);
		end.setUint32(12, centralSize, true);
		end.setUint32(16, offset, true);
		return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
	}

	function partName(zipName, index, total) {
		if (total < 2) return zipName;
		return zipName.replace(/(\.zip)?$/i, `_part${index + 1}.zip`);
	}

	globalThis.DeviationLens = globalThis.DeviationLens || {};
	globalThis.DeviationLens.zip = { crc32, entryBytes, planParts, isTooLarge, buildZip, partName };
})();
