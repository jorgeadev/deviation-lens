const fs = require("node:fs");
const path = require("node:path");
const TOOLS_DIR = path.resolve(__dirname, "../..");

const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" };
const OUT = path.join(TOOLS_DIR, "out");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function localKey(dateStr) {
	const d = new Date(String(dateStr).replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
	if (Number.isNaN(d)) return "INVALID";
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

(async () => {
	fs.mkdirSync(OUT, { recursive: true });
	const gallery = await (await fetch("https://www.deviantart.com/dutteart/gallery/all?page=1", { headers: UA })).text();
	const norm = gallery.replace(/\\u002f/gi, "/").replace(/\\\//g, "/");
	const re = /\\"deviationId\\":(\d+)[\s\S]{0,4000}?\\"url\\":\\"([^"\\]+)\\"[\s\S]{0,1200}?\\"publishedTime\\":\\"([^"\\]+)\\"/g;
	const items = [];
	let m;
	while (items.length < 40) {
		m = re.exec(norm);
		if (!m) break;
		items.push({ id: m[1], url: m[2], publishedTime: m[3] });
	}
	const seen = new Set();
	const uniq = items.filter((it) => (seen.has(it.id) ? false : seen.add(it.id)));
	console.log(`gallery items: ${uniq.length}`);
	console.log(
		"gallery publishedTime sample:",
		uniq
			.slice(0, 5)
			.map((i) => `${i.id}=${i.publishedTime}`)
			.join(" | "),
	);

	for (const it of uniq.slice(0, 3)) {
		await sleep(600);
		try {
			const page = await (await fetch(it.url, { headers: UA })).text();
			const timeMatch = /Published:[^<]*<time[^>]*datetime="([^"]+)"/.exec(page);
			const anyTime = /<time[^>]*datetime="([^"]+)"/.exec(page);
			const devTime = timeMatch ? timeMatch[1] : null;
			const firstTime = anyTime ? anyTime[1] : null;
			console.log(`\nid=${it.id}`);
			console.log(`  gallery publishedTime : ${it.publishedTime}  -> local ${localKey(it.publishedTime)}`);
			console.log(`  deviation page <time> : ${devTime || firstTime || "NOT FOUND"}`);
			if (devTime) console.log(`  deviation local date  : ${localKey(devTime)}`);
			console.log(
				`  MATCH(utc-date): ${devTime ? new Date(devTime).toISOString().slice(0, 10) === new Date(it.publishedTime.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).toISOString().slice(0, 10) : "n/a"}`,
			);
		} catch (e) {
			console.log(`  fetch error: ${e.message}`);
		}
	}
})();
