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

async function waitFor(fn, timeout, label, interval) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
    await sleep(interval || 500);
  }
}

(async () => {
  fs.rmSync(path.join(OUT, 'profile-e2e'), { recursive: true, force: true });
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--user-data-dir=${path.join(OUT, 'profile-e2e')}`]
  });
  try {
    const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'), { timeout: 15000 });
    const extId = new URL(sw.url()).host;
    const tab = await browser.newPage();
    await tab.goto('https://www.deviantart.com/dutteart', { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(2500);
    const title = await tab.title();
    log('profile page:', title);
    if (/could not be satisfied|ERROR/i.test(title)) {
      log('RATE LIMITED still active');
      process.exitCode = 2;
      return;
    }

    const popup = await browser.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded' });
    await waitFor(async () => (await popup.evaluate(() => document.querySelectorAll('.row').length)) > 0 ? true : null, 30000, 'popup rows');
    await sleep(2000);

    const st = await popup.evaluate(() => ({
      rangeVisible: !document.querySelector('#rangeBox').classList.contains('hidden'),
      rangeHeight: Math.round(document.querySelector('#rangeBox').getBoundingClientRect().height),
      bestVisible: !document.querySelector('#chkBestWrap').classList.contains('hidden'),
      rows: document.querySelectorAll('.row').length,
      assets: document.querySelectorAll('.asset-head').length
    }));
    log('state:', JSON.stringify(st));
    log('ASSERT range box visible:', st.rangeVisible, '| height:', st.rangeHeight, '| best-only:', st.bestVisible);

    await popup.evaluate(() => {
      document.querySelector('#chkBest').checked = true;
      document.querySelector('#chkBest').dispatchEvent(new Event('change'));
    });
    await sleep(300);
    const bestRows = await popup.evaluate(() => document.querySelectorAll('.row').length);
    log('ASSERT best-only rows:', st.rows, '->', bestRows, bestRows <= st.assets);
    await popup.evaluate(() => {
      document.querySelector('#chkBest').checked = false;
      document.querySelector('#chkBest').dispatchEvent(new Event('change'));
    });

    await popup.evaluate(() => {
      const from = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
      const to = new Date().toISOString().slice(0, 10);
      document.querySelector('#rangeFrom').value = from;
      document.querySelector('#rangeTo').value = to;
      document.querySelector('#btnRangeScan').click();
    });
    const status = await waitFor(async () => {
      const txt = await popup.evaluate(() => document.querySelector('#rangeStatus').textContent);
      return /image\(s\)|failed|after the To|Pick both/.test(txt) ? txt : null;
    }, 180000, 'range scan', 1500);
    log('range status:', status);
    const dl = await popup.evaluate(() => ({
      disabled: document.querySelector('#btnRangeDownload').disabled,
      label: document.querySelector('#btnRangeDownload').textContent
    }));
    log('ASSERT range found images:', !dl.disabled, '|', JSON.stringify(dl));

    for (let i = 0; i < 40; i++) {
      const ok = await popup.evaluate(() => document.querySelectorAll('.row .thumb').length > 0 && Array.from(document.querySelectorAll('.thumb')).some((t) => t.naturalWidth > 0));
      if (ok) break;
      await sleep(500);
    }
    const rangeView = await popup.evaluate(() => ({
      rangeMode: !!state.data.rangeMode,
      rows: document.querySelectorAll('.row').length,
      count: document.querySelector('.listCount').textContent,
      firstHead: document.querySelector('.asset-head').textContent,
      chips: Array.from(document.querySelectorAll('.row .chip')).slice(0, 8).map((c) => c.textContent),
      pageMeta: document.querySelector('#pageMeta').textContent,
      thumbOk: Array.from(document.querySelectorAll('.thumb')).some((t) => t.naturalWidth > 0),
      sizeText: document.querySelector('.row .size').textContent
    }));
    log('range view:', JSON.stringify(rangeView));
    log('ASSERT range images in main list:', rangeView.rangeMode && rangeView.rows > 0);
    log('ASSERT count bar shows range:', rangeView.count.includes('Published'));
    log('ASSERT dates shown on rows:', rangeView.chips.some((c) => /^20\d\d-\d\d-\d\d$/.test(c)));
    log('ASSERT header shows date + title:', /^20\d\d-\d\d-\d\d · /.test(rangeView.firstHead));
    log('ASSERT thumbnails loaded:', rangeView.thumbOk);
    await popup.screenshot({ path: path.join(OUT, 'popup_profile_final.png') });
    log('DONE');
  } catch (e) {
    log('ERROR', e && e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
