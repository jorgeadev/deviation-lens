// Renders apps/web/assets/<version>/promo.mp4 (1920 x 1080, 30 fps, silent) with its posters: promo-poster.jpg for
// the website, and promo-readme.jpg, which adds a play button because a README can only show an image.
// Each frame is drawn at an exact time, so the result is repeatable. The panels are captures of the real
// extension UI, with sample data and the project's own illustrations.
// Pass times in seconds to write stills to packages/tools/out/promo-stills instead: node make-promo-video.js 2 7.5 16
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");
const { art, asset, capturePanel, captureSettings, findChrome, ICON } = require("./make-product-shots");

const TOOLS_DIR = path.resolve(__dirname, "../..");
const ROOT = path.resolve(TOOLS_DIR, "..", "..");
const EXT = path.join(ROOT, "apps", "extension");
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const ASSETS = path.join(ROOT, "apps", "web", "assets", version);
const OUTPUT = path.join(ASSETS, "promo.mp4");
const POSTER_TIME = 2.4;

// The video is silent and its message is on-screen text, which captions make available to screen readers.
const CAPTIONS = [
	["00:00.500", "00:03.400", "Deviation Lens. See the image. Choose the file."],
	["00:03.500", "00:09.000", "Find every version. Scan the page you’re on for available images."],
	["00:09.100", "00:13.200", "Compare every version. Size, format, and quality, with the best one marked."],
	["00:13.300", "00:19.800", "One ZIP, not a pile of files. Save your picks together, with credit for every artist."],
	["00:19.900", "00:22.200", "You choose where files go. Pick a folder, or get a Save As dialog every time."],
	["00:22.300", "00:24.600", "Set it up your way. Filters, file names, and history, on one settings page."],
	["00:25.000", "00:27.800", "Deviation Lens. Free on the Chrome Web Store. Independent project. Not affiliated with or endorsed by DeviantArt."],
];
const STILLS = path.join(TOOLS_DIR, "out", "promo-stills");
const PROFILE = path.join(TOOLS_DIR, "out", "profile-promo");
const FPS = 30;
const DURATION = 28;

async function capturePanels(browser, extId) {
	const gallery = { title: "Sample gallery", artist: "sample-artist", url: "https://example.test/gallery", isArtPage: false, downloadUrl: null };
	const single = (title) => ({ ...gallery, title, isArtPage: true });
	const sizes = [
		[3840, 2160, "max", "max lossless", 100],
		[1920, 1080, "scaled", "fullview", 100],
		[1280, 720, "scaled", "scaled", 80],
	];
	const galleryShot = (progress, finished) =>
		capturePanel(browser, extId, {
			width: 945,
			height: 651,
			page: gallery,
			assets: [
				asset("1001", art("forest-wide.jpg"), [sizes[0]], { title: "Forest Stream", date: "2026-10-12" }),
				asset("1002", art("mountains.jpg"), [sizes[0]], { title: "Mountain Lake", date: "2026-10-03" }),
				asset("1003", art("sunset.jpg"), [sizes[0]], { title: "Sunset Coast", date: "2026-09-21" }),
			],
			selected: [0, 1, 2],
			sizes: ["18.4 MB", "21.2 MB", "16.7 MB"],
			progress,
			finished,
		});
	return {
		find: await capturePanel(browser, extId, {
			width: 545,
			height: 590,
			page: single("Mountain Lake"),
			assets: [asset("1002", art("mountains.jpg"), sizes)],
			selected: [0, 1, 2],
			sizes: ["21.2 MB", "6.9 MB", "2.6 MB"],
		}),
		compare: await capturePanel(browser, extId, {
			width: 550,
			height: 610,
			page: single("Sunset Coast"),
			assets: [asset("1003", art("sunset.jpg"), sizes)],
			selected: [0],
			sizes: ["16.7 MB", "5.8 MB", "2.1 MB"],
		}),
		zip0: await galleryShot("Preparing ZIP: 0/3"),
		zip1: await galleryShot("Preparing ZIP: 1/3 · sample-artist_2026-10-12_Forest_Stream.png"),
		zip2: await galleryShot("Preparing ZIP: 2/3 · sample-artist_2026-10-03_Mountain_Lake.png"),
		zip3: await galleryShot("Saved 3 image(s) to sample-artist_Sample_gallery_3-images.zip", true),
		choice: await capturePanel(browser, extId, {
			width: 550,
			height: 610,
			page: single("Sunset Coast"),
			assets: [asset("1003", art("sunset.jpg"), sizes)],
			selected: [0],
			sizes: ["16.7 MB", "5.8 MB", "2.1 MB"],
			locationChoice: true,
		}),
		// Last, because it changes saved settings that the panel captures above would pick up.
		settings: await captureSettings(browser, extId, 580, 470),
	};
}

