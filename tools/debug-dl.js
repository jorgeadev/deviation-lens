const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EXT = path.resolve(__dirname, '..', 'packages', 'extension');
const OUT = path.join(__dirname, 'out');
const DL = path.join(OUT, 'downloads');
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
    args: [
      '--no-sandbox',
      '--disable-gpu',
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      `--user-data-dir=${path.join(OUT, 'profile-dl')}`
    ]
  });
  try {
    const cdp = await browser.target().createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
    const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'), { timeout: 15000 });
    const extId = new URL(sw.url()).host;

    const page = await browser.newPage();
    await page.goto('https://www.deviantart.com/dutteart/art/Forest-Hobbit-Home-1383355420', { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(2000);
    const popup = await browser.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' });
    await sleep(6000);

    const maxUrl = await popup.evaluate(() => {
      const r = document.querySelector('.row[data-role="max"]');
      return r ? r.dataset.url : null;
    });
    console.log('maxUrl ok:', !!maxUrl);

    const direct = await popup.evaluate(async (url) => {
      const id = await new Promise((res) => chrome.downloads.download({ url, filename: 'DeviantArt/direct (paren) name.png', conflictAction: 'uniquify' }, res));
      await new Promise((r) => setTimeout(r, 2500));
      const items = await new Promise((res) => chrome.downloads.search({ id }, res));
      return { id, err: chrome.runtime.lastError ? chrome.runtime.lastError.message : null, item: items[0] ? { state: items[0].state, filename: items[0].filename, error: items[0].error } : null };
    }, maxUrl);
    console.log('DIRECT:', JSON.stringify(direct));

    const viaBg = await popup.evaluate(async (url) => {
      const res = await new Promise((r) => chrome.runtime.sendMessage({ type: 'DA_DOWNLOAD_BATCH', items: [{ url, filename: 'my file (test) name.png', folder: 'DeviantArt' }] }, r));
      await new Promise((r) => setTimeout(r, 3000));
      const items = await new Promise((r) => chrome.downloads.search({}, r));
      return { batch: res, last: items.slice(0, 3).map((i) => ({ state: i.state, filename: i.filename, url: (i.url || '').slice(0, 80) })) };
    }, maxUrl);
    console.log('VIA BACKGROUND:', JSON.stringify(viaBg, null, 2));
  } finally {
    await browser.close();
  }
})();
