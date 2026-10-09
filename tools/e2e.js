const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXT = path.resolve(__dirname, '..', 'packages', 'extension');
const OUT = path.join(__dirname, 'out');
const DL = path.join(OUT, 'downloads');
const FOREST = 'https://www.deviantart.com/dutteart/art/Forest-Hobbit-Home-1383355420';
const NACHR = 'https://www.deviantart.com/nachr/art/Hobbit-Hole-1079563018';

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout, label, interval) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
    await sleep(interval || 300);
  }
}

function findChrome() {
  const base = path.join(__dirname, 'browsers', 'chrome');
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      const p = path.join(base, d, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(p)) return p;
    }
  }
  return CHROME;
}

async function launch(extensionPath, headless) {
  return puppeteer.launch({
    executablePath: findChrome(),
    headless,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--enable-unsafe-extension-debugging',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--user-data-dir=${path.join(OUT, 'profile')}`
    ]
  });
}

(async () => {
  fs.rmSync(path.join(OUT, 'profile'), { recursive: true, force: true });
  fs.mkdirSync(DL, { recursive: true });
  log('extension dir:', EXT);
  log('chrome:', findChrome());
  let browser = null;
  try {
    browser = await launch(EXT, true);
    let extId = null;
    try {
      const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'), { timeout: 15000 });
      extId = new URL(sw.url()).host;
    } catch (e) {
      log('no service worker target, using CDP loadUnpacked');
      const cdp0 = await browser.target().createCDPSession();
      const loaded = await cdp0.send('Extensions.loadUnpacked', { path: EXT });
      extId = loaded.id;
    }
    log('extension id:', extId);
    await sleep(1500);

    const cdp = await browser.target().createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });

    const forest = await browser.newPage();
    await forest.goto(FOREST, { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(2500);
    log('forest page loaded:', await forest.title());

    const popup = await browser.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const rows = await waitFor(async () => {
      const n = await popup.evaluate(() => document.querySelectorAll('.row').length);
      return n > 0 ? n : null;
    }, 30000, 'popup rows');
    log('forest popup rows:', rows);

    const pageMeta = await popup.evaluate(() => document.querySelector('#pageMeta').textContent);
    const summary = await popup.evaluate(() => document.querySelector('#summary').textContent);
    log('pageMeta:', pageMeta);
    log('summary:', summary);

    const rowDump = await popup.evaluate(() => Array.from(document.querySelectorAll('.row')).map((r) => ({
      role: r.dataset.role,
      best: r.classList.contains('best'),
      dims: r.querySelector('.dims').textContent,
      chips: Array.from(r.querySelectorAll('.chip')).map((c) => c.textContent).join(','),
      url: r.dataset.url.slice(0, 130)
    })));
    rowDump.forEach((r, i) => log(`row${i + 1}:`, JSON.stringify(r)));

    await waitFor(async () => {
      const txt = await popup.evaluate(() => Array.from(document.querySelectorAll('.size')).map((s) => s.textContent).join('|'));
      return /KB|MB/.test(txt) ? txt : null;
    }, 60000, 'sizes loaded');
    const sizesText = await popup.evaluate(() => Array.from(document.querySelectorAll('.size')).map((s) => s.textContent).join(' | '));
    log('sizes:', sizesText);

    const bestEnabled = await popup.evaluate(() => !document.querySelector('#btnBest').disabled);
    log('btnBest enabled:', bestEnabled);

    const outer1 = await popup.evaluate(() => {
      const d = document.scrollingElement;
      return d.scrollHeight > d.clientHeight + 1;
    });
    log('ASSERT forest popup has no outer scroll:', !outer1);

    const folderLabel = await popup.evaluate(() => document.querySelector('#folderLabel').textContent);
    log('ASSERT folder label default:', folderLabel);
    await popup.click('#btnFolder');
    const saver = await waitFor(async () => (await browser.pages()).find((p) => p.url().includes('saver.html')) || null, 15000, 'saver page');
    await sleep(1000);
    const saverState = await saver.evaluate(() => ({
      cur: document.querySelector('#curMode').textContent,
      radios: Array.from(document.querySelectorAll('input[name="mode"]')).map((r) => `${r.value}:${r.checked}`)
    }));
    log('saver state:', JSON.stringify(saverState));
    log('ASSERT default mode checked:', saverState.radios.includes('default:true'));
    await saver.screenshot({ path: path.join(OUT, 'saver_page.png') });
    await saver.evaluate(() => {
      const r = Array.from(document.querySelectorAll('input[name="mode"]')).find((x) => x.value === 'ask');
      r.checked = true;
      r.dispatchEvent(new Event('change'));
    });
    await waitFor(async () => {
      const t = await popup.evaluate(() => document.querySelector('#folderLabel').textContent);
      return t.includes('Ask') ? t : null;
    }, 8000, 'popup label updates to Ask');
    log('ASSERT popup folder label updated to Ask');
    await saver.click('#btnDefault');
    await waitFor(async () => {
      const t = await popup.evaluate(() => document.querySelector('#folderLabel').textContent);
      return t.includes('Default') ? t : null;
    }, 8000, 'popup label updates to Default');
    log('ASSERT popup folder label back to Default');
    await saver.close();
    await popup.bringToFront();

    await popup.screenshot({ path: path.join(OUT, 'popup_forest.png') });
    await popup.click('#btnBest');
    log('clicked Download best');

    const download = await waitFor(async () => {
      const items = await popup.evaluate(() => new Promise((res) => chrome.downloads.search({}, (r) => res(r))));
      const done = items.find((i) => i.state === 'complete');
      const err = items.find((i) => i.state === 'interrupted');
      if (err) throw new Error(`download interrupted: ${err.error}`);
      return done || null;
    }, 90000, 'download complete');
    log('download complete:', JSON.stringify({
      filename: download.filename,
      bytes: download.fileSize,
      mime: download.mime,
      url: download.finalUrl ? download.finalUrl.slice(0, 120) : null
    }));
    const exists = fs.existsSync(download.filename);
    log('file exists on disk:', exists, exists ? `(${fs.statSync(download.filename).size} bytes)` : '');

    const urlBeforeReveal = forest.url();
    await popup.click('#btnReveal');
    await waitFor(async () => {
      const label = await popup.evaluate(() => document.querySelector('#btnReveal').textContent);
      return label === 'Reveal full' ? label : null;
    }, 30000, 'reveal finished');
    await sleep(1500);
    const revealState = await popup.evaluate(() => ({
      rows: document.querySelectorAll('.row').length,
      notice: document.querySelector('#notice').textContent,
      meta: document.querySelector('#pageMeta').textContent
    }));
    log('reveal rows:', revealState.rows, '| notice:', revealState.notice);
    log('ASSERT reveal kept url:', forest.url() === urlBeforeReveal);
    await popup.screenshot({ path: path.join(OUT, 'popup_forest_revealed.png') });

    await forest.bringToFront();
    const nachr = await browser.newPage();
    await nachr.goto(NACHR, { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(2500);
    log('nachr page loaded:', await nachr.title());

    const popup2 = await browser.newPage();
    await popup2.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitFor(async () => {
      const n = await popup2.evaluate(() => document.querySelectorAll('.row').length);
      return n > 0 ? n : null;
    }, 30000, 'nachr popup rows');

    await sleep(4000);
    const nDump = await popup2.evaluate(() => ({
      pageMeta: document.querySelector('#pageMeta').textContent,
      summary: document.querySelector('#summary').textContent,
      rows: Array.from(document.querySelectorAll('.row')).map((r) => ({
        role: r.dataset.role,
        dims: r.querySelector('.dims').textContent,
        chips: Array.from(r.querySelectorAll('.chip')).map((c) => c.textContent).join(','),
        size: r.querySelector('.size').textContent,
        url: r.dataset.url.slice(0, 140)
      }))
    }));
    log('nachr pageMeta:', nDump.pageMeta);
    log('nachr summary:', nDump.summary);
    nDump.rows.forEach((r, i) => log(`nachr row${i + 1}:`, JSON.stringify(r)));
    await popup2.screenshot({ path: path.join(OUT, 'popup_nachr.png') });

    const hasDownloadRow = nDump.rows.some((r) => r.role === 'download');
    const hasQ100 = nDump.rows.some((r) => r.chips.includes('q100'));
    log('ASSERT download row present:', hasDownloadRow);
    log('ASSERT q100 upgrade present:', hasQ100);
    log('ASSERT best downloaded file > 1MB:', (download.fileSize || 0) > 1000000);

    await nachr.bringToFront();
    const profile = await browser.newPage();
    await profile.goto('https://www.deviantart.com/dutteart', { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(3000);
    log('profile page loaded:', await profile.title());

    const popup3 = await browser.newPage();
    await popup3.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitFor(async () => {
      const n = await popup3.evaluate(() => document.querySelectorAll('.row').length);
      return n > 0 ? n : null;
    }, 30000, 'profile popup rows');
    await sleep(2500);

    const profileState = await popup3.evaluate(() => ({
      rows: document.querySelectorAll('.row').length,
      assets: document.querySelectorAll('.asset-head').length,
      rangeVisible: !document.querySelector('#rangeBox').classList.contains('hidden'),
      bestVisible: !document.querySelector('#chkBestWrap').classList.contains('hidden'),
      from: document.querySelector('#rangeFrom').value,
      to: document.querySelector('#rangeTo').value,
      summary: document.querySelector('#summary').textContent
    }));
    log('PROFILE state:', JSON.stringify(profileState));
    log('ASSERT range box visible:', profileState.rangeVisible);
    log('ASSERT best-only visible:', profileState.bestVisible);
    const outer2 = await popup3.evaluate(() => {
      const d = document.scrollingElement;
      const list = document.querySelector('.list');
      return { outer: d.scrollHeight > d.clientHeight + 1, inner: list.scrollHeight > list.clientHeight + 1 };
    });
    log('ASSERT profile popup no outer scroll, inner list scrolls:', !outer2.outer && outer2.inner);

    const rowsBefore = profileState.rows;
    await popup3.evaluate(() => {
      const cb = document.querySelector('#chkBest');
      cb.checked = true;
      cb.dispatchEvent(new Event('change'));
    });
    await sleep(300);
    const rowsAfter = await popup3.evaluate(() => document.querySelectorAll('.row').length);
    log(`ASSERT best-only reduces rows: ${rowsBefore} -> ${rowsAfter}`, rowsAfter <= rowsBefore);
    await popup3.evaluate(() => {
      const cb = document.querySelector('#chkBest');
      cb.checked = false;
      cb.dispatchEvent(new Event('change'));
    });
    await popup3.screenshot({ path: path.join(OUT, 'popup_profile.png') });

    await popup3.evaluate(() => {
      const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const to = new Date().toISOString().slice(0, 10);
      document.querySelector('#rangeFrom').value = from;
      document.querySelector('#rangeTo').value = to;
      document.querySelector('#btnRangeScan').click();
    });
    const rangeDone = await waitFor(async () => {
      const txt = await popup3.evaluate(() => document.querySelector('#rangeStatus').textContent);
      return /image\(s\)|failed|Pick both|after the To/.test(txt) ? txt : null;
    }, 240000, 'range scan finished', 1000);
    log('range status:', rangeDone);
    const rangeDownload = await popup3.evaluate(() => ({
      disabled: document.querySelector('#btnRangeDownload').disabled,
      label: document.querySelector('#btnRangeDownload').textContent
    }));
    log('range download button:', JSON.stringify(rangeDownload));
    log('ASSERT range found images:', !rangeDownload.disabled);
    await popup3.screenshot({ path: path.join(OUT, 'popup_profile_range.png') });

    log('E2E DONE');
  } catch (e) {
    log('E2E ERROR:', e && e.stack || e);
    process.exitCode = 1;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { }
    }
    log('browser closed');
  }
})();
