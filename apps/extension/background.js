importScripts("lib/naming.js", "lib/folder.js", "lib/history.js");

const batches = new Map();
let batchSeq = 0;

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function recordSaved(keys) {
	const { history } = globalThis.DeviationLens;
	if (!keys.some(Boolean)) return;
	try {
		await history.add(keys);
		chrome.runtime.sendMessage({ type: "DA_HISTORY_CHANGED" }).catch(() => {});
	} catch (_e) {}
}

async function writeToCustomFolder(item) {
	const { folder } = globalThis.DeviationLens;
	const target = await folder.prepare();
	if (!target.ok) return target;
	const res = await fetch(item.url, { credentials: "include" });
	if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
	const savedPath = await folder.writeBlob(target.handle, item.filename || "image", await res.blob());
	await recordSaved([item.meta?.historyKey]);
	return { ok: true, path: savedPath };
}

// Downloads are tracked by URL in session storage: the worker may restart while one is in progress,
// and the download's completion event can arrive before the download() callback does.
const pendingKey = (url) => `pendingDownload:${url}`;

async function trackDownload(url, info) {
	await chrome.storage.session.set({ [pendingKey(url)]: info });
}

async function untrackDownload(url) {
	await chrome.storage.session.remove(pendingKey(url));
}

async function downloadViaBrowser(item, ask) {
	const { naming } = globalThis.DeviationLens;
	const historyKey = item.meta?.historyKey;
	if (historyKey) await trackDownload(item.url, { kind: "file", historyKey });
	return new Promise((resolve) => {
		const full = naming.sanitizePath(`${item.folder || ""}/${item.filename || ""}`) || "image";
		chrome.downloads.download({ url: item.url, filename: full, conflictAction: "uniquify", saveAs: !!ask }, (id) => {
			if (chrome.runtime.lastError) {
				if (historyKey) untrackDownload(item.url);
				resolve({ ok: false, error: chrome.runtime.lastError.message });
			} else {
				resolve({ ok: true, id });
			}
		});
	});
}

async function saveZip({ blobUrl, filename, ask }) {
	await trackDownload(blobUrl, { kind: "zip" });
	return new Promise((resolve) => {
		chrome.downloads.download({ url: blobUrl, filename, conflictAction: "uniquify", saveAs: !!ask }, () => {
			const error = chrome.runtime.lastError?.message;
			if (!error) {
				resolve({ ok: true });
				return;
			}
			untrackDownload(blobUrl);
			resolve({ ok: false, error, cancelled: /cancel/i.test(error) });
		});
	});
}

chrome.downloads.onChanged.addListener(async (delta) => {
	const state = delta.state?.current;
	if (state !== "complete" && state !== "interrupted") return;
	const [download] = await chrome.downloads.search({ id: delta.id });
	if (!download) return;
	const key = pendingKey(download.url);
	const stored = await chrome.storage.session.get(key);
	const info = stored[key];
	if (!info) return;
	await untrackDownload(download.url);
	const ok = state === "complete";
	if (info.kind === "file") {
		if (ok) await recordSaved([info.historyKey]);
		return;
	}
	const reason = delta.error?.current || download.error || "";
	chrome.runtime
		.sendMessage({ type: "OS_SAVE_DONE", blobUrl: download.url, ok, error: reason, cancelled: reason === "USER_CANCELED" })
		.catch(() => {});
});

let offscreenCreation = null;

async function ensureOffscreen() {
	if (await chrome.offscreen.hasDocument()) return;
	if (!offscreenCreation) {
		offscreenCreation = chrome.offscreen
			.createDocument({
				url: "offscreen.html",
				reasons: ["BLOBS"],
				justification: "Build a ZIP file from the images the user chose and hand it to the downloads API.",
			})
			.finally(() => {
				offscreenCreation = null;
			});
	}
	await offscreenCreation;
}

async function startZipJob({ items, zipName }) {
	const { naming } = globalThis.DeviationLens;
	const { saveMode } = await chrome.storage.local.get("saveMode");
	await ensureOffscreen();
	return chrome.runtime.sendMessage({
		type: "OS_START",
		items,
		zipName: naming.sanitize(zipName) || "deviation-lens-images.zip",
		folder: items[0]?.folder || "",
		saveMode: saveMode || "default",
	});
}

