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
	const browser = await puppeteer.launch({
		executablePath: findChrome(),
		headless: true,
		args: [
			"--no-sandbox",
			"--disable-gpu",
			`--disable-extensions-except=${EXT}`,
			`--load-extension=${EXT}`,
			`--user-data-dir=${path.join(OUT, "profile-dump")}`,
		],
	});
	try {
		const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15000 });
		const extId = new URL(sw.url()).host;
		const target = await browser.newPage();
		await target.goto("https://www.deviantart.com/nachr/art/Hobbit-Hole-1079563018", { waitUntil: "networkidle2", timeout: 90000 });
		await sleep(3000);
		const popup = await browser.newPage();
		await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "domcontentloaded" });
		await sleep(3000);
		const scan = await popup.evaluate(async () => {
			const tabs = await new Promise((r) => chrome.tabs.query({ url: "*://*.deviantart.com/*" }, r));
			const tab = tabs[tabs.length - 1];
			return await new Promise((r) => chrome.tabs.sendMessage(tab.id, { type: "DA_SCAN" }, r));
		});
		for (const asset of scan.assets) {
			console.log("ASSET", asset.base.slice(-40), "caps", JSON.stringify(asset.caps));
			for (const img of asset.images) {
				console.log(` ${img.role.padEnd(9)} q=${String(img.q).padEnd(3)} ${img.w}x${img.h} ${img.url}`);
			}
		}
	} finally {
		await browser.close();
	}
})();
