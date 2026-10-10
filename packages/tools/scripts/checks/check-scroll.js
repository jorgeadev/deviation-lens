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

async function metrics(popup, label) {
	const m = await popup.evaluate(() => {
		const doc = document.scrollingElement;
		const list = document.querySelector(".list");
		return {
			docScrollHeight: doc.scrollHeight,
			docClientHeight: doc.clientHeight,
			bodyScrollHeight: document.body.scrollHeight,
			bodyClientHeight: document.body.clientHeight,
			listScrollHeight: list.scrollHeight,
			listClientHeight: list.clientHeight,
			listScrolls: list.scrollHeight > list.clientHeight + 1,
			outerScrolls: doc.scrollHeight > doc.clientHeight + 1,
		};
	});
	log(
		`${label}: outerScrolls=${m.outerScrolls} listScrolls=${m.listScrolls} doc=${m.docScrollHeight}/${m.docClientHeight} list=${m.listScrollHeight}/${m.listClientHeight}`,
	);
	return m;
}

(async () => {
	fs.rmSync(path.join(OUT, "scroll-check"), { recursive: true, force: true });
	const browser = await puppeteer.launch({
		executablePath: findChrome(),
		headless: true,
		args: [
			"--no-sandbox",
			"--disable-gpu",
			`--disable-extensions-except=${EXT}`,
			`--load-extension=${EXT}`,
			`--user-data-dir=${path.join(OUT, "scroll-check")}`,
		],
	});
	try {
		const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15000 });
		const extId = new URL(sw.url()).host;

		const forest = await browser.newPage();
		await forest.goto("https://www.deviantart.com/dutteart/art/Forest-Hobbit-Home-1383355420", { waitUntil: "networkidle2", timeout: 90000 });
		await sleep(2000);
		const popup1 = await browser.newPage();
		await popup1.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "domcontentloaded" });
		for (let i = 0; i < 40; i++) {
			if ((await popup1.evaluate(() => document.querySelectorAll(".row").length)) > 0) break;
			await sleep(500);
		}
		const m1 = await metrics(popup1, "forest(13 rows)");
		log("ASSERT forest no outer scroll:", !m1.outerScrolls);

		const profile = await browser.newPage();
		await profile.goto("https://www.deviantart.com/dutteart", { waitUntil: "networkidle2", timeout: 90000 });
		await sleep(2500);
		const popup2 = await browser.newPage();
		await popup2.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "domcontentloaded" });
		for (let i = 0; i < 60; i++) {
			if ((await popup2.evaluate(() => document.querySelectorAll(".row").length)) > 5) break;
			await sleep(500);
		}
		const m2 = await metrics(popup2, "profile(106 rows)");
		log("ASSERT profile no outer scroll:", !m2.outerScrolls);
		log("ASSERT profile list scrolls internally:", m2.listScrolls);
		await popup2.screenshot({ path: path.join(OUT, "scroll_check.png") });
		log("DONE");
	} catch (e) {
		log("ERROR", (e?.message) || e);
		process.exitCode = 1;
	} finally {
		await browser.close();
	}
})();
