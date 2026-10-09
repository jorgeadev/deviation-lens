const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'https://www.deviantart.com/dutteart/art/Forest-Hobbit-Home-1383355420';
const OUT = __dirname;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const DEEP_SCAN_FN = () => {
  const found = [];
  const seen = new Set();
  const push = o => { const k = o.kind + '|' + o.src; if (seen.has(k)) return; seen.add(k); found.push(o); };
  const visit = root => {
    const all = root.querySelectorAll('*');
    for (const el of all) if (el.shadowRoot) visit(el.shadowRoot);
    for (const el of all) {
      if (el.tagName === 'IMG') {
        const r = el.getBoundingClientRect();
        push({ kind: 'img', tag: 'IMG', src: el.currentSrc || el.src || '', srcset: (el.getAttribute('srcset') || '').slice(0, 500), w: el.naturalWidth, h: el.naturalHeight, rw: Math.round(r.width), rh: Math.round(r.height), cls: ((el.className || '') + '').slice(0, 90), inLink: el.closest('a') ? (el.closest('a').getAttribute('href') || '').slice(0, 90) : null });
      }
      let bg = '';
      try { bg = getComputedStyle(el).backgroundImage || ''; } catch (e) { }
      if (bg && bg.includes('wixmp')) {
        const r = el.getBoundingClientRect();
        push({ kind: 'bg', tag: el.tagName, src: bg.slice(0, 500), srcset: '', w: 0, h: 0, rw: Math.round(r.width), rh: Math.round(r.height), cls: ((el.className || '') + '').slice(0, 90), inLink: el.closest('a') ? (el.closest('a').getAttribute('href') || '').slice(0, 90) : null });
      }
    }
  };
  visit(document);
  return found;
};

const decode = u => {
  try {
    const t = new URL(u).searchParams.get('token');
    if (!t) return null;
    const p = JSON.parse(Buffer.from(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return p.obj || p;
  } catch (e) { return null; }
};

async function probe(browser, { mobile, label, clickTarget }) {
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

  const timeline = [];
  page.on('request', r => timeline.push({ t: Date.now(), kind: 'req', method: r.method(), type: r.resourceType(), url: r.url() }));
  page.on('response', r => {
    const h = r.headers();
    timeline.push({ t: Date.now(), kind: 'resp', status: r.status(), url: r.url(), len: h['content-length'] || null, ctype: h['content-type'] || null });
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(3000);

  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button,a')).find(x => /^(accept|agree|got it|ok(ay)?|allow all|i agree)/i.test((x.textContent || '').trim())); if (b) b.click(); });
  await sleep(500);

  const scan1 = await page.evaluate(DEEP_SCAN_FN);
  const dmv1 = scan1.filter(i => i.src.includes(clickTarget));
  log(`[${label}] deepscan #1 total=${scan1.length} matching(${clickTarget})=${dmv1.length}`);
  dmv1.forEach(i => log(`[${label}]   ${i.kind} ${i.rw}x${i.rh} natural=${i.w}x${i.h} cls=${i.cls} inLink=${i.inLink ? 'Y' : 'N'} token=${JSON.stringify(decode(i.src))}`));

  const target = dmv1.filter(i => !i.inLink).sort((a, b) => (b.rw * b.rh) - (a.rw * a.rh))[0] || dmv1.sort((a, b) => (b.rw * b.rh) - (a.rw * a.rh))[0];
  if (!target) { log(`[${label}] NO TARGET`); await page.close(); return { label, error: 'no target', scan1 }; }

  log(`[${label}] target ${target.kind} ${target.rw}x${target.rh}`);
  let clicked = false;
  if (target) {
    const r2 = await page.evaluate(t => {
      const els = Array.from(document.querySelectorAll('*'));
      let best = null, area = 0;
      for (const el of els) {
        const bg = (() => { try { return getComputedStyle(el).backgroundImage || ''; } catch (e) { return ''; } })();
        const hit = el.tagName === 'IMG' ? ((el.currentSrc || el.src || '').includes(t)) : bg.includes(t);
        if (hit) { const r = el.getBoundingClientRect(); if (r.width * r.height > area) { best = el; area = r.width * r.height; } }
      }
      if (!best) return null;
      best.scrollIntoView({ block: 'center' });
      const r = best.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    }, clickTarget);
    if (r2) {
      const clickAt = Date.now();
      timeline.push({ t: clickAt, kind: 'marker', url: 'CLICK' });
      await page.mouse.click(r2.x, r2.y);
      clicked = true;
      log(`[${label}] clicked at ${Math.round(r2.x)},${Math.round(r2.y)}`);
      await sleep(6000);
    }
  }

  const scan2 = await page.evaluate(DEEP_SCAN_FN);
  const dmv2 = scan2.filter(i => i.src.includes(clickTarget));
  log(`[${label}] deepscan #2 total=${scan2.length} matching=${dmv2.length}`);
  dmv2.forEach(i => log(`[${label}]   ${i.kind} ${i.rw}x${i.rh} natural=${i.w}x${i.h} cls=${i.cls} token=${JSON.stringify(decode(i.src))}`));

  const portals = await page.evaluate(() => Array.from(document.querySelectorAll('.ReactModalPortal')).map(p => ({
    html: p.innerHTML.slice(0, 4000),
    imgs: Array.from(p.querySelectorAll('img')).map(i => ({ src: (i.currentSrc || i.src || '').slice(0, 600), w: i.naturalWidth, h: i.naturalHeight })),
    links: Array.from(p.querySelectorAll('a')).map(a => ({ href: (a.getAttribute('href') || '').slice(0, 300), text: (a.textContent || '').trim().slice(0, 60), cls: (a.className + '').slice(0, 80) }))
  })));

  await page.keyboard.press('Escape');
  await sleep(1500);
  const scan3 = await page.evaluate(DEEP_SCAN_FN);
  const dmv3 = scan3.filter(i => i.src.includes(clickTarget));

  const clickIdx = timeline.findIndex(e => e.kind === 'marker');
  const post = timeline.slice(clickIdx + 1);
  log(`[${label}] requests after click: ${post.filter(e => e.kind === 'req').length}`);
  post.filter(e => e.kind === 'req' && e.type !== 'image' && !/wixmp|\.js(\?|$)|\.css|\.woff|frog\.wix|\.svg|\.gif|\.png\?|st\.deviantart/.test(e.url)).forEach(e => log(`[${label}]  -> ${e.method} ${e.type} ${e.url.slice(0, 160)}`));
  post.filter(e => e.kind === 'resp' && /wixmp/.test(e.url)).forEach(e => log(`[${label}]  <- ${e.status} len=${e.len} ${e.ctype} ${e.url.slice(0, 150)}`));

  const result = { label, mobile, clicked, target, scan1, scan2, scan3, dmv1, dmv2, dmv3, portals, timeline: timeline.map(e => ({ ...e, token: e.kind === 'req' ? decode(e.url) : undefined })) };
  fs.writeFileSync(path.join(OUT, `probe2_${label}.json`), JSON.stringify(result, null, 2));
  log(`[${label}] saved probe2_${label}.json`);
  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-blink-features=AutomationControlled', '--lang=en-US']
  });
  try {
    await probe(browser, { mobile: true, label: 'mobile', clickTarget: 'dmvm3vg' });
    await probe(browser, { mobile: false, label: 'desktop', clickTarget: 'dmvm3vg' });
  } catch (e) { log('ERROR', e && e.stack || e); }
  finally { await browser.close(); log('done'); }
})();
