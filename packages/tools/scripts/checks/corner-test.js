const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const path = require("node:path");
const TOOLS_DIR = path.resolve(__dirname, "../..");

const base = path.join(TOOLS_DIR, "browsers", "chrome");
let chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
for (const d of fs.readdirSync(base)) {
	const p = path.join(base, d, "chrome-win64", "chrome.exe");
	if (fs.existsSync(p)) chrome = p;
}

const html = `<!doctype html>
<html>
<head><style>
  html { background: #ff0000; color-scheme: dark; }
  body { margin: 0; width: 540px; height: 600px; background: #14181d; border-radius: 16px; overflow: hidden; }
</style></head>
<body></body>
</html>`;

(async () => {
	fs.mkdirSync(path.join(TOOLS_DIR, "out"), { recursive: true });
	const file = path.join(TOOLS_DIR, "out", "corner-test.html");
	fs.writeFileSync(file, html);
	const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 800, height: 600 });
		await page.goto(`file:///${file.replace(/\\/g, "/")}`);
		await page.screenshot({ path: path.join(TOOLS_DIR, "out", "corner-test.png") });
		const colors = await page.evaluate(() => ({
			htmlBg: getComputedStyle(document.documentElement).backgroundColor,
			bodyBg: getComputedStyle(document.body).backgroundColor,
			bodyRadius: getComputedStyle(document.body).borderRadius,
		}));
		console.log("computed:", JSON.stringify(colors));
		console.log("screenshot saved");
	} finally {
		await browser.close();
	}
})();
