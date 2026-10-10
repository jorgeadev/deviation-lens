const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const path = require("node:path");
const TOOLS_DIR = path.resolve(__dirname, "../..");
const zlib = require("node:zlib");

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

function decodePng(buf) {
	let pos = 8;
	let width = 0;
	let height = 0;
	let colorType = 6;
	const idat = [];
	while (pos < buf.length) {
		const len = buf.readUInt32BE(pos);
		const type = buf.toString("ascii", pos + 4, pos + 8);
		const data = buf.subarray(pos + 8, pos + 8 + len);
		if (type === "IHDR") {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			colorType = data[9];
		} else if (type === "IDAT") {
			idat.push(data);
		} else if (type === "IEND") break;
		pos += 12 + len;
	}
	const raw = zlib.inflateSync(Buffer.concat(idat));
	const bpp = colorType === 2 ? 3 : 4;
	const stride = width * bpp;
	const out = Buffer.alloc(height * stride);
	let rp = 0;
	for (let y = 0; y < height; y++) {
		const filter = raw[rp++];
		const line = raw.subarray(rp, rp + stride);
		rp += stride;
		const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
		const cur = out.subarray(y * stride, (y + 1) * stride);
		for (let x = 0; x < stride; x++) {
			const a = x >= bpp ? cur[x - bpp] : 0;
			const b = prev[x];
			const c = x >= bpp ? prev[x - bpp] : 0;
			let v = line[x];
			if (filter === 1) v = (v + a) & 255;
			else if (filter === 2) v = (v + b) & 255;
			else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
			else if (filter === 4) {
				const p = a + b - c;
				const pa = Math.abs(p - a);
				const pb = Math.abs(p - b);
				const pc = Math.abs(p - c);
				v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
			}
			cur[x] = v;
		}
	}
	return {
		width,
		height,
		px(x, y) {
			const i = y * stride + x * bpp;
			return [out[i], out[i + 1], out[i + 2]];
		},
	};
}

const hex = (p) => `#${p.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

async function waitRows(page, min) {
	for (let i = 0; i < 60; i++) {
		if (await page.evaluate((m) => document.querySelectorAll(".row").length >= m, min)) return;
		await sleep(500);
	}
	throw new Error("rows did not render");
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
			`--user-data-dir=${path.join(OUT, "visual-check")}`,
		],
	});
	try {
		const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15000 });
		const extId = new URL(sw.url()).host;
		const popupUrl = `chrome-extension://${extId}/popup.html`;

		const forest = await browser.newPage();
		await forest.goto("https://www.deviantart.com/dutteart/art/Forest-Hobbit-Home-1383355420", { waitUntil: "networkidle2", timeout: 90000 });
		await sleep(2000);
		const popup = await browser.newPage();
		await popup.setViewport({ width: 540, height: 600 });
		await popup.goto(popupUrl, { waitUntil: "domcontentloaded" });
		await waitRows(popup, 1);
		await sleep(1500);
		const m = await popup.evaluate(() => {
			const doc = document.scrollingElement;
			return {
				radius: getComputedStyle(document.querySelector("#app")).borderRadius,
				outer: doc.scrollHeight > doc.clientHeight + 1,
				count: document.querySelector(".listCount").textContent,
			};
		});
		log("forest:", JSON.stringify(m));
		log("ASSERT forest no outer scroll:", !m.outer);
		log("ASSERT forest count bar:", m.count.includes("Showing 1 of 1 asset"));

		const shot = await popup.screenshot({ path: path.join(OUT, "popup_corners.png") });
		const img = decodePng(Buffer.from(shot));
		const pts = [
			[0, 0],
			[1, 1],
			[3, 3],
			[6, 6],
			[9, 9],
			[13, 13],
			[16, 16],
			[24, 24],
			[270, 0],
			[539, 0],
			[539, 599],
			[0, 599],
			[270, 599],
		];
		log("pixels:", pts.map(([x, y]) => `(${x},${y})=${hex(img.px(x, y))}`).join(" "));
		const cornerSum = img.px(0, 0).reduce((a, b) => a + b, 0) + img.px(6, 6).reduce((a, b) => a + b, 0);
		const cornerWhite = [img.px(0, 0), img.px(3, 3), img.px(6, 6)].some((p) => p.every((v) => v > 200));
		log("ASSERT corners dark (no white crescent):", !cornerWhite, `sum=${cornerSum}`);

		const profile = await browser.newPage();
		await profile.goto("https://www.deviantart.com/dutteart", { waitUntil: "networkidle2", timeout: 90000 });
		await sleep(2500);
		const popup2 = await browser.newPage();
		await popup2.setViewport({ width: 540, height: 600 });
		await popup2.goto(popupUrl, { waitUntil: "domcontentloaded" });
		await waitRows(popup2, 5);
		await sleep(2000);

		const total = await popup2.evaluate(() => state.data.assets.length);
		const count0 = await popup2.evaluate(() => document.querySelector(".listCount").textContent);
		log(`profile: assets=${total}`);
		log("count bar:", count0);
		log("ASSERT count shows totals:", count0.includes(`of ${total} asset`));

		await popup2.evaluate(() => {
			state.renderLimit = 2;
			renderList();
		});
		await sleep(200);
		const state1 = await popup2.evaluate(() => ({
			count: document.querySelector(".listCount").textContent,
			more: !!document.querySelector(".loadMore .btn"),
			moreText: document.querySelector(".loadMore .btn") ? document.querySelector(".loadMore .btn").textContent : "",
		}));
		log("paginated:", JSON.stringify(state1));
		log("ASSERT load-more shown:", state1.more && state1.count.includes("Showing 2 of"));

		await popup2.click(".loadMore .btn");
		await sleep(300);
		const state2 = await popup2.evaluate(() => ({
			count: document.querySelector(".listCount").textContent,
			more: !!document.querySelector(".loadMore .btn"),
		}));
		log("after load-more:", JSON.stringify(state2));
		log("ASSERT all loaded:", !state2.more && state2.count.includes(`Showing ${total} of ${total}`));
		await popup2.screenshot({ path: path.join(OUT, "popup_pagination.png") });
		log("DONE");
	} catch (e) {
		log("ERROR", (e?.message) || e);
		process.exitCode = 1;
	} finally {
		await browser.close();
	}
})();
