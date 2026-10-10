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

const state = (page) =>
	page.evaluate(() => ({
		pickerType: typeof window.showDirectoryPicker,
		pickDisabled: document.querySelector("#btnPick").disabled,
		customDisabled: document.querySelector('input[name="mode"][value="custom"]').disabled,
		noteHidden: document.querySelector("#fsNote").classList.contains("hidden"),
		checked: Array.from(document.querySelectorAll('input[name="mode"]')).find((r) => r.checked)?.value,
		cur: document.querySelector("#curMode").textContent,
	}));

(async () => {
	const browser = await puppeteer.launch({
		executablePath: findChrome(),
		headless: true,
		args: [
			"--no-sandbox",
			"--disable-gpu",
			`--disable-extensions-except=${EXT}`,
			`--load-extension=${EXT}`,
			`--user-data-dir=${path.join(OUT, "fs-check")}`,
		],
	});
	try {
		const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15000 });
		const extId = new URL(sw.url()).host;
		const url = `chrome-extension://${extId}/saver.html`;

		const okPage = await browser.newPage();
		await okPage.goto(url, { waitUntil: "domcontentloaded" });
		const okState = await state(okPage);
		log("SUPPORTED browser:", JSON.stringify(okState));
		log("ASSERT supported: picker enabled, note hidden:", okState.pickDisabled === false && okState.noteHidden === true);

		const noPage = await browser.newPage();
		await noPage.evaluateOnNewDocument(() => {
			Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
		});
		await noPage.goto(url, { waitUntil: "domcontentloaded" });
		await noPage.evaluate(() => chrome.storage.local.set({ saveMode: "custom", folderName: "Leftover" }));
		await noPage.reload({ waitUntil: "domcontentloaded" });
		await sleep(500);
		const noState = await state(noPage);
		log("UNSUPPORTED browser:", JSON.stringify(noState));
		log(
			"ASSERT unsupported: note shown, custom disabled, reset to default:",
			noState.noteHidden === false && noState.customDisabled === true && noState.checked === "default",
		);
		await noPage.click("#btnPick");
		await sleep(300);
		const status = await noPage.evaluate(() => document.querySelector("#status").textContent);
		log("ASSERT friendly message on click:", /does not allow choosing a folder/i.test(status));
		log("status:", status.slice(0, 120));
		log("DONE");
	} catch (e) {
		log("ERROR", (e?.message) || e);
		process.exitCode = 1;
	} finally {
		await browser.close();
	}
})();
