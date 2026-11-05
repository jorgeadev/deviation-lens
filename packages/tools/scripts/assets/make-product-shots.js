// Builds the website images and Chrome Web Store screenshots for the current version.
//   apps/web/assets/<version>/*.png        1600 x 1000, used by the website
//   apps/web/assets/<version>/store/*.jpg  1280 x 800, uploaded to the store
// The panels are captures of the real extension UI. Their contents are sample data, and the artwork is the
// project's own illustrations in sample-art/, so no third-party artwork appears. Run this when the UI changes.
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const TOOLS_DIR = path.resolve(__dirname, "../..");
const ROOT = path.resolve(TOOLS_DIR, "..", "..");
const EXT = path.join(ROOT, "apps", "extension");
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const OUT = path.join(ROOT, "apps", "web", "assets", version);
const PROFILE = path.join(TOOLS_DIR, "out", "profile-product-shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;
const art = (name) => dataUrl(path.join(__dirname, "sample-art", name), "image/jpeg");
const ICON = dataUrl(path.join(EXT, "icons", "icon128.png"), "image/png");

function findChrome() {
	const base = path.join(TOOLS_DIR, "browsers", "chrome");
	for (const d of fs.readdirSync(base)) {
		const p = path.join(base, d, "chrome-win64", "chrome.exe");
		if (fs.existsSync(p)) return p;
	}
	throw new Error("No test browser found in packages/tools/browsers.");
}

function image(base, w, h, role, roleLabel, q) {
	return {
		url: `${base}/${w}.png`,
		w,
		h,
		role,
		roleLabel,
		q,
		ext: "png",
		tier: w >= 3840 ? "4K+" : w >= 2560 ? "QHD+" : w >= 1920 ? "FHD" : w >= 1280 ? "HD" : "SD",
		exact: true,
	};
}

// A gallery asset has a title and date. An artwork page's asset has neither, and shows its largest size instead.
function asset(id, thumbUrl, images, details = {}) {
	const base = `https://images.example.test/${id}`;
	const [w, h] = images[0];
	return {
		base,
		id,
		ext: "png",
		thumbUrl,
		caps: { w, h },
		bestUrl: `${base}/${w}.png`,
		deviationUrl: `https://example.test/art/${id}`,
		images: images.map((args) => image(base, ...args)),
		...details,
	};
}

// Opens the real panel and fills it with sample results, then returns a capture of it.
async function capturePanel(browser, extId, { width, height, page, assets, selected, sizes, progress }) {
	const tab = await browser.newPage();
	await tab.setViewport({ width, height, deviceScaleFactor: 2 });
	await tab.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: "domcontentloaded" });
	await sleep(1500);
	await tab.evaluate(
		(pageInfo, assetList, selectedUrls, sizeTexts, progressText) => {
			state.data = { ok: true, page: pageInfo, assets: assetList, totalAssets: assetList.length, truncated: false };
			const urls = assetList.flatMap((a) => a.images.map((img) => img.url));
			state.selected = new Set(urls.filter((_url, index) => selectedUrls.includes(index)));
			showNotice("");
			setProgress(progressText || "");
			document.querySelector("#btnCancelJob").classList.toggle("hidden", !progressText);
			document.querySelector("#pageMeta").textContent = `${pageInfo.title} | ${pageInfo.artist}`;
			renderSummary();
			renderList();
			updateActionLabels();
			document.querySelectorAll("[data-size-for]").forEach((cell, index) => {
				cell.textContent = sizeTexts[index];
			});
			document.activeElement?.blur();
		},
		page,
		assets,
		selected,
		sizes,
		progress,
	);
	await sleep(400);
	const shot = await tab.screenshot({ type: "png", encoding: "base64" });
	await tab.close();
	return `data:image/png;base64,${shot}`;
}

// The settings page, trimmed to the sections about scans and results.
async function captureSettings(browser, extId, width, height) {
	const tab = await browser.newPage();
	await tab.setViewport({ width, height, deviceScaleFactor: 2 });
	await tab.goto(`chrome-extension://${extId}/saver.html`, { waitUntil: "domcontentloaded" });
	await tab.evaluate(() => chrome.storage.local.set({ showExploreImages: true, bestOnly: true, smallVariants: false, minSize: 1920 }));
	await tab.reload({ waitUntil: "domcontentloaded" });
	await tab.waitForSelector("#minSizeDropdown .dropdownButton");
	await tab.evaluate(() => {
		let keep = false;
		for (const child of document.querySelector(".saverMain").children) {
			if (child.matches(".settingHeading")) keep = ["Results", "Scanning"].includes(child.textContent);
			if (!keep) child.style.display = "none";
		}
		const style = document.createElement("style");
		style.textContent = `
			html, body, .saverPage { background: #151a20 !important; }
			.saverPage { padding: 0 !important; }
			.saverCard { width: 100% !important; border: 0 !important; border-radius: 0 !important; }
		`;
		document.head.appendChild(style);
		const results = [...document.querySelectorAll(".settingHeading")].find((h) => h.textContent === "Results");
		results.style.marginTop = "0";
		results.style.paddingTop = "0";
		results.style.borderTop = "0";
		document.activeElement?.blur();
	});
	await sleep(300);
	const shot = await tab.screenshot({ type: "png", encoding: "base64" });
	await tab.close();
	return `data:image/png;base64,${shot}`;
}

