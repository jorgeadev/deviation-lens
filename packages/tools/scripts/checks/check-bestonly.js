const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const path = require("node:path");
const TOOLS_DIR = path.resolve(__dirname, "../..");

const EXT = path.resolve(TOOLS_DIR, "..", "..", "apps", "extension");
const OUT = path.join(TOOLS_DIR, "out");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function findChrome() {
	const base = path.join(TOOLS_DIR, "browsers", "chrome");
	for (const d of fs.readdirSync(base)) {
		const p = path.join(base, d, "chrome-win64", "chrome.exe");
		if (fs.existsSync(p)) return p;
	}
	return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
}

async function waitRows(page, min) {
	for (let i = 0; i < 60; i++) {
		if (await page.evaluate((m) => document.querySelectorAll(".row").length >= m, min)) return;
		await sleep(500);
	}
	throw new Error("rows did not render");
}

(async () => {
	fs.rmSync(path.join(OUT, "bestonly-check"), { recursive: true, force: true });
	const browser = await puppeteer.launch({
		executablePath: findChrome(),
		headless: true,
		args: [
			"--no-sandbox",
			"--disable-gpu",
			`--disable-extensions-except=${EXT}`,
			`--load-extension=${EXT}`,
			`--user-data-dir=${path.join(OUT, "bestonly-check")}`,
		],
	});
	try {
		const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15000 });
		const extId = new URL(sw.url()).host;
		const popupUrl = `chrome-extension://${extId}/popup.html`;

		const profile = await browser.newPage();
		await profile.goto("https://www.deviantart.com/dutteart", { waitUntil: "networkidle2", timeout: 90000 });
		await sleep(2500);

		const popup1 = await browser.newPage();
		await popup1.setViewport({ width: 540, height: 600 });
		await popup1.goto(popupUrl, { waitUntil: "domcontentloaded" });
		await waitRows(popup1, 5);
		await sleep(1500);
		const first = await popup1.evaluate(() => ({
			checked: document.querySelector("#chkBest").checked,
			rows: document.querySelectorAll(".row").length,
			assets: state.data.assets.length,
		}));
		log("first open:", JSON.stringify(first));
		log("ASSERT initially unchecked:", first.checked === false);

		await popup1.evaluate(() => {
			const cb = document.querySelector("#chkBest");
			cb.checked = true;
			cb.dispatchEvent(new Event("change"));
		});
		await sleep(400);
		const afterCheck = await popup1.evaluate(() => ({
			rows: document.querySelectorAll(".row").length,
			stored: undefined,
		}));
		const stored1 = await popup1.evaluate(() => new Promise((r) => chrome.storage.local.get("bestOnly", r)));
		log("after check:", JSON.stringify(afterCheck), "storage:", JSON.stringify(stored1));
		log("ASSERT rows reduced to best-only:", afterCheck.rows === first.assets);
		log("ASSERT stored true:", stored1.bestOnly === true);

		await popup1.close();
		await sleep(300);

		const popup2 = await browser.newPage();
		await popup2.setViewport({ width: 540, height: 600 });
		await popup2.goto(popupUrl, { waitUntil: "domcontentloaded" });
		await waitRows(popup2, 1);
		await sleep(2000);
		const second = await popup2.evaluate(() => ({
			checked: document.querySelector("#chkBest").checked,
			rows: document.querySelectorAll(".row").length,
			assets: state.data.assets.length,
		}));
		log("second open (new popup):", JSON.stringify(second));
		log("ASSERT checkbox restored checked:", second.checked === true);
		log("ASSERT best-only applied automatically:", second.rows === second.assets && second.assets < first.rows);

		await popup2.evaluate(() => {
			const cb = document.querySelector("#chkBest");
			cb.checked = false;
			cb.dispatchEvent(new Event("change"));
		});
		await sleep(300);
		const stored2 = await popup2.evaluate(() => new Promise((r) => chrome.storage.local.get("bestOnly", r)));
		log("ASSERT uncheck persists false:", stored2.bestOnly === false);
		await popup2.screenshot({ path: path.join(OUT, "bestonly.png") });
		log("DONE");
	} catch (e) {
		log("ERROR", (e?.message) || e);
		process.exitCode = 1;
	} finally {
		await browser.close();
	}
})();
