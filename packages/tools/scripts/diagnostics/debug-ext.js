const puppeteer = require("puppeteer-core");
const path = require("node:path");
const TOOLS_DIR = path.resolve(__dirname, "../..");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EXT = path.resolve(TOOLS_DIR, "..", "..", "apps", "extension");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
	console.log("EXT =", EXT);
	const browser = await puppeteer.launch({
		executablePath: CHROME,
		headless: true,
		dumpio: true,
		args: ["--no-sandbox", "--disable-gpu", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
	});
	await sleep(8000);
	const targets = browser.targets().map((t) => ({ type: t.type(), url: t.url().slice(0, 120) }));
	console.log("TARGETS:");
	targets.forEach((t) => { console.log(" ", JSON.stringify(t)); });
	const pages = await browser.pages();
	const p = pages[0] || (await browser.newPage());
	try {
		const _info = await p.goto("chrome://extensions/", { waitUntil: "domcontentloaded", timeout: 15000 });
		await sleep(2500);
		const txt = await p.evaluate(() => document.body.innerText.slice(0, 3000));
		console.log("EXTENSIONS PAGE TEXT:\n", txt);
	} catch (e) {
		console.log("extensions page error:", e.message);
	}
	await browser.close();
})();