const BASE_CSS = `
	* { box-sizing: border-box; margin: 0; }
	html, body { width: 1600px; height: 1000px; overflow: hidden; background: #05090c; }
	body { position: relative; font-family: "Segoe UI", system-ui, sans-serif; color: #fff; }
	.glow { position: absolute; border-radius: 50%; border: 3px solid rgba(0, 230, 118, 0.55); box-shadow: 0 0 70px rgba(0, 230, 118, 0.5), inset 0 0 90px rgba(0, 230, 118, 0.14); }
	.brand { position: absolute; display: flex; align-items: center; gap: 22px; font-weight: 700; letter-spacing: -0.02em; }
	.brand img { border-radius: 22%; box-shadow: 0 0 26px rgba(0, 230, 118, 0.5); }
	h1 { position: absolute; font-family: "Segoe UI Black", "Segoe UI", sans-serif; font-weight: 900; line-height: 1.02; letter-spacing: -0.035em; text-shadow: 0 4px 30px rgba(0, 0, 0, 0.6); }
	h2 { position: absolute; color: #00e676; font-weight: 700; line-height: 1.14; letter-spacing: -0.02em; text-shadow: 0 2px 20px rgba(0, 0, 0, 0.8); }
	.shot { position: absolute; display: block; border-radius: 18px; border: 2px solid rgba(0, 230, 118, 0.6); box-shadow: 0 0 60px rgba(0, 230, 118, 0.28), 0 24px 70px rgba(0, 0, 0, 0.7); }
	.bg { position: absolute; object-fit: cover; }
`;

function brand(left, top, size) {
	return `<div class="brand" style="left:${left}px;top:${top}px;font-size:${Math.round(size * 0.62)}px"><img src="${ICON}" width="${size}" height="${size}" alt="">Deviation Lens</div>`;
}

const LAYOUTS = {
	"download-your-picks": (panel) => `
		<img class="bg" src="${art("forest-tall.jpg")}" style="right:0;top:0;width:560px;height:1000px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 45%)">
		<div class="glow" style="left:-300px;top:380px;width:760px;height:760px;border-color:rgba(0,230,118,.3)"></div>
		${brand(68, 30, 72)}
		<h1 style="left:66px;top:110px;font-size:112px;white-space:nowrap">Save the images you choose.</h1>
		<h2 style="left:70px;top:236px;font-size:40px">Download the best version, or your picks as one ZIP.</h2>
		<img class="shot" src="${panel}" style="left:260px;top:304px;width:990px;height:682px">`,
	"compare-best-quality": (panel) => `
		<img class="bg" src="${art("sunset.jpg")}" style="left:0;top:420px;width:900px;height:580px;-webkit-mask-image:linear-gradient(90deg,#000 72%,transparent),linear-gradient(0deg,#000 80%,transparent);-webkit-mask-composite:source-in">
		<div class="glow" style="right:-180px;top:-260px;width:820px;height:820px;border-color:rgba(0,230,118,.35)"></div>
		${brand(80, 60, 92)}
		<h1 style="left:62px;top:180px;font-size:100px">Choose the best<br>available image.</h1>
		<h2 style="left:66px;top:392px;font-size:40px">Compare dimensions and file sizes<br>before downloading.</h2>
		<img class="shot" src="${panel}" style="left:826px;top:96px;width:726px;height:805px">`,
	"find-image-variants": (panel) => `
		<div class="glow" style="right:-60px;top:60px;width:620px;height:620px;border-color:rgba(0,230,118,.4)"></div>
		${brand(92, 36, 86)}
		<h1 style="left:90px;top:128px;font-size:118px;white-space:nowrap">Find artwork images.</h1>
		<h2 style="left:94px;top:262px;font-size:48px">Scan the current page for available image variants.</h2>
		<div style="position:absolute;left:50px;top:340px;width:960px;height:700px;background:#14191f;border:2px solid #2a3442;border-radius:18px;overflow:hidden">
			<div style="height:56px;display:flex;align-items:center;gap:10px;padding:0 24px;background:#1b2128;border-bottom:1px solid #2a3442">
				<i style="width:14px;height:14px;border-radius:50%;background:#ff5f57"></i><i style="width:14px;height:14px;border-radius:50%;background:#febc2e"></i><i style="width:14px;height:14px;border-radius:50%;background:#28c840"></i>
				<span style="flex:1;margin-left:18px;height:30px;border-radius:15px;background:#0e1216"></span>
			</div>
			<img src="${art("mountains.jpg")}" style="display:block;margin:24px;width:912px;height:600px;object-fit:cover;border-radius:6px">
		</div>
		<img class="shot" src="${panel}" style="left:930px;top:330px;width:612px;height:662px">`,
	"scan-preferences": (panel) => `
		<div class="glow" style="left:640px;top:-60px;width:1000px;height:1000px;border-color:rgba(0,230,118,.4)"></div>
		<img class="bg" src="${art("mountains.jpg")}" style="left:850px;top:30px;width:430px;height:420px;border-radius:26px;border:3px solid #39e58c;transform:rotate(6deg)">
		<img class="bg" src="${art("forest-card.jpg")}" style="left:1270px;top:60px;width:300px;height:300px;border-radius:26px;border:3px solid #39e58c;transform:rotate(11deg)">
		<img class="bg" src="${art("sunset.jpg")}" style="left:700px;top:600px;width:260px;height:340px;border-radius:26px;border:3px solid #39e58c;transform:rotate(-8deg)">
		${brand(70, 110, 100)}
		<h1 style="left:66px;top:262px;font-size:94px">Make every<br>scan your own.</h1>
		<h2 style="left:70px;top:478px;font-size:44px">Choose what to include<br>and where to scan.</h2>
		<p style="position:absolute;left:70px;top:610px;font-size:28px;line-height:1.35;color:#cfd8df">All your preferences,<br>on one settings page.</p>
		<img class="shot" src="${panel}" style="left:850px;top:352px;width:710px;height:575px">`,
};

