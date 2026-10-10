const puppeteer = require("puppeteer-core");
const path = require("node:path");
const TOOLS_DIR = path.resolve(__dirname, "../..");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EXT = path.resolve(TOOLS_DIR, "..", "..", "apps", "extension");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
	const browser = await puppeteer.launch({
		executablePath: CHROME,
		headless: true,
		args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-extension-debugging"],
	});
	await sleep(1500);
	try {
		const client = await browser.target().createCDPSession();
		const res = await client.send("Extensions.loadUnpacked", { path: EXT });
		console.log("loadUnpacked result:", JSON.stringify(res));
	} catch (e) {
		console.log("loadUnpacked error:", e.message);
	}
	await sleep(6000);
	const targets = browser.targets().map((t) => ({ type: t.type(), url: t.url().slice(0, 120) }));
	console.log("TARGETS after loadUnpacked:");
	targets.forEach((t) => { console.log(" ", JSON.stringify(t)); });
	await browser.close();
})();
