const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const path = require("node:path");
const TOOLS_DIR = path.resolve(__dirname, "../..");

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
		args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=${path.join(OUT, "profile-reveal")}`],
	});
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1600, height: 1000 });
		await page.goto("https://www.deviantart.com/dutteart/art/Forest-Hobbit-Home-1383355420", { waitUntil: "networkidle2", timeout: 90000 });
		await sleep(3000);

		const info = await page.evaluate(() => {
			let best = null;
			let area = 0;
			for (const img of document.querySelectorAll("img")) {
				const v = /images-wixmp[^/]*\.wixmp\.com/.test(img.currentSrc || img.src || "");
				if (!v || img.closest("a")) continue;
				const r = img.getBoundingClientRect();
				if (r.width * r.height > area) {
					area = r.width * r.height;
					best = {
						x: r.x + r.width / 2,
						y: r.y + r.height / 2,
						w: img.naturalWidth,
						h: img.naturalHeight,
						cls: (`${img.className}`).slice(0, 60),
					};
				}
			}
			if (!best) return null;
			best.scrollIntoView = null;
			const _r = document.querySelectorAll("img")[0].getBoundingClientRect();
			const hit = document.elementFromPoint(best.x, best.y);
			return {
				...best,
				hit: hit ? `${hit.tagName}.${(`${hit.className}`).slice(0, 70)}` : null,
				imgs: document.querySelectorAll("img").length,
			};
		});
		console.log("target:", JSON.stringify(info));

		await page.evaluate(() => window.scrollTo(0, 0));
		await sleep(500);
		const info2 = await page.evaluate(() => {
			let best = null;
			let area = 0;
			for (const img of document.querySelectorAll("img")) {
				const v = /images-wixmp[^/]*\.wixmp\.com/.test(img.currentSrc || img.src || "");
				if (!v || img.closest("a")) continue;
				const r = img.getBoundingClientRect();
				if (r.width * r.height > area) {
					area = r.width * r.height;
					best = { x: r.x + r.width / 2, y: r.y + r.height / 2, w: img.naturalWidth, h: img.naturalHeight };
				}
			}
			return best ? { ...best, imgs: document.querySelectorAll("img").length } : null;
		});
		console.log("target2:", JSON.stringify(info2));
		if (info2) {
			await page.mouse.click(info2.x, info2.y);
			await sleep(4000);
			const after = await page.evaluate(() => ({
				imgs: document.querySelectorAll("img").length,
				big: Array.from(document.querySelectorAll("img"))
					.filter((i) => (i.naturalWidth || 0) >= 1280)
					.map((i) => ({
						w: i.naturalWidth,
						h: i.naturalHeight,
						cls: (`${i.className}`).slice(0, 60),
						src: (i.currentSrc || i.src).slice(0, 120),
					})),
				portals: document.querySelectorAll(".ReactModalPortal").length,
				dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).length,
			}));
			console.log("after REAL click:", JSON.stringify(after, null, 1));
			await page.keyboard.press("Escape");
		}
	} finally {
		await browser.close();
	}
})();