(async () => {
	fs.rmSync(PROFILE, { recursive: true, force: true });
	fs.mkdirSync(path.join(OUT, "store"), { recursive: true });
	const browser = await puppeteer.launch({
		executablePath: findChrome(),
		headless: true,
		args: [
			"--no-sandbox",
			"--disable-gpu",
			"--enable-unsafe-extension-debugging",
			`--disable-extensions-except=${EXT}`,
			`--load-extension=${EXT}`,
			`--user-data-dir=${PROFILE}`,
		],
	});
	try {
		const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15000 });
		const extId = new URL(sw.url()).host;
		const gallery = {
			title: "Sample gallery",
			artist: "sample-artist",
			url: "https://example.test/gallery",
			isArtPage: false,
			downloadUrl: null,
		};
		const single = (title) => ({ ...gallery, title, isArtPage: true });
		const sizes = [
			[3840, 2160, "max", "max lossless", 100],
			[1920, 1080, "scaled", "fullview", 100],
			[1280, 720, "scaled", "scaled", 80],
		];

		const panels = {
			"download-your-picks": await capturePanel(browser, extId, {
				width: 945,
				height: 651,
				page: gallery,
				assets: [
					asset("1001", art("forest-wide.jpg"), [sizes[0]], { title: "Forest Stream", date: "2026-10-12" }),
					asset("1002", art("mountains.jpg"), [sizes[0]], { title: "Mountain Lake", date: "2026-10-03" }),
					asset("1003", art("sunset.jpg"), [sizes[0]], { title: "Sunset Coast", date: "2026-09-21" }),
				],
				selected: [0, 2],
				sizes: ["18.4 MB", "21.2 MB", "16.7 MB"],
				progress: "Preparing ZIP: 1/2 · sample-artist_2026-10-12_Forest_Stream.png",
			}),
			"compare-best-quality": await capturePanel(browser, extId, {
				width: 550,
				height: 610,
				page: single("Sunset Coast"),
				assets: [asset("1003", art("sunset.jpg"), sizes)],
				selected: [0],
				sizes: ["16.7 MB", "5.8 MB", "2.1 MB"],
			}),
			"find-image-variants": await capturePanel(browser, extId, {
				width: 545,
				height: 590,
				page: single("Mountain Lake"),
				assets: [asset("1002", art("mountains.jpg"), sizes)],
				selected: [0, 1, 2],
				sizes: ["21.2 MB", "6.9 MB", "2.6 MB"],
			}),
			"scan-preferences": await captureSettings(browser, extId, 580, 470),
		};

		const canvas = await browser.newPage();
		for (const [name, panel] of Object.entries(panels)) {
			const html = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${LAYOUTS[name](panel)}</body></html>`;
			await canvas.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
			await canvas.setContent(html, { waitUntil: "load" });
			await canvas.screenshot({ path: path.join(OUT, `${name}.png`) });
			await canvas.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 0.8 });
			await canvas.setContent(html, { waitUntil: "load" });
			await canvas.screenshot({ path: path.join(OUT, "store", `${name}.jpg`), type: "jpeg", quality: 92 });
		}
		console.log(`Wrote images to ${OUT}`);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
