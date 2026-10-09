(() => {
  if (window.__DA_IMAGE_HUNTER__) return;
  window.__DA_IMAGE_HUNTER__ = true;

  const WIX_HOST = /^images-wixmp-[a-z0-9]+\.wixmp\.com$/i;
  const EXPLORE_HEADING = /^(?:explore\s+(?!more\b).+|from\s+deviants\s+you\s+watch)$/i;
  const ROLE_RANK = { download: 0, max: 1, original: 2, fullview: 3, preview: 4, variant: 5, scaled: 6, crop: 7 };
  const ROLE_LABEL = { download: 'original', max: 'max', original: 'original', fullview: 'fullview', preview: 'preview', variant: 'variant', scaled: 'scaled', crop: 'thumb' };
  let showExploreImages = false;
  let allowAnyPage = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function decodeCaps(token) {
    if (!token) return null;
    try {
      const part = token.split('.')[1];
      if (!part) return null;
      const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4);
      const json = JSON.parse(atob(padded));
      const o = json && json.obj && json.obj[0] && json.obj[0][0];
      if (!o) return null;
      const num = (s) => {
        const m = /(\d+)/.exec(String(s == null ? '' : s));
        return m ? Number(m[1]) : 0;
      };
      const w = num(o.width);
      const h = num(o.height);
      if (!w && !h) return null;
      return { w, h };
    } catch (e) {
      return null;
    }
  }

  function parseVariant(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let url;
    try {
      url = new URL(raw.trim().replace(/&amp;/g, '&'));
    } catch (e) {
      return null;
    }
    if (!WIX_HOST.test(url.hostname)) {
      if (!allowAnyPage || !/^https?:$/.test(url.protocol)) return null;
      const genericExt = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.exec(url.pathname);
      if (!genericExt) return null;
      const ext = genericExt[1].toLowerCase().replace('jpeg', 'jpg');
      return {
        url: url.toString(),
        base: url.toString(),
        shortId: '',
        ext,
        w: 0,
        h: 0,
        q: 0,
        type: null,
        pretty: url.pathname.split('/').pop() || '',
        token: null,
        caps: null,
        role: 'max'
      };
    }
    if (url.pathname.includes('{') || url.pathname.includes('}')) return null;
    const m = url.pathname.match(/^(\/f\/[^/]+\/[^/]+\.(png|jpe?g|gif|webp|bmp|avif))(\/v1\/.*)?$/i);
    if (!m) return null;
    const ext = m[2].toLowerCase() === 'jpeg' ? 'jpg' : m[2].toLowerCase();
    const transform = m[3] || '';
    const pick = (re) => {
      const x = re.exec(transform);
      return x ? Number(x[1]) : 0;
    };
    const w = pick(/w_(\d+)/);
    const h = pick(/h_(\d+)/);
    const q = pick(/q_(\d+)/);
    const tm = /\/v1\/(fill|fit|crop)/.exec(transform);
    const pretty = url.pathname.split('/').pop() || '';
    const token = url.searchParams.get('token');
    let role = 'variant';
    if (!transform) role = 'original';
    else if (tm && tm[1] === 'crop') role = 'crop';
    else if (/-pre[.-]/.test(pretty)) role = 'preview';
    else if (/-fullview/.test(pretty)) role = 'fullview';
    else if (/-\d+[ws](-2x)?\./.test(pretty)) role = 'scaled';
    const caps = decodeCaps(token);
    return {
      url: url.toString(),
      base: url.origin + m[1],
      shortId: (/\/f\/[^/]+\/([a-z0-9]+)-/i.exec(m[1]) || [])[1] || '',
      ext,
      w,
      h,
      q,
      type: tm ? tm[1] : null,
      pretty,
      token,
      caps,
      role
    };
  }

  function resolveDims(rec, v) {
    if (rec.naturalW && rec.naturalH && rec.naturalOf === v.url) return { w: rec.naturalW, h: rec.naturalH, exact: true };
    if (v.w && v.h) return { w: v.w, h: v.h, exact: true };
    const cw = v.caps && v.caps.w;
    const ch = v.caps && v.caps.h;
    if (v.w && !v.h && cw && ch) return { w: v.w, h: Math.round((v.w * ch) / cw), exact: false };
    if (!v.w && v.h && cw && ch) return { w: Math.round((v.h * cw) / ch), h: v.h, exact: false };
    if (!v.type && cw && ch) return { w: cw, h: ch, exact: true };
    if (rec.naturalW && rec.naturalH) return { w: rec.naturalW, h: rec.naturalH, exact: false };
    return { w: 0, h: 0, exact: false };
  }

  function qualityTier(w) {
    if (!w) return '';
    if (w >= 3840) return '4K+';
    if (w >= 2560) return 'QHD+';
    if (w >= 1920) return 'FHD';
    if (w >= 1280) return 'HD';
    return 'SD';
  }

  function upgradeQuality(url) {
    if (!/\/v1\/(fill|fit|crop)\//.test(url)) return null;
    if (/q_\d+/.test(url)) return url.replace(/q_\d+/, 'q_100');
    const m = url.match(/^(.+\/v1\/(?:fill|fit|crop)\/[^/]+?)(,strp)?(\/[^?]*)(\?.*)?$/);
    if (!m) return null;
    return `${m[1]},q_100${m[2] || ''}${m[3]}${m[4] || ''}`;
  }

  function sectionBad(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const tag = n.tagName;
      if (tag === 'ASIDE' || tag === 'NAV' || tag === 'HEADER' || tag === 'FOOTER') return true;
    }
    return false;
  }

  function getPageRoots() {
    const roots = [document];
    for (let i = 0; i < roots.length; i++) {
      roots[i].querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) roots.push(el.shadowRoot);
      });
    }
    return roots;
  }

  function collectSectionHeadings() {
    const headingSelector = 'h1, h2, h3, h4, h5, h6, [role="heading"]';
    const customSelector = '[class*="heading" i], [class*="section-title" i], [data-testid*="heading" i], [data-testid*="section-title" i]';
    const entries = [];
    const targetPositions = new Map();

    getPageRoots().forEach((root) => {
      root.querySelectorAll(headingSelector).forEach((el) => {
        const tagLevel = /^H([1-6])$/.exec(el.tagName);
        const level = Number(el.getAttribute('aria-level')) || (tagLevel ? Number(tagLevel[1]) : 2);
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const top = rect.top + window.scrollY;
        entries.push({ el, level, top, explore: EXPLORE_HEADING.test(text) });
        if (EXPLORE_HEADING.test(text)) {
          const key = `${text.toLowerCase()}|${Math.round(top)}`;
          const prev = targetPositions.get(key);
          if (!prev || level > prev.level) targetPositions.set(key, { el, level, top, explore: true });
        }
      });

      root.querySelectorAll(customSelector).forEach((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!EXPLORE_HEADING.test(text)) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const top = rect.top + window.scrollY;
        const key = `${text.toLowerCase()}|${Math.round(top)}`;
        if (!targetPositions.has(key)) targetPositions.set(key, { el, level: 2, top, explore: true });
      });
    });

    const targets = [...targetPositions.values()];
    const seen = new Set(entries.map((entry) => entry.el));
    targets.forEach((entry) => {
      if (!seen.has(entry.el)) entries.push(entry);
    });
    return entries.sort((a, b) => a.top - b.top || a.level - b.level);
  }

  function inExploreSection(el, headings) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const top = rect.top + window.scrollY;

    for (const heading of headings) {
      if (!heading.explore || heading.top > top) continue;
      let ended = false;
      for (const next of headings) {
        if (next.top <= heading.top + 1 || next.level > heading.level) continue;
        if (next.top <= top) ended = true;
        break;
      }
      if (!ended) return true;
    }
    return false;
  }

  function collectCandidates() {
    const map = new Map();
    const add = (raw, info) => {
      if (!raw || typeof raw !== 'string') return;
      const s = raw.trim().replace(/&amp;/g, '&');
      if (!/^https?:\/\//i.test(s)) return;
      const prev = map.get(s);
      if (prev) {
        prev.rw = Math.max(prev.rw, info.rw || 0);
        prev.rh = Math.max(prev.rh, info.rh || 0);
        prev.naturalW = Math.max(prev.naturalW, info.naturalW || 0);
        prev.naturalH = Math.max(prev.naturalH, info.naturalH || 0);
        if (info.naturalOf) prev.naturalOf = info.naturalOf;
        if (info.el && !prev.el) prev.el = info.el;
        if (info.primary) prev.primary = true;
        if (info.inArtLink) prev.inArtLink = true;
        if (info.fromScript) prev.fromScript = true;
        return;
      }
      map.set(s, Object.assign({ url: s, rw: 0, rh: 0, naturalW: 0, naturalH: 0 }, info));
    };
    const addSrcset = (ss, info) => {
      if (!ss) return;
      const re = /(https?:\/\/[^\s]+?)\s+([0-9.]+)([wx])(?=\s*(?:,|$))/g;
      let m;
      let found = false;
      while ((m = re.exec(ss))) {
        found = true;
        add(m[1], info);
      }
      if (!found) {
        ss.split(/\s*,\s*/).forEach((t) => {
          const u = t.trim().split(/\s+/)[0];
          if (/^https?:/i.test(u)) add(u, info);
        });
      }
    };

    const roots = getPageRoots();

    roots.forEach((root) => {
      root.querySelectorAll('img').forEach((img) => {
        const rect = img.getBoundingClientRect();
        const current = img.currentSrc || img.src || '';
        const info = {
          rw: Math.round(rect.width),
          rh: Math.round(rect.height),
          naturalW: img.naturalWidth || 0,
          naturalH: img.naturalHeight || 0,
          naturalOf: img.naturalWidth ? (img.currentSrc || img.src || '') : '',
          el: img,
          primary: true,
          inArtLink: !!img.closest('a[href*="/art/"]')
        };
        add(current, info);
        addSrcset(img.getAttribute('srcset'), info);
        addSrcset(img.getAttribute('data-srcset'), info);
        ['data-src', 'data-original', 'data-lazy-src', 'data-image', 'data-full', 'data-hires'].forEach((a) => add(img.getAttribute(a), info));
        const pic = img.closest('picture');
        if (pic) {
          pic.querySelectorAll('source').forEach((s) => {
            addSrcset(s.getAttribute('srcset'), info);
            add(s.getAttribute('src'), info);
          });
        }
      });
      root.querySelectorAll('[style*="wixmp"]').forEach((el) => {
        const bg = el.style && el.style.backgroundImage;
        const m = bg && /url\(["']?([^"')]+)["']?\)/.exec(bg);
        if (!m) return;
        const rect = el.getBoundingClientRect();
        add(m[1], { rw: Math.round(rect.width), rh: Math.round(rect.height), el });
      });
    });

    let scriptText = '';
    document.querySelectorAll('script').forEach((s) => {
      const t = s.textContent;
      if (t && t.includes('wixmp')) scriptText += t + '\n';
    });
    const normalized = scriptText.replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
    const re = /https?:\/\/images-wixmp-[a-z0-9]+\.wixmp\.com\/f\/[^"'\s\\<>]+/gi;
    let mm;
    let guard = 0;
    while ((mm = re.exec(normalized)) && guard < 500) {
      add(mm[0], { fromScript: true });
      guard++;
    }
    return map;
  }

  function findDownloadUrl(mainBase, deviationId) {
    const found = new Set();
    document.querySelectorAll('a[href*="/download/"]').forEach((a) => {
      if (sectionBad(a)) return;
      const href = a.href || a.getAttribute('href') || '';
      if (/deviantart\.com\/download\//i.test(href)) found.add(href);
    });
    let scriptText = '';
    document.querySelectorAll('script').forEach((s) => {
      const t = s.textContent;
      if (t && t.includes('download')) scriptText += t + '\n';
    });
    const normalized = scriptText.replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
    const re = /https:\/\/www\.deviantart\.com\/download\/[^"'\s\\<>]+/gi;
    let mm;
    let guard = 0;
    while ((mm = re.exec(normalized)) && guard < 50) {
      found.add(mm[0]);
      guard++;
    }
    if (!found.size) return null;
    const mainShortId = mainBase ? ((/\/f\/[^/]+\/([a-z0-9]+)-/i.exec(mainBase) || [])[1] || '') : '';
    const scored = [...found].map((u) => {
      const idMatch = /\/download\/(\d+)\//.exec(u);
      const file = u.split('/').pop() || '';
      let score = 0;
      if (deviationId && idMatch && idMatch[1] === deviationId) score += 4;
      if (mainShortId && file.startsWith(mainShortId)) score += 2;
      return { u, score };
    }).sort((a, b) => b.score - a.score);
    if (scored[0].score > 0) return scored[0].u;
    return scored.length === 1 ? scored[0].u : null;
  }

  function findMainBase(variantList) {
    const og = document.querySelector('meta[property="og:image"]');
    if (og && og.content) {
      const p = parseVariant(og.content);
      if (p) return p.base;
    }
    const twitter = document.querySelector('meta[name="twitter:image"]');
    if (twitter && twitter.content) {
      const p = parseVariant(twitter.content);
      if (p) return p.base;
    }
    let best = null;
    let area = 0;
    variantList.forEach((v) => {
      const a = v.rw * v.rh;
      if (v.primary && v.type !== 'crop' && a > area) {
        area = a;
        best = v;
      }
    });
    if (best) return best.base;
    let big = null;
    let bigArea = 0;
    variantList.forEach((v) => {
      const a = v.w * v.h;
      if (a > bigArea) {
        bigArea = a;
        big = v;
      }
    });
    return big ? big.base : null;
  }

  function buildAsset(base, list, downloadUrl) {
    const capsV = list.find((v) => v.caps && v.caps.w && v.caps.h);
    const tokenV = list.find((v) => v.token);
    const caps = capsV ? capsV.caps : null;
    const ext = list[0].ext;
    const images = [];
    const seen = new Set();
    const pushImage = (img) => {
      if (!img.url || seen.has(img.url)) return;
      seen.add(img.url);
      images.push(img);
    };

    list.forEach((v) => {
      const d = resolveDims(v, v);
      pushImage({
        url: v.url,
        w: d.w,
        h: d.h,
        exact: d.exact,
        q: v.q || 0,
        role: v.role,
        roleLabel: ROLE_LABEL[v.role] || v.role,
        ext: v.ext,
        tier: qualityTier(d.w)
      });
    });

    list.forEach((v) => {
      const up = upgradeQuality(v.url);
      if (!up || up === v.url) return;
      const d = resolveDims(v, v);
      pushImage({
        url: up,
        w: d.w,
        h: d.h,
        exact: d.exact,
        q: 100,
        role: v.role === 'original' ? 'variant' : v.role,
        roleLabel: `${ROLE_LABEL[v.role] || v.role} q100`,
        ext: v.ext,
        tier: qualityTier(d.w),
        upgraded: true
      });
    });

    let bestUrl = null;
    let bestW = caps ? caps.w : 0;
    let bestH = caps ? caps.h : 0;
    let bestExt = ext;
    if (caps && tokenV && tokenV.token) {
      const outExt = ext === 'png' ? 'png' : ext === 'gif' ? 'gif' : 'jpg';
      bestExt = outExt;
      bestUrl = `${base}/v1/fill/w_${caps.w},h_${caps.h},q_100,strp/devianthunter-original.${outExt}?token=${tokenV.token}`;
      pushImage({
        url: bestUrl,
        w: caps.w,
        h: caps.h,
        exact: true,
        q: 100,
        role: 'max',
        roleLabel: ext === 'png' && outExt === 'png' ? 'max lossless' : 'max q100',
        ext: outExt,
        tier: qualityTier(caps.w)
      });
    }
    if (downloadUrl) {
      const file = downloadUrl.split('/').pop() || '';
      const dext = (/\.([a-z0-9]+)(?:\?|$)/i.exec(file) || [])[1] || ext;
      pushImage({
        url: downloadUrl,
        w: 0,
        h: 0,
        exact: false,
        q: 0,
        role: 'download',
        roleLabel: 'original download',
        ext: dext.toLowerCase(),
        tier: '',
        verify: true
      });
    }

    images.sort((a, b) => {
      const ra = ROLE_RANK[a.role] - (a.upgraded ? 0.5 : 0);
      const rb = ROLE_RANK[b.role] - (b.upgraded ? 0.5 : 0);
      return (ra - rb) || (b.w * b.h) - (a.w * a.h);
    });

    const primary = list.filter((v) => v.primary).sort((a, b) => b.rw * b.rh - a.rw * a.rh)[0] || list[0];
    const maxPixels = Math.max(caps ? caps.w * caps.h : 0, ...images.map((i) => i.w * i.h));
    return {
      base,
      shortId: list[0].shortId || '',
      ext,
      caps,
      bestUrl,
      bestW,
      bestH,
      bestExt,
      downloadUrl: downloadUrl || null,
      thumbUrl: primary ? primary.url : (images[0] ? images[0].url : null),
      images,
      score: maxPixels
    };
  }

  function scanMainWindow() {
    const records = collectCandidates();
    const sectionHeadings = collectSectionHeadings();
    const variants = [];
    records.forEach((rec) => {
      const v = parseVariant(rec.url);
      if (!v) return;
      v.rw = rec.rw || 0;
      v.rh = rec.rh || 0;
      v.naturalW = rec.naturalW || 0;
      v.naturalH = rec.naturalH || 0;
      v.naturalOf = rec.naturalOf || '';
      v.primary = !!rec.primary;
      v.fromScript = !!rec.fromScript;
      v.inArtLink = !!rec.inArtLink;
      v.el = rec.el || null;
      variants.push(v);
    });

    const isDeviantArt = location.hostname === 'deviantart.com' || location.hostname.endsWith('.deviantart.com');
    const isArtPage = isDeviantArt && /\/art\//.test(location.pathname);
    const deviationId = (location.pathname.match(/-(\d+)\/?$/) || [])[1] || '';
    let mainBase = findMainBase(variants);
    if (!mainBase) {
      let bestArea = 0;
      variants.forEach((v) => {
        const a = v.rw * v.rh;
        if (v.primary && a > bestArea) {
          bestArea = a;
          mainBase = v.base;
        }
      });
    }
    const downloadUrl = isDeviantArt ? findDownloadUrl(mainBase, deviationId) : null;

    const kept = variants.filter((v) => {
      if (!v.base) return false;
      if (v.role === 'original') return false;
      if (isArtPage && mainBase) return v.base === mainBase;
      const inExplore = !!(v.el && inExploreSection(v.el, sectionHeadings));
      if (v.el && sectionBad(v.el) && !(showExploreImages && inExplore)) return false;
      if (!showExploreImages && inExplore) return false;
      if (v.fromScript) return false;
      if (v.rw >= 160 || v.rh >= 160 || v.inArtLink) return true;
      if (v.naturalW >= 400 && v.naturalH >= 400) return true;
      return false;
    });

    const byBase = new Map();
    kept.forEach((v) => {
      if (!byBase.has(v.base)) byBase.set(v.base, []);
      byBase.get(v.base).push(v);
    });

    const assets = [];
    for (const [base, list] of byBase) {
      let dl = null;
      if (downloadUrl && (!mainBase || base === mainBase)) dl = downloadUrl;
      else if (downloadUrl) {
        const shortId = list[0].shortId;
        if (shortId && (downloadUrl.split('/').pop() || '').startsWith(shortId)) dl = downloadUrl;
      }
      assets.push(buildAsset(base, list, dl));
    }
    assets.sort((a, b) => b.score - a.score);
    const capped = assets.slice(0, 600);

    const titleEl = document.querySelector('h1');
    const rawTitle = (titleEl && titleEl.textContent ? titleEl.textContent : document.title) || '';
    const title = rawTitle.replace(/\s+on DeviantArt\s*$/i, '').replace(/\s+by\s+[^|]+$/i, '').trim().slice(0, 140);
    const artist = isDeviantArt ? (location.pathname.split('/').filter(Boolean)[0] || '').replace(/^~/, '') : '';
    const reserved = /^(tag|tags|search|topics?|explore|popular|daily-deviations|deviants|settings|about|shop|prints|marketplace|studio|watch|notifications|submit|join|users|team)$/i;
    const isProfile = isDeviantArt && !isArtPage && !!artist && !reserved.test(artist);
    const downloadable = !!(downloadUrl && (!mainBase || capped.some((a) => a.downloadUrl)));

    return {
      ok: true,
      page: {
        url: location.href,
        title: title || document.title || 'Untitled',
        artist,
        isArtPage,
        isProfile,
        deviationId,
        mainBase,
        downloadUrl,
        downloadable,
        deepScanned: false,
        portalOpened: false,
        scannedAt: Date.now()
      },
      assets: capped,
      totalAssets: assets.length,
      truncated: assets.length > capped.length
    };
  }

  function fireClick(el) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: 1,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse'
    };
    const send = (type, Ctor, extra) => {
      try {
        el.dispatchEvent(new Ctor(type, Object.assign({}, base, extra)));
      } catch (e) { }
    };
    send('pointerdown', PointerEvent);
    send('mousedown', MouseEvent);
    send('pointerup', PointerEvent, { buttons: 0 });
    send('mouseup', MouseEvent, { buttons: 0, detail: 1 });
    send('click', MouseEvent, { buttons: 0, detail: 1 });
  }

  function centerClickTarget(el) {
    try {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && hit !== el) return hit;
    } catch (e) { }
    return el;
  }

  function closeOverlay() {
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
    } catch (e) { }
    const btn = document.querySelector('[aria-label*="close" i], button[class*="close" i], [class*="closeButton" i]');
    if (btn && btn.offsetParent !== null) {
      try {
        btn.click();
      } catch (e) { }
    }
  }

  function findMainArtworkElement(mainBase) {
    let best = null;
    let area = 0;
    document.querySelectorAll('img').forEach((img) => {
      const v = parseVariant(img.currentSrc || img.src || '');
      if (!v) return;
      if (mainBase && v.base !== mainBase) return;
      if (img.closest('a')) return;
      const r = img.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > area && r.width > 50 && r.height > 50) {
        area = a;
        best = img;
      }
    });
    return best;
  }

  async function deepScan(includeExploreImages = showExploreImages) {
    showExploreImages = !!includeExploreImages;
    const before = scanMainWindow();
    const target = findMainArtworkElement(before.page.mainBase);
    let portalOpened = false;
    if (target) {
      const known = new Set();
      before.assets.forEach((a) => a.images.forEach((i) => known.add(i.url)));
      const oldImgs = new WeakSet();
      document.querySelectorAll('img').forEach((el) => oldImgs.add(el));
      try {
        target.scrollIntoView({ block: 'center' });
      } catch (e) { }
      await sleep(300);
      fireClick(centerClickTarget(target));
      for (let i = 0; i < 25; i++) {
        await sleep(200);
        const freshEl = Array.from(document.querySelectorAll('img')).find((el) => !oldImgs.has(el) && /wixmp/.test(el.currentSrc || el.src || '') && (el.naturalWidth || 0) >= (target.naturalWidth || 0));
        if (freshEl) {
          portalOpened = true;
          break;
        }
        const now = scanMainWindow();
        let fresh = false;
        now.assets.forEach((a) => a.images.forEach((img) => {
          if (!known.has(img.url) && img.role !== 'max' && !img.upgraded) fresh = true;
        }));
        if (fresh) {
          portalOpened = true;
          break;
        }
      }
      closeOverlay();
      await sleep(250);
    }
    const after = scanMainWindow();
    after.page.deepScanned = true;
    after.page.portalOpened = portalOpened;
    return after;
  }

  function normalizeScripts(s) {
    return s.replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
  }

  function toLocalDateKey(value) {
    if (!value) return '';
    const normalized = String(value).replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return String(value).slice(0, 10);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function parseGalleryHtml(html) {
    const text = normalizeScripts(html);
    const items = [];
    const seen = new Set();
    const idRe = /\\"deviationId\\":(\d+)/g;
    let m;
    let guard = 0;
    while ((m = idRe.exec(text)) && guard < 2000) {
      guard++;
      const id = m[1];
      if (seen.has(id)) continue;
      const scope = text.slice(m.index, m.index + 5000);
      const pick = (re) => {
        const x = re.exec(scope);
        return x ? x[1] : null;
      };
      const url = pick(/\\"url\\":\\"([^"\\]+)\\"/);
      const publishedTime = pick(/\\"publishedTime\\":\\"([^"\\]+)\\"/);
      if (!url || !publishedTime) continue;
      if (pick(/\\"isVideo\\":(true|false)/) === 'true') continue;
      const baseUri = pick(/\\"media\\":\{\\"baseUri\\":\\"([^"\\]+)\\"/);
      const prettyName = pick(/\\"prettyName\\":\\"([^"\\]+)\\"/);
      const token = pick(/\\"token\\":\[\\"([^"\\]+)\\"/);
      if (!baseUri || !token) continue;
      seen.add(id);
      const extMatch = /\.(png|jpe?g|gif|webp)$/i.exec(baseUri);
      const ext = extMatch ? extMatch[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
      const caps = decodeCaps(token);
      const outExt = ext === 'png' ? 'png' : ext === 'gif' ? 'gif' : 'jpg';
      const name = prettyName || `deviation-${id}`;
      let bestUrl;
      let w = 0;
      let h = 0;
      if (caps && caps.w && caps.h) {
        w = caps.w;
        h = caps.h;
        bestUrl = `${baseUri}/v1/fill/w_${caps.w},h_${caps.h},q_100,strp/${name}.${outExt}?token=${token}`;
      } else {
        bestUrl = `${baseUri}/v1/fill/w_1280,h_1280,q_100,strp/${name}.${outExt}?token=${token}`;
      }
      const title = pick(/\\"title\\":\\"([^"\\]{1,200})\\"/) || `deviation-${id}`;
      const tw = caps && caps.w ? Math.min(250, caps.w) : 250;
      const th = caps && caps.h ? Math.min(250, caps.h) : 250;
      items.push({
        id,
        url,
        title: title.replace(/\\(.)/g, '$1'),
        date: toLocalDateKey(publishedTime),
        publishedTime,
        ext: outExt,
        w,
        h,
        bestUrl,
        thumbUrl: `${baseUri}/v1/fill/w_${tw},h_${th},q_70,strp/${name}-${tw}t.${outExt}?token=${token}`
      });
    }
    return items;
  }

  let profileScanBusy = false;

  async function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { credentials: 'include', signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function profileScan(opts) {
    if (profileScanBusy) return { ok: false, error: 'A profile scan is already running.' };
    profileScanBusy = true;
    try {
      const artist = String(opts.artist || '').replace(/[^a-z0-9_-]/gi, '');
      if (!artist) return { ok: false, error: 'No profile name detected on this page.' };
      const from = opts.from || '';
      const to = opts.to || '';
      const maxPages = Math.min(Math.max(1, Number(opts.maxPages) || 120), 250);
      const startedAt = Date.now();
      const out = [];
      const seen = new Set();
      let pagesFetched = 0;
      let stoppedEarly = false;
      let timedOut = false;
      let emptyStreak = 0;
      for (let page = 1; page <= maxPages; page++) {
        if (Date.now() - startedAt > 90000) {
          timedOut = true;
          break;
        }
        let html;
        try {
          const res = await fetchWithTimeout(`${location.origin}/${encodeURIComponent(artist)}/gallery/all?page=${page}`, 20000);
          if (!res.ok) break;
          html = await res.text();
        } catch (e) {
          break;
        }
        pagesFetched++;
        const items = parseGalleryHtml(html);
        if (!items.length) break;
        let addedThisPage = 0;
        for (const it of items) {
          if (from && it.date < from) continue;
          if (to && it.date > to) continue;
          if (seen.has(it.id)) continue;
          seen.add(it.id);
          out.push(it);
          addedThisPage++;
        }
        try {
          chrome.runtime.sendMessage({ type: 'DA_PROFILE_PROGRESS', artist, page: pagesFetched, found: out.length });
        } catch (e) { }
        if (from && addedThisPage === 0) {
          emptyStreak++;
          if (emptyStreak >= 3) {
            stoppedEarly = true;
            break;
          }
        } else {
          emptyStreak = 0;
        }
        await sleep(250);
      }
      out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      return { ok: true, artist, from, to, items: out, pages: pagesFetched, stoppedEarly, timedOut, hasMore: !stoppedEarly && (timedOut || pagesFetched >= maxPages) };
    } finally {
      profileScanBusy = false;
    }
  }

  window.__DA_API = {
    scan: (includeExploreImages = showExploreImages) => {
      showExploreImages = !!includeExploreImages;
      return scanMainWindow();
    },
    deepScan,
    profileScan
  };

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'DA_PING') {
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'DA_SCAN') {
      try {
        showExploreImages = !!msg.showExploreImages;
        allowAnyPage = !!msg.allowAnyPage;
        sendResponse(scanMainWindow());
      } catch (e) {
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      }
      return;
    }
    if (msg.type === 'DA_DEEP_SCAN') {
      showExploreImages = !!msg.showExploreImages;
      allowAnyPage = !!msg.allowAnyPage;
      deepScan()
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true;
    }
    if (msg.type === 'DA_PROFILE_SCAN') {
      profileScan(msg)
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true;
    }
  });
})();
