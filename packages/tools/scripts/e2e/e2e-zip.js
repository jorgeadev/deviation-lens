// Drives ZIP downloads, filters, templates and history in real Chrome against a live DeviantArt page.
// Unlike the older e2e logs, every check here is a hard assertion: the script exits non-zero on the first failure.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");
const { parseZip } = require("../lib/zip-reader");

const TOOLS_DIR = path.resolve(__dirname, "../..");
const EXT = path.resolve(TOOLS_DIR, "..", "..", "apps", "extension");
const OUT = path.join(TOOLS_DIR, "out");
const DL = path.join(OUT, "downloads-zip");
const PROFILE = path.join(OUT, "profile-zip");
const PAGE = "https://www.deviantart.com/dutteart/art/Forest-Hobbit-Home-1383355420";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const MISSING_IMAGE = "https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/00000000-0000-0000-0000-000000000000/does-not-exist.png";

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout, label, interval = 300) {
	const t0 = Date.now();
	for (;;) {
		const v = await fn();
		if (v) return v;
		if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
		await sleep(interval);
	}
}

function findChrome() {
	const base = path.join(TOOLS_DIR, "browsers", "chrome");
	if (fs.existsSync(base)) {
		for (const d of fs.readdirSync(base)) {
			const p = path.join(base, d, "chrome-win64", "chrome.exe");
			if (fs.existsSync(p)) return p;
		}
	}
	return CHROME;
}

const downloads = (popup) => popup.evaluate(() => new Promise((res) => chrome.downloads.search({}, res)));

// Waits until a new download has settled, then returns it. `known` holds ids seen by earlier scenarios.
async function nextDownload(popup, known, label) {
	const item = await waitFor(
		async () => {
			const fresh = (await downloads(popup)).filter((d) => !known.has(d.id));
			const bad = fresh.find((d) => d.state === "interrupted");
			if (bad) throw new Error(`${label}: download interrupted: ${bad.error}`);
			return fresh.find((d) => d.state === "complete") || null;
		},
		180000,
		label,
	);
	known.add(item.id);
	return item;
}

async function rememberExisting(popup, known) {
	for (const d of await downloads(popup)) known.add(d.id);
}

function parseCsv(buffer) {
	const text = buffer.toString("utf8");
	assert.equal(text.charCodeAt(0), 0xfeff, "manifest starts with a byte order mark");
	const rows = text
		.slice(1)
		.trimEnd()
		.split("\r\n")
		.map((line) => line.slice(1, -1).split('","'));
	const [header, ...body] = rows;
	return body.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i]])));
}

function isImage(data) {
	const hex = data.subarray(0, 4).toString("hex");
	return hex.startsWith("ffd8") || hex === "89504e47" || data.subarray(0, 4).toString() === "RIFF" || data.subarray(0, 3).toString() === "GIF";
}

// The panel scans the active tab. Opened as a tab it would scan itself, so the artwork tab is brought back to the front,
// which matches the real side panel sitting beside the page.
async function openPanel(browser, extId, artworkTab) {
	const popup = await browser.newPage();
	await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
	await sleep(500);
	await artworkTab.bringToFront();
	return popup;
}

const rowCount = (popup) => popup.evaluate(() => document.querySelectorAll(".row").length);
const waitForRows = (popup) => waitFor(async () => (await rowCount(popup)) || null, 30000, "panel rows");
const setPrefs = (popup, prefs) => popup.evaluate((value) => chrome.storage.local.set(value), prefs);
const click = (popup, selector) => popup.evaluate((s) => document.querySelector(s).click(), selector);
const text = (popup, selector) => popup.evaluate((s) => document.querySelector(s).textContent, selector);

const sendMessage = (popup, message) => popup.evaluate((m) => chrome.runtime.sendMessage(m), message);

async function zipJob(popup, items, zipName) {
	const res = await sendMessage(popup, { type: "DA_DOWNLOAD_ZIP", items, zipName });
	assert.ok(res?.ok, `job started: ${JSON.stringify(res)}`);
	return res.jobId;
}

const jobFinished = (popup, jobId) =>
	waitFor(
		async () => {
			const st = await sendMessage(popup, { type: "OS_STATUS", jobId });
			return st?.finished ? st : null;
		},
		180000,
		"job finished",
	);

