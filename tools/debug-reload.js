const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EXT = path.resolve(__dirname, '..', 'packages', 'extension');
const OUT = path.join(__dirname, 'out');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function findChrome() {
  const base = path.join(__dirname, 'browsers', 'chrome');
  for (const d of fs.readdirSync(base)) {
    const p = path.join(base, d, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(p)) return p;
  }
  return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
}

(async () => {
  fs.rmSync(path.join(OUT, 'reload-debug'), { recursive: true, force: true });
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--user-data-dir=${path.join(OUT, 'reload-debug')}`]
  });
  try {
    const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'), { timeout: 15000 });
    const extId = new URL(sw.url()).host;
    log('original extId:', extId);
    const saver = await browser.newPage();
    await saver.goto(`chrome-extension://${extId}/saver.html`, { waitUntil: 'domcontentloaded' });
    await sleep(500);
    log('calling runtime.reload...');
    try {
      await saver.evaluate(() => chrome.runtime.reload());
    } catch (e) {
      log('reload evaluate error:', e.message);
    }
    for (let i = 1; i <= 6; i++) {
      await sleep(1000);
      const targets = browser.targets().filter((t) => t.url().startsWith('chrome-extension://')).map((t) => `${t.type()}:${t.url().slice(-40)}`);
      log(`t+${i}s targets:`, targets.join(' | ') || '(none)');
      const pages = await browser.pages();
      for (const p of pages) {
        try {
          const state = await p.evaluate(() => ({ url: location.href.slice(0, 50), id: (chrome.runtime && chrome.runtime.id) || null }));
          log(`  page: ${state.url} runtimeId=${state.id}`);
        } catch (e) {
          log(`  page: ${p.url().slice(0, 50)} (evaluate failed: ${e.message.slice(0, 40)})`);
        }
      }
    }
    try {
      const p2 = await browser.newPage();
      await p2.goto(`chrome-extension://${extId}/saver.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      log('re-navigation to same extId SUCCEEDED');
    } catch (e) {
      log('re-navigation failed:', e.message.slice(0, 80));
    }
  } finally {
    await browser.close();
  }
})();