async function startDownload(item) {
	let saveMode = "default";
	try {
		const stored = await chrome.storage.local.get("saveMode");
		saveMode = stored.saveMode || "default";
	} catch (_e) {}
	if (saveMode === "custom") {
		try {
			return await writeToCustomFolder(item);
		} catch (e) {
			return { ok: false, error: String((e?.message) || e) };
		}
	}
	return downloadViaBrowser(item, saveMode === "ask");
}

function armTimeout(ms) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function fetchInfo(url) {
	const guard = armTimeout(15000);
	try {
		let r = await fetch(url, { method: "HEAD", credentials: "include", redirect: "follow", signal: guard.signal });
		const headLen = r.headers.get("content-length");
		const headType = r.headers.get("content-type");
		if (r.ok && headLen) {
			return { ok: true, status: r.status, bytes: Number(headLen), type: headType, finalUrl: r.url };
		}
		r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, credentials: "include", redirect: "follow", signal: guard.signal });
		const type = r.headers.get("content-type");
		if (r.status === 206) {
			const m = /\/(\d+)\s*$/.exec(r.headers.get("content-range") || "");
			try {
				if (r.body) await r.body.cancel();
			} catch (_e) {}
			if (m) return { ok: true, status: 206, bytes: Number(m[1]), type, finalUrl: r.url };
		}
		const len = r.headers.get("content-length");
		try {
			if (r.body) await r.body.cancel();
		} catch (_e) {}
		if (r.ok) return { ok: true, status: r.status, bytes: len ? Number(len) : null, type, finalUrl: r.url };
		return { ok: false, status: r.status, bytes: null, type, finalUrl: r.url };
	} catch (e) {
		return { ok: false, status: 0, bytes: null, type: null, finalUrl: url, error: String((e?.message) || e) };
	} finally {
		guard.done();
	}
}

async function getSizes(urls) {
	const queue = [...new Set((urls || []).filter((u) => typeof u === "string" && u))].slice(0, 60);
	const out = {};
	for (const url of queue) out[url] = await fetchInfo(url);
	return out;
}

let sizeLookupQueue = Promise.resolve();
function serializeSizeLookup(lookup) {
	const result = sizeLookupQueue.then(lookup, lookup);
	sizeLookupQueue = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

async function runBatch(batchId, items) {
	const st = batches.get(batchId);
	if (!st) return;
	for (const item of items) {
		st.current = item.filename || item.url;
		const res = await startDownload(item);
		if (res.ok) st.done++;
		else {
			st.failed++;
			st.errors.push({ filename: st.current, error: res.error });
		}
		await sleep(350);
	}
	st.current = null;
	st.finished = true;
	st.finishedAt = Date.now();
	setTimeout(() => batches.delete(batchId), 300000);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	if (!msg || typeof msg !== "object") return;
	if (msg.type === "DA_SIZES") {
		serializeSizeLookup(() => getSizes(msg.urls)).then(sendResponse);
		return true;
	}
	if (msg.type === "DA_PROBE") {
		serializeSizeLookup(() => fetchInfo(msg.url)).then(sendResponse);
		return true;
	}
	if (msg.type === "DA_DOWNLOAD") {
		startDownload(msg.item).then(sendResponse);
		return true;
	}
	if (msg.type === "DA_DOWNLOAD_BATCH") {
		const batchId = `b${++batchSeq}`;
		batches.set(batchId, { id: batchId, total: msg.items.length, done: 0, failed: 0, current: null, finished: false, errors: [] });
		runBatch(batchId, msg.items);
		sendResponse({ batchId });
		return false;
	}
	if (msg.type === "DA_DOWNLOAD_ZIP") {
		startZipJob(msg)
			.then(sendResponse)
			.catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
		return true;
	}
	if (msg.type === "DA_SAVE_ZIP") {
		saveZip(msg).then(sendResponse);
		return true;
	}
	if (msg.type === "DA_OFFSCREEN_IDLE") {
		chrome.offscreen.closeDocument().catch(() => {});
		return false;
	}
	if (msg.type === "DA_BATCH_STATUS") {
		sendResponse(batches.get(msg.batchId) || null);
		return false;
	}
	if (msg.type === "DA_OPEN_SAVER") {
		chrome.tabs.create({ url: chrome.runtime.getURL("saver.html") });
		sendResponse({ ok: true });
		return false;
	}
});