(async () => {
	for (const dir of [PROFILE, DL]) fs.rmSync(dir, { recursive: true, force: true });
	fs.mkdirSync(DL, { recursive: true });
	// Set through a profile preference: the DevTools download override would ignore the file names chosen by the extension.
	fs.mkdirSync(path.join(PROFILE, "Default"), { recursive: true });
	fs.writeFileSync(
		path.join(PROFILE, "Default", "Preferences"),
		JSON.stringify({ download: { default_directory: DL, prompt_for_download: false } }),
	);
	const browser = await puppeteer.launch({
		executablePath: findChrome(),
		headless: true,
		args: [
			"--no-sandbox",
			"--disable-gpu",
			"--disable-blink-features=AutomationControlled",
			"--enable-unsafe-extension-debugging",
			`--disable-extensions-except=${EXT}`,
			`--load-extension=${EXT}`,
			`--user-data-dir=${PROFILE}`,
		],
	});
	try {
		const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15000 });
		const extId = new URL(sw.url()).host;

		const tab = await browser.newPage();
		await tab.goto(PAGE, { waitUntil: "networkidle2", timeout: 90000 });
		await sleep(2500);
		log("page:", await tab.title());
		let popup = await openPanel(browser, extId, tab);
		const rows = await waitForRows(popup);
		assert.ok(rows >= 2, `need several variants to test a ZIP, found ${rows}`);
		log("rows:", rows);
		const known = new Set();
		await rememberExisting(popup, known);

		// ---- Download all makes exactly one ZIP.
		await click(popup, "#btnAll");
		const allZip = await nextDownload(popup, known, "Download all ZIP");
		log("zip:", path.basename(allZip.filename), allZip.fileSize);
		assert.match(allZip.filename, /\.zip$/, "Download all saves a .zip");
		assert.match(path.dirname(allZip.filename), /DeviantArt$/, "ZIP is saved in the DeviantArt folder");
		assert.match(path.basename(allZip.filename), /^dutteart_.+_\d+-images_\d{4}-\d{2}-\d{2}\.zip$/i, "ZIP is named after the artist and page");
		await waitFor(async () => /Saved \d+ image/.test(await text(popup, "#progress")), 10000, "completion message");
		log("progress:", await text(popup, "#progress"));
		await sleep(1500);
		assert.equal((await downloads(popup)).filter((d) => !known.has(d.id)).length, 0, "no separate image downloads were started");
		const files = parseZip(fs.readFileSync(allZip.filename));
		const manifestFile = files.find((f) => f.name === "manifest.csv");
		assert.ok(manifestFile, "ZIP contains manifest.csv");
		const images = files.filter((f) => f.name !== "manifest.csv");
		for (const image of images) {
			assert.equal(image.method, 0, "images are stored, not recompressed");
			assert.ok(isImage(image.data), `${image.name} has image contents`);
		}
		const rowsNow = await rowCount(popup);
		const manifest = parseCsv(manifestFile.data);
		assert.equal(manifest.length, rowsNow, "manifest has a row per visible image");
		const saved = manifest.filter((r) => r.status === "saved");
		assert.equal(images.length, saved.length, "every saved manifest row has a file");
		assert.ok(images.length >= 1, "ZIP has at least one image");
		for (const row of manifest) {
			assert.ok(!/token=/.test(row.image_url), "manifest does not keep access tokens");
			assert.match(row.source_page, /deviantart\.com/, "manifest links to the source page");
			assert.equal(row.artist.toLowerCase(), "dutteart", "manifest names the artist");
		}
		log(`PASS Download all: ${images.length} image(s) and a manifest in one ZIP`);

		// ---- Download best stays a plain image.
		await click(popup, "#btnBest");
		const best = await nextDownload(popup, known, "Download best");
		assert.doesNotMatch(best.filename, /\.zip$/, "Download best is not zipped");
		assert.ok(isImage(fs.readFileSync(best.filename)), "Download best saved an image");
		log("PASS Download best: plain file", path.basename(best.filename));

		const goodUrl = await popup.evaluate(() => document.querySelector('.row[data-role="max"], .row[data-role="scaled"], .row').dataset.url);
		const smallUrls = await popup.evaluate(() => Array.from(document.querySelectorAll(".row")).map((r) => r.dataset.url));

		// ---- One failed image does not lose the rest.
		const partial = await jobFinished(
			popup,
			await zipJob(
				popup,
				[
					{ url: goodUrl, filename: "same.png", folder: "DeviantArt", meta: { title: "=HYPERLINK(1)", artist: "a" } },
					{ url: goodUrl, filename: "same.png", folder: "DeviantArt", meta: { title: "dup", artist: "a" } },
					{ url: MISSING_IMAGE, filename: "missing.png", folder: "DeviantArt", meta: { title: "gone", artist: "a" } },
				],
				"partial.zip",
			),
		);
		assert.equal(partial.done, 2, "two images fetched");
		assert.equal(partial.failed, 1, "one image failed");
		assert.equal(partial.failedItems[0].url, MISSING_IMAGE, "failed image is returned for retry");
		const partialZip = await nextDownload(popup, known, "partial ZIP");
		const partialFiles = parseZip(fs.readFileSync(partialZip.filename));
		assert.deepEqual(partialFiles.map((f) => f.name).sort(), ["manifest.csv", "same (2).png", "same.png"], "duplicate names are numbered");
		const partialManifest = parseCsv(partialFiles.find((f) => f.name === "manifest.csv").data);
		assert.equal(partialManifest.find((r) => r.status === "failed").title, "gone", "failure is listed in the manifest");
		assert.equal(partialManifest[0].title, "'=HYPERLINK(1)", "formula-like titles are neutralised");
		log("PASS partial failure:", partial.firstError);

		// ---- If nothing can be fetched, no ZIP is saved.
		const failed = await jobFinished(
			popup,
			await zipJob(popup, [{ url: MISSING_IMAGE, filename: "x.png", folder: "DeviantArt", meta: {} }], "none.zip"),
		);
		assert.ok(failed.error, "all-failed job reports an error");
		await sleep(1000);
		assert.equal((await downloads(popup)).filter((d) => !known.has(d.id)).length, 0, "all-failed job saves nothing");
		log("PASS all failed:", failed.error);

		// ---- Cancelling stops the job and saves nothing.
		const many = Array.from({ length: 30 }, (_, i) => ({ url: goodUrl, filename: `c${i}.png`, folder: "DeviantArt", meta: {} }));
		const cancelId = await zipJob(popup, many, "cancelled.zip");
		await sleep(600);
		await sendMessage(popup, { type: "OS_CANCEL", jobId: cancelId });
		const cancelled = await jobFinished(popup, cancelId);
		assert.equal(cancelled.cancelled, true, "job reports cancelled");
		assert.ok(cancelled.done < many.length, "job stopped early");
		await sleep(1000);
		assert.equal((await downloads(popup)).filter((d) => !known.has(d.id)).length, 0, "cancelled job saves nothing");
		log(`PASS cancel: stopped after ${cancelled.done}/${many.length}`);

		// ---- A job survives the panel closing, and a reopened panel picks it back up.
		const resumed = Array.from({ length: 12 }, (_, i) => ({ url: goodUrl, filename: `r${i}.png`, folder: "DeviantArt", meta: {} }));
		await zipJob(popup, resumed, "resumed.zip");
		await popup.close();
		await sleep(500);
		popup = await openPanel(browser, extId, tab);
		await waitFor(
			() => popup.evaluate(() => !document.querySelector("#btnCancelJob").classList.contains("hidden")),
			10000,
			"Cancel shown after reopening",
		);
		const resumedZip = await nextDownload(popup, known, "ZIP after reopening the panel");
		assert.equal(parseZip(fs.readFileSync(resumedZip.filename)).length, resumed.length + 1, "resumed ZIP is complete");
		await waitFor(
			() => popup.evaluate(() => document.querySelector("#btnCancelJob").classList.contains("hidden")),
			10000,
			"Cancel hidden after finishing",
		);
		log("PASS panel closed mid-job");
		await waitForRows(popup);

		// ---- The panel's own controls: the failure notice, its retry button, and Cancel.
		await popup.evaluate(
			(good, missing) =>
				startBatch(
					[
						{ url: good, filename: "ui-good.png", folder: "DeviantArt", meta: {} },
						{ url: missing, filename: "ui-missing.png", folder: "DeviantArt", meta: {} },
					],
					"UI test",
				),
			goodUrl,
			MISSING_IMAGE,
		);
		await nextDownload(popup, known, "ZIP from the panel with one bad image");
		await waitFor(() => popup.evaluate(() => !!document.querySelector("#notice .noticeAction")), 15000, "retry button");
		assert.match(await text(popup, "#notice"), /1 image\(s\) could not be added/, "panel reports the failure");
		await click(popup, "#notice .noticeAction");
		// The browser accepts the separate download and reports the 404 on the download itself, so the item ends up interrupted.
		await waitFor(async () => /done: 1\/1/.test(await text(popup, "#progress")), 30000, "retry as a separate file");
		await waitFor(
			async () => (await downloads(popup)).some((d) => !known.has(d.id) && d.state === "interrupted"),
			30000,
			"retried download to settle",
		);
		assert.equal(await popup.evaluate(() => document.querySelector("#notice").classList.contains("hidden")), true, "retry clears the notice");
		for (const d of await downloads(popup)) known.add(d.id);
		log("PASS panel failure notice and retry:", await text(popup, "#progress"));

		await popup.evaluate(
			(good) =>
				startBatch(
					Array.from({ length: 30 }, (_, i) => ({ url: good, filename: `u${i}.png`, folder: "DeviantArt", meta: {} })),
					"UI test",
				),
			goodUrl,
		);
		await waitFor(() => popup.evaluate(() => !document.querySelector("#btnCancelJob").classList.contains("hidden")), 5000, "Cancel button");
		assert.equal(await popup.evaluate(() => document.querySelector("#btnAll").disabled), true, "Download all is disabled during a job");
		await click(popup, "#btnCancelJob");
		await waitFor(async () => /cancelled/.test(await text(popup, "#progress")), 15000, "cancelled message");
		assert.equal(await popup.evaluate(() => document.querySelector("#btnAll").disabled), false, "Download all is enabled again");
		await sleep(800);
		assert.equal((await downloads(popup)).filter((d) => !known.has(d.id)).length, 0, "Cancel button saves nothing");
		log("PASS panel Cancel button");

		// ---- The minimum-size filter hides small images but keeps unknown sizes.
		const before = await rowCount(popup);
		const dims = await popup.evaluate(() => Array.from(document.querySelectorAll(".dims")).map((d) => d.textContent));
		await popup.select("#selMinSize", "3840");
		await sleep(300);
		const filtered = await rowCount(popup);
		log(`filter: ${before} -> ${filtered} rows, dims ${dims.join(" | ")}`);
		assert.ok(filtered < before, "4K+ filter hides smaller images");
		assert.equal(await popup.evaluate(() => chrome.storage.local.get("minSize").then((s) => s.minSize)), 3840, "filter is saved");
		if (!filtered) assert.match(await text(popup, "#list"), /No images match your filters/, "empty filter explains itself");
		await popup.select("#selMinSize", "0");
		await sleep(300);
		assert.equal(await rowCount(popup), before, "clearing the filter restores rows");
		log("PASS minimum-size filter");

		// ---- Filename templates create folders inside the ZIP.
		await setPrefs(popup, { filenameTemplate: "{artist}/{width}x{height}_{title}" });
		await sleep(300);
		await click(popup, "#btnAll");
		const templated = parseZip(fs.readFileSync((await nextDownload(popup, known, "templated ZIP")).filename));
		const templatedNames = templated.map((f) => f.name).filter((n) => n !== "manifest.csv");
		for (const name of templatedNames) assert.match(name, /^dutteart\/\d+x\d+_.+\.\w+$/i, `template applied to ${name}`);
		log("PASS template:", templatedNames[0]);
		await setPrefs(popup, { filenameTemplate: "{artist}/{title}" });
		await sleep(300);
		await click(popup, "#btnBest");
		const templatedBest = await nextDownload(popup, known, "templated single file");
		assert.match(templatedBest.filename.replaceAll("\\", "/"), /DeviantArt\/dutteart\/[^/]+$/i, "template folders apply to single files");
		log("PASS template on a single file:", templatedBest.filename.split(/[/\\]/).slice(-3).join("/"));
		await setPrefs(popup, { filenameTemplate: "" });
		await sleep(300);

		// ---- With the ZIP setting off, separate files come back.
		await setPrefs(popup, { zipDownloads: false });
		await sleep(300);
		const visible = await rowCount(popup);
		await click(popup, "#btnAll");
		await waitFor(
			async () => (await downloads(popup)).filter((d) => !known.has(d.id) && d.state === "complete").length >= visible,
			180000,
			"separate files",
		);
		const separate = (await downloads(popup)).filter((d) => !known.has(d.id));
		for (const d of separate) {
			known.add(d.id);
			assert.doesNotMatch(d.filename, /\.zip$/, "no ZIP when the setting is off");
		}
		log(`PASS ZIP off: ${separate.length} separate files`);
		await setPrefs(popup, { zipDownloads: true });
		await sleep(300);

		// ---- History is opt-in: nothing was recorded by any download above.
		const historyCount = () => popup.evaluate(() => globalThis.DeviationLens.history.count());
		assert.equal(await historyCount(), 0, "nothing is recorded while the setting is off");
		await setPrefs(popup, { rememberSaved: true });
		await sleep(300);
		assert.equal(await popup.evaluate(() => document.querySelectorAll(".chip.saved").length), 0, "no Saved chips yet");
		await click(popup, "#btnBest");
		await nextDownload(popup, known, "best with history on");
		await waitFor(() => popup.evaluate(() => document.querySelectorAll(".chip.saved").length > 0), 15000, "Saved chips");
		assert.equal(await historyCount(), 1, "one artwork recorded");
		await click(popup, "#btnAll");
		await waitFor(async () => /already saved/.test(await text(popup, "#notice")), 5000, "already-saved notice");
		await sleep(1500);
		assert.equal((await downloads(popup)).filter((d) => !known.has(d.id)).length, 0, "Download all skips saved artwork");
		log("notice:", await text(popup, "#notice"));
		await click(popup, "#btnBest");
		await nextDownload(popup, known, "explicit re-download");
		log("PASS history: recorded, marked, skipped in bulk, still available explicitly");

		// ---- A failed save is not recorded as saved.
		await popup.evaluate(() => globalThis.DeviationLens.history.clear());
		await jobFinished(
			popup,
			await zipJob(popup, [{ url: MISSING_IMAGE, filename: "x.png", folder: "DeviantArt", meta: { historyKey: "never-saved" } }], "none.zip"),
		);
		assert.equal(await historyCount(), 0, "failed images are not remembered");
		await setPrefs(popup, { rememberSaved: false });
		await sleep(300);
		log("PASS failed saves are not remembered");

		// ---- Custom folder mode writes from the offscreen document. An origin-private folder stands in for a picked one.
		await popup.evaluate(async () => {
			const root = await navigator.storage.getDirectory();
			await new Promise((resolve, reject) => {
				const req = indexedDB.open("da-image-hunter", 1);
				req.onupgradeneeded = () => req.result.createObjectStore("handles");
				req.onerror = () => reject(req.error);
				req.onsuccess = () => {
					const tx = req.result.transaction("handles", "readwrite");
					tx.objectStore("handles").put(root, "folder");
					tx.oncomplete = () => {
						req.result.close();
						resolve();
					};
					tx.onerror = () => reject(tx.error);
				};
			});
			await chrome.storage.local.set({ saveMode: "custom", folderName: "test" });
		});
		const customItems = smallUrls.slice(0, 2).map((url, i) => ({ url, filename: `custom${i}.png`, folder: "DeviantArt", meta: {} }));
		for (const round of [1, 2]) {
			const st = await jobFinished(popup, await zipJob(popup, customItems, "custom.zip"));
			assert.equal(st.error, "", `custom folder write ${round}: ${st.error}`);
		}
		const customNames = await popup.evaluate(async () => {
			const root = await navigator.storage.getDirectory();
			const names = [];
			for await (const name of root.keys()) names.push(name);
			return names.sort();
		});
		assert.deepEqual(customNames, ["custom (2).zip", "custom.zip"], "custom folder keeps both ZIPs rather than overwriting");
		const customBytes = await popup.evaluate(async () => {
			const root = await navigator.storage.getDirectory();
			const file = await (await root.getFileHandle("custom.zip")).getFile();
			return Array.from(new Uint8Array(await file.arrayBuffer()));
		});
		assert.equal(parseZip(Buffer.from(customBytes)).length, customItems.length + 1, "custom folder ZIP is complete");
		assert.equal((await downloads(popup)).filter((d) => !known.has(d.id)).length, 0, "custom mode does not use the downloads API");
		await setPrefs(popup, { saveMode: "default" });
		log("PASS custom folder: ZIP written from the offscreen document without overwriting");

		// ---- The offscreen document closes once idle.
		const offscreenOpen = () =>
			popup.evaluate(() => chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] }).then((c) => c.length > 0));
		assert.equal(await offscreenOpen(), true, "offscreen document open after a job");
		await waitFor(async () => !(await offscreenOpen()), 75000, "offscreen document to close", 2000);
		log("PASS offscreen document closes when idle");

		log("ALL ZIP CHECKS PASSED");
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error("E2E FAILED:", e);
	process.exit(1);
});
