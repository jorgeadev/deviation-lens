// File naming and manifest helpers shared by the service worker, panel, settings page and offscreen document.
(() => {
	const TEMPLATE_TOKENS = ["artist", "title", "date", "id", "width", "height"];
	const TOKEN_FALLBACKS = { artist: "unknown-artist", title: "untitled", date: "undated", id: "no-id", width: "0", height: "0" };
	const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
	const MAX_SEGMENT_LENGTH = 180;

	function sanitize(name) {
		return String(name == null ? "" : name)
			.replace(/[<>:"/\\|?*]|\p{Cc}/gu, "_")
			.replace(/\s+/g, " ")
			.replace(/^[. ]+|[. ]+$/g, "")
			.trim();
	}

	function truncateSegment(segment) {
		if (segment.length <= MAX_SEGMENT_LENGTH) return segment;
		const dot = segment.lastIndexOf(".");
		const ext = dot > 0 && segment.length - dot <= 12 ? segment.slice(dot) : "";
		return `${segment.slice(0, MAX_SEGMENT_LENGTH - ext.length).trimEnd()}${ext}`;
	}

	// Cleans each folder level separately. Empty segments and "..", which sanitize() empties, are dropped.
	function sanitizePath(relativePath) {
		const parts = String(relativePath == null ? "" : relativePath)
			.split(/[/\\]/)
			.map((part) => truncateSegment(sanitize(part)))
			.filter(Boolean)
			.map((part) => (WINDOWS_RESERVED.test(part) ? `_${part}` : part));
		return parts.join("/");
	}

	function unknownTokens(template) {
		const unknown = [];
		for (const match of String(template || "").matchAll(/\{([^{}]*)\}/g)) {
			if (!TEMPLATE_TOKENS.includes(match[1]) && !unknown.includes(match[1])) unknown.push(match[1]);
		}
		return unknown;
	}

	// Values come from the page, so they are cleaned before substitution and can never add folder levels.
	function renderTemplate(template, values, ext) {
		const rendered = String(template || "").replace(/\{(\w+)\}/g, (whole, token) => {
			if (!TEMPLATE_TOKENS.includes(token)) return whole;
			const raw = values?.[token];
			const empty = raw == null || raw === "" || raw === 0;
			return sanitize(empty ? TOKEN_FALLBACKS[token] : raw) || TOKEN_FALLBACKS[token];
		});
		const clean = sanitizePath(rendered) || "image";
		return ext ? sanitizePath(`${clean}.${ext}`) : clean;
	}

	// Case-insensitive because Windows and most ZIP tools treat "A.png" and "a.png" as one file.
	function uniquePath(relativePath, used) {
		const slash = relativePath.lastIndexOf("/");
		const dir = slash >= 0 ? relativePath.slice(0, slash + 1) : "";
		const file = relativePath.slice(slash + 1);
		const dot = file.lastIndexOf(".");
		const stem = dot > 0 ? file.slice(0, dot) : file;
		const ext = dot > 0 ? file.slice(dot) : "";
		let candidate = relativePath;
		for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${dir}${stem} (${n})${ext}`;
		used.add(candidate.toLowerCase());
		return candidate;
	}

	// Signed image URLs carry an access token in the query, which should not be kept or used as an identity.
	function withoutQuery(url) {
		return String(url || "").split(/[?#]/)[0];
	}

	function csvCell(value) {
		if (value == null) return '""';
		let text = String(value);
		// A leading = + - @ makes spreadsheets evaluate the cell as a formula, and titles are untrusted.
		if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
		return `"${text.replace(/"/g, '""')}"`;
	}

	const MANIFEST_COLUMNS = ["file", "status", "artist", "title", "date", "source_page", "image_url", "width", "height", "bytes", "error"];

	function buildManifestCsv(rows) {
		const lines = [MANIFEST_COLUMNS.map(csvCell).join(",")];
		for (const row of rows) lines.push(MANIFEST_COLUMNS.map((column) => csvCell(row[column])).join(","));
		// The byte order mark makes Excel read the file as UTF-8.
		return `﻿${lines.join("\r\n")}\r\n`;
	}

	globalThis.DeviationLens = globalThis.DeviationLens || {};
	globalThis.DeviationLens.naming = {
		TEMPLATE_TOKENS,
		sanitize,
		sanitizePath,
		unknownTokens,
		renderTemplate,
		uniquePath,
		withoutQuery,
		csvCell,
		buildManifestCsv,
	};
})();