const CSS = `
	* { box-sizing: border-box; margin: 0; }
	html, body { width: 1920px; height: 1080px; overflow: hidden; background: #05090c; }
	body { position: relative; font-family: "Segoe UI", system-ui, sans-serif; color: #fff; }
	.scene, .fill { position: absolute; inset: 0; }
	.scene { opacity: 0; }
	.abs { position: absolute; will-change: transform, opacity; }
	h1 { position: absolute; font-family: "Segoe UI Black", "Segoe UI", sans-serif; font-weight: 900; line-height: 1.04; letter-spacing: -0.035em; text-shadow: 0 4px 30px rgba(0, 0, 0, 0.7); }
	h2 { position: absolute; color: #00e676; font-weight: 700; line-height: 1.16; letter-spacing: -0.02em; text-shadow: 0 2px 20px rgba(0, 0, 0, 0.85); }
	.shot { border-radius: 18px; border: 2px solid rgba(0, 230, 118, 0.6); box-shadow: 0 0 70px rgba(0, 230, 118, 0.26), 0 26px 80px rgba(0, 0, 0, 0.75); }
	.ring { border-radius: 50%; border: 3px solid rgba(0, 230, 118, 0.5); box-shadow: 0 0 80px rgba(0, 230, 118, 0.5), inset 0 0 100px rgba(0, 230, 118, 0.14); }
	.art { object-fit: cover; }
	.card { border-radius: 16px; border: 3px solid #39e58c; object-fit: cover; box-shadow: 0 14px 40px rgba(0, 0, 0, 0.6); }
	#playBadge { position: absolute; left: 50%; bottom: 44px; display: none; align-items: center; gap: 20px; padding: 16px 38px 16px 22px; transform: translateX(-50%); border-radius: 60px; background: #00e676; color: #06140c; font-size: 42px; font-weight: 700; white-space: nowrap; }
	#playBadge span { width: 0; height: 0; margin-left: 12px; border-style: solid; border-width: 20px 0 20px 32px; border-color: transparent transparent transparent #06140c; }
	#sample { position: absolute; right: 26px; bottom: 16px; color: #93a1b1; font-size: 19px; text-shadow: 0 1px 6px #000; }
	.zipFile { width: 280px; height: 340px; border-radius: 24px; background: linear-gradient(160deg, #1f2933, #12181e); border: 3px solid #00e676; box-shadow: 0 0 70px rgba(0, 230, 118, 0.4); }
	.zipFile b { position: absolute; left: 0; right: 0; bottom: 34px; text-align: center; font-family: "Segoe UI Black", sans-serif; font-size: 70px; letter-spacing: 0.02em; }
	.zipFile i { position: absolute; left: 50%; top: 0; width: 22px; height: 170px; margin-left: -11px; background: repeating-linear-gradient(0deg, #00e676 0 12px, transparent 12px 24px); }
	.pill { padding: 12px 24px; border-radius: 40px; background: #17201c; border: 2px solid #00e676; color: #dff8e9; font-size: 27px; font-weight: 600; white-space: nowrap; }
`;

