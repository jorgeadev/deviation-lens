const $ = (s) => document.querySelector(s);
const { naming, history: savedHistory } = globalThis.DeviationLens;

function openIdb() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open("da-image-hunter", 1);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains("handles")) req.result.createObjectStore("handles");
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function idbPut(db, store, value, key) {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, "readwrite");
		const rq = tx.objectStore(store).put(value, key);
		rq.onsuccess = () => resolve();
		rq.onerror = () => reject(rq.error);
	});
}

function idbGet(db, store, key) {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, "readonly");
		const rq = tx.objectStore(store).get(key);
		rq.onsuccess = () => resolve(rq.result);
		rq.onerror = () => reject(rq.error);
	});
}

async function getHandle() {
	try {
		const db = await openIdb();
		try {
			return (await idbGet(db, "handles", "folder")) || null;
		} finally {
			db.close();
		}
	} catch (_e) {
		return null;
	}
}

async function setHandle(handle) {
	const db = await openIdb();
	try {
		await idbPut(db, "handles", handle, "folder");
	} finally {
		db.close();
	}
}

function setStatus(text, kind) {
	const s = $("#status");
	s.textContent = text || "";
	s.className = `saverStatus${kind ? ` ${kind}` : ""}`;
}

let permissionState = "none";
const FS_SUPPORTED = typeof window.showDirectoryPicker === "function";

async function refresh() {
	const stored = await chrome.storage.local.get(["saveMode", "folderName"]);
	let saveMode = stored.saveMode || "default";
	const folderName = stored.folderName || "";
	if (!FS_SUPPORTED && saveMode === "custom") {
		saveMode = "default";
		await chrome.storage.local.set({ saveMode: "default" });
	}
	document.querySelectorAll('input[name="mode"]').forEach((r) => {
		r.checked = r.value === saveMode;
	});
	const customRadio = document.querySelector('input[name="mode"][value="custom"]');
	if (customRadio) {
		customRadio.disabled = !FS_SUPPORTED;
		const item = customRadio.closest(".modeItem");
		if (item) item.classList.toggle("disabled", !FS_SUPPORTED);
	}
	$("#btnPick").title = FS_SUPPORTED ? "" : "Not supported in this browser - click for alternatives";
	$("#fsNote").classList.toggle("hidden", FS_SUPPORTED);
	$("#folderName").textContent = folderName || "none";
	const label =
		saveMode === "custom" ? folderName || "Custom folder" : saveMode === "ask" ? "Ask every time" : "Browser default (Downloads\\DeviantArt)";
	$("#curMode").textContent = label;

	const handle = await getHandle();
	if (saveMode === "custom" && !handle && FS_SUPPORTED) {
		saveMode = "default";
		await chrome.storage.local.set({ saveMode: "default" });
		document.querySelectorAll('input[name="mode"]').forEach((r) => {
			r.checked = r.value === saveMode;
		});
		$("#curMode").textContent = "Browser default (Downloads\\DeviantArt)";
	}
	permissionState = "none";
	if (handle) {
		try {
			permissionState = await handle.queryPermission({ mode: "readwrite" });
		} catch (_e) {
			permissionState = "unknown";
		}
	}
	$("#btnGrant").classList.toggle("hidden", !(handle && permissionState !== "granted"));
	$("#btnPick").textContent = saveMode === "custom" && handle ? "Change folder…" : "Choose folder…";
}

async function chooseFolder() {
	if (typeof window.showDirectoryPicker !== "function") {
		setStatus(
			'This browser does not allow choosing a folder directly (File System Access API unavailable). Use "Ask every time", or change your browser download folder via "Browser download settings" and keep "Browser default".',
			"err",
		);
		return;
	}
	try {
		setStatus("Waiting for the folder picker…");
		const handle = await window.showDirectoryPicker({ mode: "readwrite" });
		await setHandle(handle);
		await chrome.storage.local.set({ saveMode: "custom", folderName: handle.name });
		setStatus(`Folder "${handle.name}" selected. Downloads will be written there.`, "ok");
	} catch (e) {
		if (e && e.name === "AbortError") setStatus("Folder selection cancelled.");
		else setStatus(`Could not select the folder: ${(e?.message) || e}`, "err");
	}
	refresh();
}

document.querySelectorAll('input[name="mode"]').forEach((radio) => {
	radio.addEventListener("change", async () => {
		if (radio.value === "custom") {
			const handle = await getHandle();
			if (!handle) {
				setStatus('Click "Choose folder…" to pick the custom folder first.', "err");
				await chrome.storage.local.set({ saveMode: "default" });
				refresh();
				return;
			}
			await chrome.storage.local.set({ saveMode: "custom" });
			setStatus("Custom folder enabled.", "ok");
		} else {
			await chrome.storage.local.set({ saveMode: radio.value });
			setStatus(radio.value === "ask" ? "A Save As dialog will open for every file or ZIP." : "Using the browser default folder.", "ok");
		}
		refresh();
	});
});

