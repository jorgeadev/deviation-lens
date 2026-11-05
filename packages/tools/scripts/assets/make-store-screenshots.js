// Captures Chrome Web Store screenshots from the real extension UI, filled with abstract sample images.
// No live page is scanned, so no third-party artwork appears in them. Output is 1280 x 800 PNG.
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");

const TOOLS_DIR = path.resolve(__dirname, "../..");
const EXT = path.resolve(TOOLS_DIR, "..", "..", "apps", "extension");
const OUT = process.argv[2] || path.join(EXT, "store", "assets", "screenshots", "release");
const PROFILE = path.join(TOOLS_DIR, "out", "profile-screenshots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
	const base = path.join(TOOLS_DIR, "browsers", "chrome");
	for (const d of fs.readdirSync(base)) {
		const p = path.join(base, d, "chrome-win64", "chrome.exe");
		if (fs.existsSync(p)) return p;
	}
	throw new Error("No test browser found in packages/tools/browsers.");
}

// Lays the panel out on the left of a store-sized image, with a caption beside it.
async function frame(page, title, body) {
	await page.evaluate(
		(titleText, bodyText) => {
			const style = document.createElement("style");
			style.textContent = `
				html, body { background: #0d1116 !important; }
				#app { width: 440px !important; margin-left: 90px; border-inline: 1px solid #2a3442; }
				.saveChoice { margin-left: 120px; margin-top: 190px; }
				.saveChoice::backdrop { width: 440px; left: 90px; }
				#storeCaption { position: fixed; left: 610px; right: 80px; top: 280px; font-family: "Segoe UI", system-ui, sans-serif; color: #edf2f6; }
				#storeCaption h1 { margin: 0 0 16px; font-size: 42px; line-height: 1.15; font-weight: 650; }
				#storeCaption p { margin: 0; font-size: 20px; line-height: 1.5; color: #93a1b1; }
			`;
			document.head.appendChild(style);
			const caption = document.createElement("div");
			caption.id = "storeCaption";
			const heading = document.createElement("h1");
			heading.textContent = titleText;
			const paragraph = document.createElement("p");
			paragraph.textContent = bodyText;
			caption.append(heading, paragraph);
			document.body.appendChild(caption);
		},
		title,
		body,
	);
}

async function loadSampleResults(page) {
	await page.evaluate(() => {
		const thumb = (a, b, c) => {
			const canvas = document.createElement("canvas");
			canvas.width = canvas.height = 96;
			const ctx = canvas.getContext("2d");
			const gradient = ctx.createLinearGradient(0, 0, 96, 96);
			gradient.addColorStop(0, a);
			gradient.addColorStop(1, b);
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, 96, 96);
			ctx.fillStyle = c;
			ctx.beginPath();
			ctx.arc(62, 34, 18, 0, Math.PI * 2);
			ctx.fill();
			return canvas.toDataURL();
		};
		const asset = (id, title, date, colors) => {
			const base = `https://images.example.test/${id}`;
			const image = (w, h, role, roleLabel, q) => ({
				url: `${base}/${w}.png`,
				w,
				h,
				role,
				roleLabel,
				q,
				ext: "png",
				tier: tierFor(w),
				exact: true,
			});
			return {
				base,
				id,
				title,
				date,
				thumbUrl: thumb(...colors),
				deviationUrl: `https://example.test/art/${id}`,
				images: [
					image(3840, 2160, "max", "max lossless", 100),
					image(1920, 1080, "scaled", "fullview", 100),
					image(1280, 720, "scaled", "scaled", 80),
				],
			};
		};
		state.data = {
			ok: true,
			page: { title: "Sample gallery", artist: "sample-artist", url: "https://example.test/gallery", isArtPage: false, downloadUrl: null },
			assets: [
				asset("1001", "Quiet Harbor", "2026-10-12", ["#1d4e89", "#f79256", "#fbd1a2"]),
				asset("1002", "Forest Light", "2026-10-03", ["#0b3d2e", "#7bc950", "#f2f5a9"]),
				asset("1003", "Night Market", "2026-09-21", ["#2d1e5f", "#e0468a", "#ffe08a"]),
			],
			totalAssets: 3,
			truncated: false,
		};
		state.prefs.rememberSaved = true;
		state.savedKeys = new Set(["https://images.example.test/1002"]);
		state.selected = new Set(state.data.assets.flatMap((a) => a.images.map((img) => img.url)));
		showNotice("");
		document.querySelector("#pageMeta").textContent = "Sample gallery | sample-artist";
		renderSummary();
		renderList();
		updateActionLabels();
		const sizes = ["18.4 MB", "6.1 MB", "2.3 MB"];
		document.querySelectorAll("[data-size-for]").forEach((cell, index) => {
			cell.textContent = sizes[index % 3];
		});
	});
}

(async () => {
	fs.rmSync(PROFILE, { recursive: true, force: true });
	fs.mkdirSync(OUT, { recursive: true });
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
		const viewport = { width: 1280, height: 800 };

		const panel = await browser.newPage();
		await panel.setViewport(viewport);
		await panel.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: "domcontentloaded" });
		await sleep(1500);
		await loadSampleResults(panel);
		await frame(
			panel,
			"Compare every available version",
			"See dimensions, formats, and file sizes together, and spot the artwork you already saved.",
		);
		await sleep(300);
		await panel.screenshot({ path: path.join(OUT, "01-compare-versions.png") });

		await panel.evaluate(() => {
			setProgress("Preparing ZIP: 7/9 · Quiet_Harbor.png");
			document.querySelector("#btnCancelJob").classList.remove("hidden");
			document.querySelector("#storeCaption h1").textContent = "One ZIP, not a pile of files";
			document.querySelector("#storeCaption p").textContent =
				"Save several images as one ZIP, with a manifest crediting each artist and source.";
		});
		await panel.screenshot({ path: path.join(OUT, "02-one-zip.png") });

		await panel.evaluate(() => {
			setProgress("");
			document.querySelector("#btnCancelJob").classList.add("hidden");
			document.querySelector("#saveChoice").showModal();
			document.querySelector("#btnChoiceFolder").blur();
			document.querySelector("#storeCaption h1").textContent = "You choose where files go";
			document.querySelector("#storeCaption p").textContent = "Pick a folder, get a Save As dialog each time, or use your Downloads folder.";
		});
		await panel.screenshot({ path: path.join(OUT, "03-choose-location.png") });
		await panel.close();

		const settings = await browser.newPage();
		await settings.setViewport(viewport);
		await settings.goto(`chrome-extension://${extId}/saver.html`, { waitUntil: "domcontentloaded" });
		await settings.waitForSelector("#minSizeDropdown .dropdownButton");
		await settings.type("#inpTemplate", "{artist}/{date}_{title}");
		await settings.evaluate(() => {
			document.querySelector("#status").textContent = "";
			document.querySelector("#inpTemplate").blur();
			document.querySelector("#minSizeDropdown .dropdownButton").scrollIntoView({ block: "center" });
			window.scrollBy(0, 40);
		});
		await settings.click("#minSizeDropdown .dropdownButton");
		await sleep(300);
		await settings.screenshot({ path: path.join(OUT, "04-settings.png") });
		console.log(`Wrote screenshots to ${OUT}`);
	} finally {
		await browser.close();
	}
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
