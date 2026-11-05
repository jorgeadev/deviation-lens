// Builds ZIP downloads. This runs in an offscreen document because service workers cannot create blob URLs,
// and because a job here keeps running if the user closes the side panel.
const { naming, zip, folder, history: savedHistory } = globalThis.DeviationLens;

const MAX_PARALLEL_FETCHES = 3;
const FETCH_START_SPACING_MS = 350;
const RETRY_DELAY_MS = 2000;
const CLOSE_AFTER_IDLE_MS = 60000;
const MANIFEST_NAME = "manifest.csv";

let job = null;
let idleTimer = null;
const pendingSaves = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function canRetry(status) {
	return status === 429 || status >= 500;
}

async function fetchImage(url, signal) {
	for (let attempt = 0; ; attempt++) {
		const response = await fetch(url, { credentials: "include", signal });
		if (!response.ok) {
			if (attempt === 0 && canRetry(response.status)) {
				await sleep(RETRY_DELAY_MS);
				continue;
			}
			throw new Error(`HTTP ${response.status}`);
		}
		// Sign-in and error pages can answer an image URL with a 200 status.
		if (/^text\/html/i.test(response.headers.get("content-type") || "")) throw new Error("The server returned a web page instead of an image");
		const blob = await response.blob();
		const crc = zip.crc32(new Uint8Array(await blob.arrayBuffer()));
		return { blob, crc, size: blob.size };
	}
}

function errorMessage(e) {
	if (e?.name === "TypeError") return "The image host refused the request";
	return String(e?.message || e);
}

async function fetchAll(current) {
	let next = 0;
	let startGate = Promise.resolve();
	const worker = async () => {
		while (next < current.items.length && !current.cancelled) {
			const item = current.items[next++];
			const gate = startGate;
			startGate = gate.then(() => sleep(FETCH_START_SPACING_MS));
			await gate;
			if (current.cancelled) return;
			current.current = item.filename;
			try {
				const { blob, crc, size } = await fetchImage(item.url, current.controller.signal);
				if (zip.isTooLarge(item.name, size)) throw new Error("The image is too large for a ZIP file");
				item.entry = { name: item.name, data: blob, size, crc };
				current.done++;
			} catch (e) {
				if (current.cancelled) return;
				item.error = errorMessage(e);
				current.failed++;
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_FETCHES, current.items.length) }, worker));
	current.current = null;
}

function manifestFor(items) {
	const rows = items.map((item) => ({
		file: item.entry ? item.name : "",
		status: item.entry ? "saved" : "failed",
		artist: item.meta?.artist || "",
		title: item.meta?.title || "",
		date: item.meta?.date || "",
		source_page: naming.withoutQuery(item.meta?.pageUrl),
		image_url: naming.withoutQuery(item.url),
		width: item.meta?.width || "",
		height: item.meta?.height || "",
		bytes: item.entry ? item.entry.size : "",
		error: item.error || "",
	}));
	const bytes = new TextEncoder().encode(naming.buildManifestCsv(rows));
	return { name: MANIFEST_NAME, data: new Blob([bytes], { type: "text/csv" }), size: bytes.length, crc: zip.crc32(bytes) };
}

function saveWithBrowser(current, name, blob) {
	return new Promise((resolve) => {
		const blobUrl = URL.createObjectURL(blob);
		const finish = (result) => {
			pendingSaves.delete(blobUrl);
			URL.revokeObjectURL(blobUrl);
			resolve(result);
		};
		pendingSaves.set(blobUrl, finish);
		current.releaseSave = () => finish({ ok: false, cancelled: true });
		const filename = naming.sanitizePath(`${current.folder}/${name}`);
		chrome.runtime.sendMessage({ type: "DA_SAVE_ZIP", blobUrl, filename, ask: current.saveMode === "ask" }, (response) => {
			const failure = chrome.runtime.lastError
				? chrome.runtime.lastError.message
				: response?.ok
					? null
					: response?.error || "Could not start the download";
			if (failure && pendingSaves.has(blobUrl)) finish({ ok: false, error: failure, cancelled: !!response?.cancelled });
		});
	});
}

async function savePart(current, name, blob) {
	if (current.saveMode === "custom") {
		const target = await folder.prepare();
		if (!target.ok) return target;
		await folder.writeBlob(target.handle, name, blob);
		return { ok: true };
	}
	return saveWithBrowser(current, name, blob);
}