$("#btnPick").addEventListener("click", chooseFolder);

$("#btnGrant").addEventListener("click", async () => {
	const handle = await getHandle();
	if (!handle) return;
	try {
		const perm = await handle.requestPermission({ mode: "readwrite" });
		if (perm === "granted") setStatus(`Folder "${handle.name}" is connected again.`, "ok");
		else setStatus("Access was not granted.", "err");
	} catch (e) {
		setStatus(`Could not connect the folder: ${(e?.message) || e}`, "err");
	}
	refresh();
});

$("#btnDefault").addEventListener("click", async () => {
	await chrome.storage.local.set({ saveMode: "default" });
	setStatus("Using the browser default folder.", "ok");
	refresh();
});

$("#btnShow").addEventListener("click", () => {
	chrome.downloads.showDefaultFolder();
});

$("#btnSettings").addEventListener("click", () => {
	const ua = navigator.userAgent;
	let url = "chrome://settings/downloads";
	if (/Edg\//.test(ua)) url = "edge://settings/downloads";
	else if (/OPR\//.test(ua)) url = "opera://settings/downloads";
	else if (/YaBrowser/i.test(ua)) url = "browser://settings/downloads";
	chrome.tabs.create({ url });
});

const TEMPLATE_SAMPLE = { artist: "ArtistName", title: "Sunset Valley", date: "2026-01-15", id: "1234567890", width: 3840, height: 2160 };

function showTemplatePreview(template) {
	$("#templatePreview").textContent = template
		? naming.renderTemplate(template, TEMPLATE_SAMPLE, "png")
		: "ArtistName_2026-01-15_Sunset_Valley.png (automatic)";
}

function handleTemplateInput() {
	const template = $("#inpTemplate").value.trim();
	const unknown = naming.unknownTokens(template);
	if (unknown.length) {
		setStatus(`Unknown name token: {${unknown[0]}}. The template was not saved.`, "err");
		return;
	}
	showTemplatePreview(template);
	chrome.storage.local.set({ filenameTemplate: template });
	setStatus(template ? "Name template saved." : "Using automatic names.", "ok");
}

async function refreshHistoryCount() {
	let count = 0;
	try {
		count = await savedHistory.count();
	} catch (_e) {}
	$("#historyCount").textContent = `${count} ${count === 1 ? "artwork" : "artworks"} remembered`;
	$("#btnClearHistory").disabled = count === 0;
}

$("#chkZip").addEventListener("change", () => {
	chrome.storage.local.set({ zipDownloads: $("#chkZip").checked });
	setStatus($("#chkZip").checked ? "Multiple images will be saved as one ZIP." : "Multiple images will be saved as separate files.", "ok");
});

$("#inpTemplate").addEventListener("input", handleTemplateInput);

$("#btnTemplateReset").addEventListener("click", () => {
	$("#inpTemplate").value = "";
	handleTemplateInput();
});

$("#chkRemember").addEventListener("change", () => {
	chrome.storage.local.set({ rememberSaved: $("#chkRemember").checked });
	setStatus(
		$("#chkRemember").checked ? "Saved images will be remembered and skipped." : "Saved images will no longer be recorded or skipped.",
		"ok",
	);
});

$("#btnClearHistory").addEventListener("click", async () => {
	if (!window.confirm("Forget all remembered images? They can then be downloaded again by Download all and profile ranges.")) return;
	try {
		await savedHistory.clear();
		chrome.runtime.sendMessage({ type: "DA_HISTORY_CHANGED" }).catch(() => {});
		setStatus("History cleared.", "ok");
	} catch (e) {
		setStatus(`Could not clear the history: ${e?.message || e}`, "err");
	}
	refreshHistoryCount();
});

chrome.runtime.onMessage.addListener((message) => {
	if (message?.type === "DA_HISTORY_CHANGED") refreshHistoryCount();
});

async function initDownloadOptions() {
	const stored = await chrome.storage.local.get(["zipDownloads", "filenameTemplate", "rememberSaved"]);
	$("#chkZip").checked = stored.zipDownloads !== false;
	$("#inpTemplate").value = stored.filenameTemplate || "";
	$("#chkRemember").checked = stored.rememberSaved === true;
	showTemplatePreview(stored.filenameTemplate || "");
	refreshHistoryCount();
}

initDownloadOptions();
refresh();
