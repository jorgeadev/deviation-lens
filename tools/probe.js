const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'https://www.deviantart.com/dutteart/art/Forest-Hobbit-Home-1383355420';
const OUT = __dirname;

const log = (...a) => { console.log(new Date().toISOString().slice(11, 19), ...a); };

function decodeToken(u) {
  try {
    const token = new URL(u).searchParams.get('token');
    if (!token) return null;
    const payload = token.split('.')[1];
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (e) { return null; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function probe(browser, { mobile, label }) {
  log(`[${label}] opening page`);
  const page = await browser.newPage();
  if (mobile) {
    await page.emulate({
      viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    });
  } else {
    await page.setViewport({ width: 1600, height: 1000 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  }

  const requests = [];
  const responses = [];
  page.on('request', r => {
    const u = r.url();
    if (/wixmp\.com|deviantart\.net|deviantart\.com\/download/i.test(u)) requests.push(u);
  });
  page.on('response', r => {
    const u = r.url();
    if (/wixmp\.com|deviantart\.net|\/download\//i.test(u)) {
      const h = r.headers();
      responses.push({ url: u, status: r.status(), len: h['content-length'] || null, type: h['content-type'] || null });
    }
  });
  page.on('console', m => { if (m.type() === 'error') log(`[${label}] page error: ${m.text().slice(0, 200)}`); });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
  log(`[${label}] loaded`);
  await sleep(2500);

  await page.evaluate(async () => {
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 800));
    window.scrollTo(0, 0);
  });
  await sleep(1500);

  const snapshot = () => page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img')).map(i => ({
      src: (i.currentSrc || i.src || '').slice(0, 400),
      srcset: (i.getAttribute('srcset') || '').slice(0, 400),
      w: i.naturalWidth, h: i.naturalHeight,
      cw: i.clientWidth, ch: i.clientHeight,
      cls: ((i.className || '') + '').slice(0, 150),
      inLink: i.closest('a') ? i.closest('a').getAttribute('href') : null
    }));
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"],[class*="viewer" i],[class*="portal" i],[class*="zoom" i],[class*="lightbox" i]')).map(e => ({
      tag: e.tagName, cls: (e.className + '').slice(0, 150)
    }));
    const bodyKids = Array.from(document.body.children).map(e => e.tagName + '.' + ((e.className + '') || e.id || '').slice(0, 100));
    return { imgs, dialogs, bodyKids, title: document.title, url: location.href };
  });

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button,a')).find(b => /^(accept|agree|got it|ok(ay)?|allow all|i agree)/i.test((b.textContent || '').trim()));
    if (btn) btn.click();
  });
  await sleep(800);

  const before = await snapshot();
  log(`[${label}] before imgs=${before.imgs.length}`);

  const target = await page.evaluate(() => {
    let best = null, area = 0;
    for (const i of document.querySelectorAll('img')) {
      const a = i.naturalWidth * i.naturalHeight;
      const inArt = i.closest('a') && /\/art\//.test(i.closest('a').getAttribute('href') || '');
      if (a > area && i.naturalWidth > 300 && !inArt) { best = i; area = a; }
    }
    if (!best) return null;
    best.scrollIntoView({ block: 'center' });
    const r = best.getBoundingClientRect();
    return { src: (best.currentSrc || best.src), w: best.naturalWidth, h: best.naturalHeight, x: r.x + r.width / 2, y: r.y + r.height / 2, cls: (best.className + '').slice(0, 150) };
  });

  let clicked = null;
  if (target) {
    await sleep(500);
    log(`[${label}] clicking ${target.w}x${target.h} at ${Math.round(target.x)},${Math.round(target.y)}`);
    await page.mouse.click(target.x, target.y);
    clicked = target;
    await sleep(6000);
  } else {
    log(`[${label}] no click target`);
  }

  const after = await snapshot();
  log(`[${label}] after imgs=${after.imgs.length}`);

  await page.keyboard.press('Escape');
  await sleep(1200);
  const afterEsc = await snapshot();

  const reqSet = Array.from(new Set(requests)).map(u => ({ url: u, token: decodeToken(u) }));
  const result = { label, mobile, before, clicked, after, afterEsc, requests: reqSet, responses };
  fs.writeFileSync(path.join(OUT, `probe_${label}.json`), JSON.stringify(result, null, 2));
  log(`[${label}] saved probe_${label}.json`);
  await page.close();
}

(async () => {
  log('launching chrome');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-blink-features=AutomationControlled', '--lang=en-US']
  });
  log('chrome launched', await browser.version());
  try {
    await probe(browser, { mobile: true, label: 'mobile' });
    await probe(browser, { mobile: false, label: 'desktop' });
  } catch (e) {
    log('ERROR', e && e.stack ? e.stack : e);
  } finally {
    await browser.close();
    log('done');
  }
})();