async function runJob(current) {
	await fetchAll(current);
	if (current.cancelled) return;
	if (!current.done) {
		current.error = current.items.find((item) => item.error)?.error || "No images could be downloaded";
		return;
	}

	current.phase = "saving";
	const manifest = manifestFor(current.items);
	const reserve = zip.entryBytes(manifest.name, manifest.size);
	const entries = current.items.filter((item) => item.entry).map((item) => item.entry);
	const parts = zip.planParts(entries, { reserve });
	const itemByEntry = new Map(current.items.map((item) => [item.entry, item]));

	for (let index = 0; index < parts.length; index++) {
		const name = zip.partName(current.zipName, index, parts.length);
		const result = await savePart(current, name, zip.buildZip([...parts[index], manifest]));
		current.releaseSave = null;
		if (current.cancelled || result.cancelled) {
			current.cancelled = true;
			return;
		}
		if (!result.ok) {
			current.error = result.error;
			return;
		}
		current.savedNames.push(name);
		const keys = parts[index].map((entry) => itemByEntry.get(entry)?.meta?.historyKey);
		if (keys.some(Boolean)) {
			await savedHistory.add(keys).catch(() => {});
			chrome.runtime.sendMessage({ type: "DA_HISTORY_CHANGED" }).catch(() => {});
		}
	}
}

function statusOf(current) {
	if (!current) return null;
	const finished = current.finished;
	return {
		jobId: current.id,
		kind: "zip",
		phase: current.phase,
		total: current.items.length,
		done: current.done,
		failed: current.failed,
		current: current.current,
		saveMode: current.saveMode,
		finished,
		cancelled: current.cancelled,
		error: current.error,
		savedNames: current.savedNames,
		firstError: current.items.find((item) => item.error)?.error || "",
		// Only the failed items are returned, so the panel can offer to save them as separate files.
		failedItems: finished
			? current.items
					.filter((item) => item.error)
					.map(({ url, filename, folder: itemFolder, meta }) => ({ url, filename, folder: itemFolder, meta }))
			: [],
	};
}

function releaseMemory(current) {
	for (const item of current.items) item.entry = null;
}

function scheduleClose() {
	clearTimeout(idleTimer);
	// Stay open briefly so the panel can read the final status.
	idleTimer = setTimeout(() => {
		chrome.runtime.sendMessage({ type: "DA_OFFSCREEN_IDLE" }).catch(() => {});
	}, CLOSE_AFTER_IDLE_MS);
}

function startJob(message) {
	clearTimeout(idleTimer);
	const used = new Set([MANIFEST_NAME]);
	const items = message.items.map((item) => ({
		...item,
		name: naming.uniquePath(naming.sanitizePath(item.filename) || "image", used),
		entry: null,
		error: "",
	}));
	const current = {
		id: crypto.randomUUID(),
		items,
		zipName: message.zipName,
		folder: message.folder || "",
		saveMode: message.saveMode,
		controller: new AbortController(),
		phase: "fetching",
		done: 0,
		failed: 0,
		current: null,
		finished: false,
		cancelled: false,
		error: "",
		savedNames: [],
		releaseSave: null,
	};
	job = current;
	runJob(current)
		.catch((e) => {
			current.error = errorMessage(e);
		})
		.finally(() => {
			current.finished = true;
			current.current = null;
			releaseMemory(current);
			scheduleClose();
		});
	return current.id;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (!message || typeof message.type !== "string" || !message.type.startsWith("OS_")) return;
	if (message.type === "OS_START") {
		if (job && !job.finished) sendResponse({ ok: false, error: "A ZIP download is already running." });
		else sendResponse({ ok: true, jobId: startJob(message) });
	} else if (message.type === "OS_STATUS") {
		sendResponse(job && job.id === message.jobId ? statusOf(job) : null);
	} else if (message.type === "OS_ACTIVE") {
		sendResponse(job && !job.finished ? statusOf(job) : null);
	} else if (message.type === "OS_CANCEL") {
		if (job && job.id === message.jobId && !job.finished) {
			job.cancelled = true;
			job.controller.abort();
			job.releaseSave?.();
		}
		sendResponse({ ok: true });
	} else if (message.type === "OS_SAVE_DONE") {
		pendingSaves.get(message.blobUrl)?.({ ok: message.ok, error: message.error, cancelled: message.cancelled });
		sendResponse({ ok: true });
	}
});