function buildPage(panels) {
	const body = `
		<div class="scene" id="s1">
			<div class="abs ring" id="s1ring" style="left:360px;top:-60px;width:1200px;height:1200px"></div>
			<img class="abs" id="s1icon" src="${ICON}" style="left:870px;top:210px;width:180px;height:180px;border-radius:22%;box-shadow:0 0 50px rgba(0,230,118,.55)">
			<div class="abs" id="s1name" style="left:0;right:0;top:405px;text-align:center;font-size:78px;font-weight:700;letter-spacing:-.02em">Deviation Lens</div>
			<div class="abs" id="s1line" style="left:0;right:0;top:520px;text-align:center;font-family:'Segoe UI Black';font-weight:900;font-size:112px;line-height:1.08;letter-spacing:-.035em">See the image.<br>Choose the file.</div>
		</div>

		<div class="scene" id="s2">
			<h1 id="s2h" style="left:70px;top:36px;font-size:104px;white-space:nowrap">Find every version.</h1>
			<h2 id="s2s" style="left:76px;top:154px;font-size:50px">Scan the page you’re on for available images.</h2>
			<div class="abs" id="s2win" style="left:60px;top:250px;width:1240px;height:870px;background:#14191f;border:2px solid #2a3442;border-radius:20px;overflow:hidden">
				<div style="height:60px;display:flex;align-items:center;gap:11px;padding:0 26px;background:#1b2128;border-bottom:1px solid #2a3442">
					<i style="width:15px;height:15px;border-radius:50%;background:#ff5f57"></i><i style="width:15px;height:15px;border-radius:50%;background:#febc2e"></i><i style="width:15px;height:15px;border-radius:50%;background:#28c840"></i>
					<span style="flex:1;margin-left:20px;height:32px;border-radius:16px;background:#0e1216"></span>
				</div>
				<div style="margin:26px;height:780px;overflow:hidden;border-radius:8px"><img id="s2art" class="art" src="${art("mountains.jpg")}" style="display:block;width:100%;height:100%"></div>
			</div>
			<img class="abs shot" id="s2panel" src="${panels.find}" style="left:1190px;top:276px;width:680px;height:736px">
		</div>

		<div class="scene" id="s3">
			<img class="abs art" id="s3art" src="${art("sunset.jpg")}" style="left:0;top:480px;width:1120px;height:600px;-webkit-mask-image:linear-gradient(90deg,#000 72%,transparent),linear-gradient(0deg,#000 80%,transparent);-webkit-mask-composite:source-in">
			<h1 id="s3h" style="left:70px;top:90px;font-size:112px">Compare every<br>version.</h1>
			<h2 id="s3s" style="left:76px;top:340px;font-size:50px">Size, format, and quality,<br>with the best one marked.</h2>
			<img class="abs shot" id="s3panel" src="${panels.compare}" style="left:1040px;top:90px;width:810px;height:898px">
		</div>

		<div class="scene" id="s4">
			<h1 id="s4h" style="left:70px;top:36px;font-size:104px;white-space:nowrap">One ZIP, not a pile of files.</h1>
			<h2 id="s4s" style="left:76px;top:154px;font-size:50px">Save your picks together, with credit for every artist.</h2>
			<div class="abs" id="s4panel" style="left:60px;top:256px;width:1140px;height:785px">
				<img class="abs shot" id="zip0" src="${panels.zip0}" style="inset:0;width:100%;height:100%">
				<img class="abs shot" id="zip1" src="${panels.zip1}" style="inset:0;width:100%;height:100%">
				<img class="abs shot" id="zip2" src="${panels.zip2}" style="inset:0;width:100%;height:100%">
				<img class="abs shot" id="zip3" src="${panels.zip3}" style="inset:0;width:100%;height:100%">
			</div>
			<div class="abs zipFile" id="zipFile" style="left:1450px;top:390px"><i></i><b>ZIP</b></div>
			<img class="abs card" id="fly1" src="${art("forest-wide.jpg")}" style="left:0;top:0;width:190px;height:130px">
			<img class="abs card" id="fly2" src="${art("mountains.jpg")}" style="left:0;top:0;width:190px;height:130px">
			<img class="abs card" id="fly3" src="${art("sunset.jpg")}" style="left:0;top:0;width:190px;height:130px">
			<div class="abs pill" id="zipPill" style="left:1390px;top:770px">+ manifest.csv with credits</div>
		</div>

		<div class="scene" id="s5">
			<img class="abs art" id="s5art" src="${art("mountains.jpg")}" style="left:0;top:480px;width:1120px;height:600px;-webkit-mask-image:linear-gradient(90deg,#000 72%,transparent),linear-gradient(0deg,#000 80%,transparent);-webkit-mask-composite:source-in">
			<div id="s5a">
				<h1 style="left:70px;top:90px;font-size:112px">You choose<br>where files go.</h1>
				<h2 style="left:76px;top:340px;font-size:50px">Pick a folder, or get a<br>Save As dialog every time.</h2>
				<img class="abs shot" src="${panels.choice}" style="left:1040px;top:90px;width:810px;height:898px">
			</div>
			<div id="s5b" style="opacity:0">
				<h1 style="left:70px;top:90px;font-size:112px">Set it up<br>your way.</h1>
				<h2 style="left:76px;top:340px;font-size:50px">Filters, file names, and history,<br>on one settings page.</h2>
				<img class="abs shot" src="${panels.settings}" style="left:930px;top:170px;width:930px;height:754px">
			</div>
		</div>

		<div class="scene" id="s6">
			<div class="abs ring" id="s6ring" style="left:360px;top:-60px;width:1200px;height:1200px"></div>
			<img class="abs" id="s6icon" src="${ICON}" style="left:865px;top:170px;width:190px;height:190px;border-radius:22%;box-shadow:0 0 50px rgba(0,230,118,.55)">
			<div class="abs" id="s6name" style="left:0;right:0;top:385px;text-align:center;font-family:'Segoe UI Black';font-weight:900;font-size:128px;letter-spacing:-.035em">Deviation Lens</div>
			<div class="abs" id="s6cta" style="left:0;right:0;top:565px;text-align:center;color:#00e676;font-size:62px;font-weight:700;letter-spacing:-.02em">Free on the Chrome Web Store</div>
			<div class="abs" id="s6note" style="left:0;right:0;top:940px;text-align:center;color:#93a1b1;font-size:26px">Independent project. Not affiliated with or endorsed by DeviantArt.</div>
		</div>

		<div id="sample">Sample artwork and data</div>
		<div id="playBadge"><span></span>Watch the video</div>
		<div class="fill" id="black" style="background:#000;opacity:0"></div>`;

	const script = `
		const $ = (id) => document.getElementById(id);
		const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
		const out = (x) => 1 - Math.pow(1 - x, 3);
		const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
		function set(id, { o = 1, x = 0, y = 0, s = 1 } = {}) {
			const el = $(id);
			el.style.opacity = o;
			el.style.transform = "translate(" + x + "px," + y + "px) scale(" + s + ")";
		}
		const scenes = [["s1", 0, 3.6], ["s2", 3.2, 9.2], ["s3", 8.8, 13.4], ["s4", 13, 20], ["s5", 19.6, 24.8], ["s6", 24.4, 28.1]];
		// Enters from below and fades in over 0.6 seconds, starting at the given time.
		const rise = (id, t, start, distance = 40) => {
			const p = out(seg(t, start, start + 0.6));
			set(id, { o: p, y: (1 - p) * distance });
		};
		window.renderAt = (t) => {
			for (const [id, a, b] of scenes) $(id).style.opacity = seg(t, a, a + 0.4) * (1 - seg(t, b - 0.4, b));
			$("sample").style.opacity = seg(t, 3.4, 3.8) * (1 - seg(t, 24.4, 24.8));
			$("black").style.opacity = seg(t, 27.4, 28);

			// Opening title
			set("s1ring", { o: out(seg(t, 0, 1)) * 0.9, s: 0.72 + 0.28 * out(seg(t, 0, 1.6)) });
			const iconIn = out(seg(t, 0.1, 0.8));
			set("s1icon", { o: iconIn, s: 0.6 + 0.4 * iconIn });
			rise("s1name", t, 0.5);
			rise("s1line", t, 1.2, 50);

			// Find: the panel slides in beside the page
			rise("s2h", t, 3.5);
			rise("s2s", t, 3.8);
			rise("s2win", t, 3.6, 60);
			$("s2art").style.transform = "scale(" + (1.0 + 0.06 * seg(t, 3.2, 9.2)) + ")";
			const panelIn = inOut(seg(t, 4.7, 5.5));
			set("s2panel", { o: seg(t, 4.7, 5.0), x: (1 - panelIn) * 720 });

			// Compare: a slow push in
			rise("s3h", t, 9.1);
			rise("s3s", t, 9.4);
			set("s3art", { s: 1.08 - 0.08 * seg(t, 8.8, 13.4) });
			const compareIn = out(seg(t, 9.2, 9.9));
			set("s3panel", { o: compareIn, x: (1 - compareIn) * 90, s: 0.97 + 0.03 * seg(t, 9.2, 13.4) });

			// ZIP: progress advances as each image flies into the file
			rise("s4h", t, 13.3);
			rise("s4s", t, 13.6);
			rise("s4panel", t, 13.4, 60);
			const stages = [14.9, 15.8, 16.7];
			["zip1", "zip2", "zip3"].forEach((id, i) => { $(id).style.opacity = t >= stages[i] + 0.35 ? 1 : 0; });
			const zipIn = out(seg(t, 13.9, 14.5));
			const absorb = stages.reduce((sum, start) => {
				const p = seg(t, start + 0.3, start + 0.6);
				return Math.max(sum, p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0);
			}, 0);
			set("zipFile", { o: zipIn, s: (0.8 + 0.2 * zipIn) * (1 + 0.07 * absorb) });
			["fly1", "fly2", "fly3"].forEach((id, i) => {
				const p = inOut(seg(t, stages[i], stages[i] + 0.55));
				const fromX = 1000, fromY = 430 + i * 140, toX = 1495, toY = 490;
				const visible = t >= stages[i] && t < stages[i] + 0.55;
				const lift = Math.sin(p * Math.PI) * -60;
				set(id, { o: visible ? 1 - 0.5 * seg(p, 0.7, 1) : 0, x: fromX + (toX - fromX) * p, y: fromY + (toY - fromY) * p + lift, s: 1 - 0.55 * p });
			});
			rise("zipPill", t, 17.2, 30);

			// Choices, then settings
			const choiceIn = out(seg(t, 19.9, 20.5));
			const swap = seg(t, 22.1, 22.5);
			set("s5a", { o: choiceIn * (1 - swap), x: (1 - choiceIn) * 50 });
			set("s5b", { o: swap, x: (1 - out(swap)) * 50 });
			set("s5art", { s: 1 + 0.06 * seg(t, 19.6, 24.8) });

			// Closing title
			set("s6ring", { o: out(seg(t, 24.5, 25.4)) * 0.9, s: 0.72 + 0.28 * out(seg(t, 24.5, 26)) });
			const endIcon = out(seg(t, 24.7, 25.3));
			set("s6icon", { o: endIcon, s: 0.6 + 0.4 * endIcon });
			rise("s6name", t, 25);
			rise("s6cta", t, 25.5, 30);
			rise("s6note", t, 26, 15);
		};`;
	return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}<script>${script}</script></body></html>`;
}

function startEncoder() {
	fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
	const ffmpeg = spawn(
		"ffmpeg",
		// prettier-ignore
		[
			"-y",
			"-loglevel",
			"error",
			"-f",
			"image2pipe",
			"-framerate",
			String(FPS),
			"-c:v",
			"mjpeg",
			"-i",
			"-",
			"-c:v",
			"libx264",
			"-preset",
			"slow",
			"-crf",
			"18",
			"-vf",
			"scale=in_range=full:out_range=tv,format=yuv420p",
			"-color_range",
			"tv",
			"-colorspace",
			"bt709",
			"-color_primaries",
			"bt709",
			"-color_trc",
			"bt709",
			"-movflags",
			"+faststart",
			OUTPUT,
		],
		{ stdio: ["pipe", "inherit", "inherit"] },
	);
	const done = new Promise((resolve, reject) => {
		ffmpeg.on("error", reject);
		ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
	});
	return { ffmpeg, done };
}

(async () => {
	const stillTimes = process.argv.slice(2).map(Number);
	fs.mkdirSync(ASSETS, { recursive: true });
	const cues = CAPTIONS.map(([start, end, text]) => `${start} --> ${end}\n${text}`).join("\n\n");
	fs.writeFileSync(path.join(ASSETS, "promo.vtt"), `WEBVTT\n\n${cues}\n`);
	fs.rmSync(PROFILE, { recursive: true, force: true });
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
		const panels = await capturePanels(browser, new URL(sw.url()).host);
		const page = await browser.newPage();
		await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
		await page.setContent(buildPage(panels), { waitUntil: "load" });
		await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));

		if (stillTimes.length) {
			fs.rmSync(STILLS, { recursive: true, force: true });
			fs.mkdirSync(STILLS, { recursive: true });
			for (const t of stillTimes) {
				await page.evaluate((time) => window.renderAt(time), t);
				await page.screenshot({ path: path.join(STILLS, `t${String(t).padStart(5, "0")}.jpg`), type: "jpeg", quality: 85 });
			}
			console.log(`Wrote ${stillTimes.length} stills to ${STILLS}`);
			return;
		}

		const { ffmpeg, done } = startEncoder();
		const frames = DURATION * FPS;
		for (let frame = 0; frame < frames; frame++) {
			await page.evaluate((time) => window.renderAt(time), frame / FPS);
			const jpeg = await page.screenshot({ type: "jpeg", quality: 97, encoding: "binary" });
			if (!ffmpeg.stdin.write(Buffer.from(jpeg))) await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
			if (frame % 150 === 0) console.log(`frame ${frame}/${frames}`);
		}
		ffmpeg.stdin.end();
		await done;
		await page.evaluate((time) => window.renderAt(time), POSTER_TIME);
		await page.screenshot({ path: path.join(ASSETS, "promo-poster.jpg"), type: "jpeg", quality: 88 });
		await page.evaluate(() => {
			document.getElementById("playBadge").style.display = "flex";
		});
		await page.screenshot({ path: path.join(ASSETS, "promo-readme.jpg"), type: "jpeg", quality: 88 });
		console.log(`Wrote ${OUTPUT} and its posters`);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
