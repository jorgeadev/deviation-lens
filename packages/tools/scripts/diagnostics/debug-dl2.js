const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const path = require("node:path");
const TOOLS_DIR = path.resolve(__dirname, "../..");

const EXT = path.resolve(TOOLS_DIR, "..", "..", "apps", "extension");
const OUT = path.join(TOOLS_DIR, "out");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
	const base = path.join(TOOLS_DIR, "browsers", "chrome");
	for (const d of fs.readdirSync(base)) {
		const p = path.join(base, d, "chrome-win64", "chrome.exe");
		if (fs.existsSync(p)) return p;
	}
	return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
}

(async () => {
	const maxUrl = process.env.MAXURL;
	let url = maxUrl;
	const browser = await puppeteer.launch({
		executablePath: findChrome(),
		headless: true,
		args: [
			"--no-sandbox",
			"--disable-gpu",
			`--disable-extensions-except=${EXT}`,
			`--load-extension=${EXT}`,
			`--user-data-dir=${path.join(OUT, "profile-dl2")}`,
		],
	});
	try {
		const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15000 });
		const extId = new URL(sw.url()).host;
		const popup = await browser.newPage();
		await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "domcontentloaded" });

		if (!url) {
			const forest = await browser.newPage();
			await forest.goto("https://www.deviantart.com/dutteart/art/Forest-Hobbit-Home-1383355420", { waitUntil: "networkidle2", timeout: 90000 });
			await sleep(2000);
			await popup.reload({ waitUntil: "domcontentloaded" });
			await sleep(5000);
			url = await popup.evaluate(() => {
				const r = document.querySelector('.row[data-role="max"]');
				return r ? r.dataset.url : null;
			});
		}
		console.log("url ok:", !!url);

		const res = await popup.evaluate(async (u) => {
			const id = await new Promise((r) =>
				chrome.downloads.download({ url: u, filename: "DeviantArt/subdir test 123.png", conflictAction: "uniquify" }, r),
			);
			await new Promise((r) => setTimeout(r, 3000));
			const items = await new Promise((r) => chrome.downloads.search({ id }, r));
			return items[0] ? { state: items[0].state, filename: items[0].filename, error: items[0].error } : null;
		}, url);
		console.log("NO CDP OVERRIDE:", JSON.stringify(res));
	} finally {
		await browser.close();
	}
})();
