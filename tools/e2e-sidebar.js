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
    await sleep(interval || 400);
  }
}

(async () => {
  fs.rmSync(path.join(OUT, 'sidebar-check'), { recursive: true, force: true });
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--user-data-dir=${path.join(OUT, 'sidebar-check')}`]
  });
  try {
    const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'), { timeout: 15000 });
    const extId = new URL(sw.url()).host;

    const forest = await browser.newPage();
    await forest.setViewport({ width: 1400, height: 900 });
    await forest.goto('https://www.deviantart.com/dutteart/art/Forest-Hobbit-Home-1383355420', { waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(2500);
    log('page loaded:', await forest.title());

    const pageUrl = forest.url();
    const helper = await browser.newPage();
    await helper.goto(`chrome-extension://${extId}/saver.html`, { waitUntil: 'domcontentloaded' });
    await sleep(500);
    const daTabId = await helper.evaluate(async (url) => {
      const tabs = await new Promise((r) => chrome.tabs.query({ url: '*://*.deviantart.com/*' }, r));
      const tab = tabs.find((t) => t.url === url) || tabs[tabs.length - 1];
      return tab ? tab.id : null;
    }, pageUrl);
    log('da tab id:', daTabId);
    const toggle = () => helper.evaluate((id) => new Promise((r) => chrome.runtime.sendMessage({ type: 'DA_TOGGLE_TAB', tabId: id }, r)), daTabId);

    const opened = await toggle();
    log('toggle open:', JSON.stringify(opened));
    await forest.bringToFront();

    await waitFor(async () => {
      const ready = await forest.evaluate(() => {
        const host = document.getElementById('da-image-hunter-sidebar');
        const root = host && host.shadowRoot;
        return !!(root && root.querySelectorAll('.row').length > 0);
      });
      return ready ? true : null;
    }, 30000, 'sidebar rows');
    await sleep(1500);

    const metrics = await forest.evaluate(() => {
      const host = document.getElementById('da-image-hunter-sidebar');
      const root = host.shadowRoot;
      const cs = getComputedStyle(host);
      const app = root.getElementById('app');
      const rows = root.querySelectorAll('.row').length;
      const count = root.querySelector('.listCount');
      const logo = root.querySelector('.logo');
      const withUrl = Array.from(root.querySelectorAll('*')).filter((e) => (e.currentSrc || e.src || '').includes('-extension://')).length;
      return {
        hostFound: true,
        width: cs.width,
        height: cs.height,
        top: cs.top,
        right: cs.right,
        position: cs.position,
        zIndex: cs.zIndex,
        innerHeight: window.innerHeight,
        appHeight: Math.round(app.getBoundingClientRect().height),
        rows,
        count: count ? count.textContent : '',
        logoLoaded: !!(logo && logo.src.startsWith('chrome-extension://') && logo.complete),
        extensionUrlsInShadow: withUrl
      };
    });
    log('sidebar metrics:', JSON.stringify(metrics));
    log('ASSERT 600px wide:', metrics.width === '600px');
    log('ASSERT full window height:', metrics.appHeight === metrics.innerHeight && metrics.height === `${metrics.innerHeight}px`);
    log('ASSERT fixed right overlay:', metrics.position === 'fixed' && metrics.right === '0px' && metrics.top === '0px');
    log('ASSERT content rendered:', metrics.rows > 0 && /asset/.test(metrics.count));
    log('ASSERT assets loaded in shadow:', metrics.logoLoaded);
    await forest.screenshot({ path: path.join(OUT, 'sidebar_panel.png') });

    await forest.evaluate(() => {
      const root = document.getElementById('da-image-hunter-sidebar').shadowRoot;
      root.querySelector('.sidebarMin').click();
    });
    await sleep(500);
    const minState = await forest.evaluate(() => {
      const host = document.getElementById('da-image-hunter-sidebar');
      const root = host.shadowRoot;
      const app = root.getElementById('app');
      const tab = root.querySelector('.sidebarTab');
      return {
        min: host.classList.contains('dah-min'),
        width: getComputedStyle(host).width,
        appHidden: getComputedStyle(app).display === 'none',
        tabShown: getComputedStyle(tab).display !== 'none'
      };
    });
    log('minimized:', JSON.stringify(minState));
    log('ASSERT minimizes to edge tab:', minState.min && minState.width === '46px' && minState.appHidden && minState.tabShown);
    await forest.screenshot({ path: path.join(OUT, 'sidebar_minimized.png') });

    await toggle();
    await sleep(500);
    const restored = await forest.evaluate(() => {
      const host = document.getElementById('da-image-hunter-sidebar');
      return host ? { min: host.classList.contains('dah-min'), width: getComputedStyle(host).width } : null;
    });
    log('restored:', JSON.stringify(restored));
    log('ASSERT toggle expands minimized panel:', !!restored && !restored.min && restored.width === '600px');

    await forest.reload({ waitUntil: 'networkidle2', timeout: 90000 });
    await forest.bringToFront();
    await waitFor(async () => forest.evaluate(() => !!document.getElementById('da-image-hunter-sidebar')), 20000, 'auto-mounted sidebar after reload');
    log('ASSERT panel state persisted across navigation (auto-open)');

    const closed = await toggle();
    await sleep(500);
    const gone = await forest.evaluate(() => !document.getElementById('da-image-hunter-sidebar'));
    log('toggle close:', JSON.stringify(closed));
    log('ASSERT sidebar removed on close:', gone);

    await forest.reload({ waitUntil: 'networkidle2', timeout: 90000 });
    await sleep(2500);
    const staysClosed = await forest.evaluate(() => !document.getElementById('da-image-hunter-sidebar'));
    log('ASSERT stays closed after reload:', staysClosed);

    log('--- on-demand injection path (used for tabs opened before the extension is loaded) ---');
    const forced = await helper.evaluate((id) => new Promise((r) => chrome.runtime.sendMessage({ type: 'DA_TOGGLE_TAB', tabId: id, forceInject: true }, r)), daTabId);
    log('forced inject toggle:', JSON.stringify(forced));
    log('ASSERT injection path succeeds:', !!(forced && forced.ok && forced.injected));
    await waitFor(async () => forest.evaluate(() => {
      const host = document.getElementById('da-image-hunter-sidebar');
      return !!(host && host.shadowRoot && host.shadowRoot.querySelectorAll('.row').length > 0);
    }), 30000, 'sidebar rows after forced injection');
    log('ASSERT panel opens after forced injection');
    const closedAfterInject = await toggle();
    await sleep(400);
    log('ASSERT toggles closed:', JSON.stringify(closedAfterInject), await forest.evaluate(() => !document.getElementById('da-image-hunter-sidebar')));
    log('DONE');
  } catch (e) {
    log('ERROR', (e && e.message) || e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
