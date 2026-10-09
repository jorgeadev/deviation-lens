const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EXT = path.resolve(__dirname, '..', 'packages', 'extension');
const OUT = path.join(__dirname, 'out');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const base = path.join(__dirname, 'browsers', 'chrome');
  for (const d of fs.readdirSync(base)) {
    const p = path.join(base, d, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(p)) return p;
  }
  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--user-data-dir=${path.join(OUT, 'profile-dbg')}`]
  });
  try {
    const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'), { timeout: 15000 });
    const extId = new URL(sw.url()).host;
    const tab = await browser.newPage();
    await tab.goto('https://www.deviantart.com/dutteart', { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(3000);
    const popup = await browser.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' });
    await sleep(7000);
    const dump = await popup.evaluate(() => {
      const rb = document.querySelector('#rangeBox');
      const sm = rb.querySelector('summary');
      const h = (e) => Math.round(e.getBoundingClientRect().height * 100) / 100;
      const out = { initial: { details: h(rb), summary: h(sm), computedHeight: getComputedStyle(rb).height } };
      sm.style.display = 'block';
      out.afterBlockSummary = { details: h(rb), summary: h(sm) };
      sm.style.display = 'flex';
      rb.style.overflow = 'visible';
      out.afterOverflowVisible = { details: h(rb) };
      rb.style.overflow = '';
      rb.open = true;
      out.afterOpen = { details: h(rb) };
      rb.open = false;
      const probe = document.createElement('div');
      probe.style.cssText = 'padding:8px 12px;font-size:12px;';
      probe.textContent = 'probe';
      rb.insertBefore(probe, sm);
      out.withPlainDiv = { details: h(rb), div: h(probe) };
      probe.remove();
      out.cssRules = Array.from(document.styleSheets).flatMap((ss) => {
        try {
          return Array.from(ss.cssRules).filter((r) => r.selectorText && /rangeBox|summary/.test(r.selectorText)).map((r) => r.cssText.slice(0, 200));
        } catch (e) { return ['ERR ' + e.message]; }
      });
      return out;
    });
    console.log(JSON.stringify(dump, null, 2));
    await popup.screenshot({ path: path.join(OUT, 'debug_range.png') });
  } finally {
    await browser.close();
  }
})();
