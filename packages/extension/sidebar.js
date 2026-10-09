let $ = (s) => document.querySelector(s);
const state = {
  tabId: null,
  data: null,
  sizes: {},
  selected: new Set(),
  probe: null,
  batchId: null,
  pollTimer: null,
  busy: false,
  renderLimit: 40,
  range: { items: [], busy: false }
};

const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

function svgIcon(paths, size) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size || 14));
  svg.setAttribute('height', String(size || 14));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  paths.forEach((d) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  });
  return svg;
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtBytes(b) {
  if (b == null || !isFinite(b)) return '…';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = Number(b);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

const fmtDims = (w, h) => (w && h ? `${w}×${h}` : '—');

function sendBg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(res);
    });
  });
}

function showNotice(text, kind) {
  const n = $('#notice');
  if (!text) {
    n.classList.add('hidden');
    n.textContent = '';
    return;
  }
  n.className = `notice${kind ? ' ' + kind : ''}`;
  n.textContent = text;
}

function setProgress(text) {
  const p = $('#progress');
  if (!text) {
    p.classList.add('hidden');
    p.textContent = '';
    return;
  }
  p.classList.remove('hidden');
  p.textContent = text;
}

function setBusy(busy, label) {
  state.busy = busy;
  ['#btnRescan', '#btnReveal', '#btnBest', '#btnSelected', '#btnAll', '#btnCopy'].forEach((s) => {
    const b = $(s);
    if (b) b.disabled = busy || (s === '#btnBest' && !state.data);
  });
  $('#btnReveal').textContent = busy && label === 'reveal' ? 'Revealing…' : 'Reveal full';
  $('#btnRescan').textContent = busy && label === 'scan' ? 'Scanning…' : 'Rescan';
}

function allImages() {
  if (!state.data) return [];
  const out = [];
  state.data.assets.forEach((asset) => asset.images.forEach((img) => out.push({ img, asset })));
  return out;
}

function visibleImages() {
  const showSmall = $('#chkSmall').checked;
  let list = allImages();
  if (!showSmall) {
    list = list.filter(({ img }) => {
      if (img.role === 'crop') return false;
      if (img.role === 'scaled' && Math.max(img.w || 0, img.h || 0) < 400) return false;
      return true;
    });
  }
  const bestWrap = $('#chkBestWrap');
  const bestOnly = $('#chkBest').checked && bestWrap && !bestWrap.classList.contains('hidden');
  if (bestOnly) {
    const rank = (img) => (img.role === 'download' ? 0 : img.role === 'max' ? 1 : 2);
    const byAsset = new Map();
    list.forEach((entry) => {
      const cur = byAsset.get(entry.asset);
      if (!cur) {
        byAsset.set(entry.asset, entry);
        return;
      }
      const re = rank(entry.img);
      const rc = rank(cur.img);
      if (re < rc || (re === rc && (entry.img.w * entry.img.h) > (cur.img.w * cur.img.h))) {
        byAsset.set(entry.asset, entry);
      }
    });
    list = [...byAsset.values()];
  }
  return list;
}

function updateActionLabels() {
  const visible = visibleImages();
  const checked = visible.filter(({ img }) => state.selected.has(img.url));
  $('#btnSelected').textContent = `Download selected (${checked.length})`;
  $('#btnSelected').disabled = state.busy || checked.length === 0;
  $('#btnAll').disabled = state.busy || visible.length === 0;
  const hasBest = pickBest().length > 0;
  $('#btnBest').disabled = state.busy || !hasBest;
  const dl = state.data && state.data.page && state.data.page.downloadUrl;
  $('#btnBest').title = dl ? 'Prefers the original download from the page when available' : 'Max quality reconstruction from the CDN token limits';
}

function renderSummary() {
  const d = state.data;
  const s = $('#summary');
  s.classList.remove('hidden');
  s.textContent = '';
  const imgs = allImages();
  const bestDims = imgs.reduce((acc, { img }) => {
    const px = (img.w || 0) * (img.h || 0);
    return px > acc.px ? { px, label: fmtDims(img.w, img.h) } : acc;
  }, { px: 0, label: '—' });

  const add = (text, cls) => {
    const span = el('span', cls || '');
    span.textContent = text;
    s.appendChild(span);
  };

  if (d.rangeMode) {
    add(`${imgs.length} image${imgs.length === 1 ? '' : 's'} published in range`);
    add(`${d.assets.length} deviation${d.assets.length === 1 ? '' : 's'}`);
  } else {
    add(`${imgs.length} image${imgs.length === 1 ? '' : 's'} found`);
    add(`${d.assets.length} asset${d.assets.length === 1 ? '' : 's'} on page`);
  }
  add(`best ${bestDims.label}`);
  if (d.page.downloadUrl) add('original download detected', 'ok');
  else if (d.assets.some((a) => a.bestUrl)) add('max CDN quality reconstructed');
  if (d.truncated) add(`more than ${d.assets.length} assets found, only these were transferred`, 'warn');
}

function chip(text, cls) {
  const c = el('span', `chip${cls ? ' ' + cls : ''}`);
  c.textContent = text;
  return c;
}

function buildRow(img, asset) {
  const li = el('li', 'row');
  li.dataset.url = img.url;
  li.dataset.role = img.role;
  if (img.role === 'download' || img.role === 'max') li.classList.add('best');

  const pick = el('input', 'pick');
  pick.type = 'checkbox';
  pick.checked = state.selected.has(img.url);
  pick.addEventListener('change', () => {
    if (pick.checked) state.selected.add(img.url);
    else state.selected.delete(img.url);
    updateActionLabels();
  });
  li.appendChild(pick);

  const thumb = el('img', 'thumb');
  thumb.loading = 'lazy';
  thumb.alt = '';
  thumb.src = asset.thumbUrl || img.url;
  thumb.addEventListener('error', () => {
    if (thumb.src !== img.url) thumb.src = img.url;
  });
  li.appendChild(thumb);

  const meta = el('div', 'meta');
  const line1 = el('div', 'line1');
  const dims = el('span', 'dims');
  dims.textContent = img.role === 'download' ? 'original file' : fmtDims(img.w, img.h);
  line1.appendChild(dims);
  const size = el('span', 'size');
  size.dataset.sizeFor = img.url;
  size.textContent = '…';
  line1.appendChild(size);
  meta.appendChild(line1);

  const line2 = el('div', 'line2');
  if (asset && asset.date) line2.appendChild(chip(asset.date, 'tier'));
  line2.appendChild(chip(img.roleLabel, img.role === 'download' ? 'role-download' : img.role === 'max' ? 'role-max' : ''));
  if (img.role === 'download') line2.appendChild(chip(img.ext.toUpperCase()));
  else {
    if (img.q) line2.appendChild(chip(`q${img.q}`));
    line2.appendChild(chip(img.ext.toUpperCase()));
    if (img.tier) line2.appendChild(chip(img.tier, 'tier'));
    if (!img.exact) line2.appendChild(chip('approx'));
  }
  meta.appendChild(line2);
  li.appendChild(meta);

  const actions = el('div', 'rowActions');
  const mkIcon = (cls, title, paths) => {
    const b = el('button', `iconBtn ${cls}`);
    b.title = title;
    b.appendChild(svgIcon(paths));
    return b;
  };
  actions.appendChild(mkIcon('dl', 'Download this image', ['M12 4v11', 'm7 10 5 5 5-5', 'M5 20h14']));
  actions.appendChild(mkIcon('open', 'Open in a new tab', ['M14 4h6v6', 'M20 4l-9 9', 'M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4']));
  actions.appendChild(mkIcon('copy', 'Copy URL', ['M9 9h10v10H9z', 'M5 15V5h10']));
  li.appendChild(actions);
  return li;
}

function renderList(keepScroll) {
  const list = $('#list');
  const prevScroll = keepScroll ? list.scrollTop : 0;
  list.textContent = '';
  const d = state.data;
  const visible = visibleImages();
  if (!d.assets.length || !visible.length) {
    const empty = el('li', 'empty');
    const big = el('div', 'big');
    big.textContent = 'No images found in the main view';
    const small = el('div', '');
    small.textContent = 'Open a deviation page, a gallery, or scroll the page so the images load, then press Rescan.';
    empty.appendChild(big);
    empty.appendChild(small);
    list.appendChild(empty);
    return;
  }
  const visibleSet = new Set(visible.map((v) => v.img));
  const total = d.assets.length;
  const shown = Math.min(state.renderLimit, total);

  const countBar = el('li', 'listCount');
  if (d.rangeMode) {
    countBar.textContent = `Published ${d.rangeMode.from} → ${d.rangeMode.to} · showing ${shown} of ${total} · ${visible.length} image${visible.length === 1 ? '' : 's'}`;
  } else {
    countBar.textContent = `Showing ${shown} of ${total} asset${total === 1 ? '' : 's'} · ${visible.length} image${visible.length === 1 ? '' : 's'}`;
  }
  if (d.truncated) {
    const warn = el('span', 'warn');
    warn.textContent = '600+ assets, only the first 600 were transferred';
    countBar.appendChild(warn);
  }
  list.appendChild(countBar);

  const showSmall = $('#chkSmall').checked;
  d.assets.slice(0, shown).forEach((asset, idx) => {
    const rows = asset.images.filter((img) => visibleSet.has(img));
    if (!rows.length) return;
    const head = el('li', 'asset-head');
    if (asset.title) {
      const t = asset.title.length > 64 ? asset.title.slice(0, 61) + '…' : asset.title;
      head.textContent = `${asset.date || ''} · ${t}`;
    } else {
      head.textContent = `Asset ${idx + 1} · ${asset.caps ? fmtDims(asset.caps.w, asset.caps.h) + ' max' : asset.ext.toUpperCase()}`;
    }
    if (asset.downloadUrl) {
      const best = el('span', 'best');
      best.textContent = 'original download available';
      head.appendChild(best);
    } else if (asset.bestUrl) {
      const best = el('span', 'best');
      best.textContent = 'reconstructed max quality';
      head.appendChild(best);
    }
    list.appendChild(head);
    rows.forEach((img) => list.appendChild(buildRow(img, asset)));
  });

  if (total > shown) {
    const more = el('li', 'loadMore');
    const btn = el('button', 'btn');
    const step = Math.min(40, total - shown);
    btn.textContent = `Load ${step} more (${total - shown} remaining)`;
    btn.addEventListener('click', () => {
      state.renderLimit += 40;
      renderList(true);
      loadSizes();
      updateActionLabels();
    });
    more.appendChild(btn);
    list.appendChild(more);
  }

  if (!showSmall) {
    const tip = el('li', 'asset-head');
    tip.textContent = 'scaled/cropped thumbnails hidden';
    list.appendChild(tip);
  }
  list.scrollTop = prevScroll;
}

async function loadSizes() {
  const visible = visibleImages().filter(({ img }) => img.role !== 'download');
  const ordered = visible.filter(({ img }) => img.role === 'max').concat(visible.filter(({ img }) => img.role !== 'max'));
  const urls = [];
  ordered.forEach(({ img }) => {
    if (urls.length < 90 && !state.sizes[img.url] && !urls.includes(img.url)) urls.push(img.url);
  });
  for (let i = 0; i < urls.length; i += 8) {
    const chunk = urls.slice(i, i + 8);
    const res = await sendBg({ type: 'DA_SIZES', urls: chunk });
    if (!res) continue;
    Object.assign(state.sizes, res);
    chunk.forEach((u) => {
      const cell = $(`[data-size-for="${CSS.escape(u)}"]`);
      if (!cell) return;
      const info = res[u];
      if (info && info.ok) cell.textContent = fmtBytes(info.bytes);
      else if (info && info.status) cell.textContent = `HTTP ${info.status}`;
      else cell.textContent = '—';
    });
  }
}

async function verifyDownload() {
  const p = state.data && state.data.page;
  if (!p || !p.downloadUrl) return;
  state.probe = null;
  const res = await sendBg({ type: 'DA_PROBE', url: p.downloadUrl });
  state.probe = res || { ok: false, status: 0 };
  const row = $('.row[data-role="download"]');
  if (row) {
    const size = row.querySelector('.size');
    const line2 = row.querySelector('.line2');
    if (state.probe.ok) {
      if (size) size.textContent = fmtBytes(state.probe.bytes);
      if (line2) line2.appendChild(chip('verified', 'verified'));
    } else {
      if (size) size.textContent = 'needs login?';
      row.classList.add('warn');
      if (line2) line2.appendChild(chip('login required?', 'login'));
    }
  }
  updateActionLabels();
}

function pickBest() {
  const list = allImages();
  if (!list.length) return [];
  const dl = list.find(({ img }) => img.role === 'download');
  const max = list.find(({ img }) => img.role === 'max');
  const upgraded = list
    .filter(({ img }) => img.upgraded)
    .sort((a, b) => b.img.w * b.img.h - a.img.w * a.img.h)[0];
  const biggest = list
    .filter(({ img }) => img.w && img.h)
    .sort((a, b) => b.img.w * b.img.h - a.img.w * a.img.h)[0];
  const dlBroken = dl && state.probe && state.probe.ok === false;
  if (dl && !dlBroken) return [dl];
  if (max) return [max];
  if (upgraded) return [upgraded];
  return biggest ? [biggest] : [list[0]];
}

function tierFor(w) {
  if (!w) return '';
  if (w >= 3840) return '4K+';
  if (w >= 2560) return 'QHD+';
  if (w >= 1920) return 'FHD';
  if (w >= 1280) return 'HD';
  return 'SD';
}

function filenameFor(img, asset) {
  const p = state.data.page;
  const artist = (p.artist || 'deviantart').replace(/\s+/g, '_');
  const ext = (img.ext || 'jpg') === 'jpeg' ? 'jpg' : img.ext || 'jpg';
  if (asset && asset.date) {
    const t = String(asset.title || `deviation-${asset.id || ''}`).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 90) || 'deviation';
    return { filename: `${artist}_${asset.date}_${t}.${ext}`, folder: 'DeviantArt' };
  }
  const title = (p.title || 'artwork').replace(/\s+/g, '_');
  const dims = img.w && img.h ? `_(${img.w}x${img.h})` : '';
  const roleTag = img.role === 'max' || img.role === 'download' ? '' : `_[${(img.roleLabel || img.role).replace(/\s+/g, '-')}]`;
  return { filename: `${artist}_-_${title}${roleTag}${dims}.${ext}`, folder: 'DeviantArt' };
}

async function downloadEntries(entries, label) {
  if (!entries.length) return;
  const items = entries.map(({ img, asset }) => {
    const f = filenameFor(img, asset);
    return { url: img.url, filename: f.filename, folder: f.folder };
  });
  startBatch(items, label);
}

async function startBatch(items, label) {
  if (!items.length) return;
  const res = await sendBg({ type: 'DA_DOWNLOAD_BATCH', items });
  if (!res || !res.batchId) {
    showNotice('Could not start the download.', 'err');
    return;
  }
  state.batchId = res.batchId;
  setProgress(`${label}: 0/${items.length}`);
  pollBatch();
}

async function pollBatch() {
  clearTimeout(state.pollTimer);
  if (!state.batchId) return;
  const st = await sendBg({ type: 'DA_BATCH_STATUS', batchId: state.batchId });
  if (!st) {
    setProgress('');
    return;
  }
  const verb = st.finished ? 'done' : 'downloading';
  setProgress(`${verb}: ${st.done + st.failed}/${st.total}${st.failed ? ` · ${st.failed} failed` : ''}${!st.finished && st.current ? ` · ${st.current}` : ''}`);
  if (!st.finished) {
    state.pollTimer = setTimeout(pollBatch, 500);
  } else {
    if (st.failed && st.errors && st.errors.length) showNotice(`Download error: ${st.errors[0].error}`, 'warn');
    state.batchId = null;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = el('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e2) { }
    ta.remove();
    return ok;
  }
}

async function scan(deep) {
  setBusy(true, deep ? 'reveal' : 'scan');
  showNotice(deep ? 'Clicking the artwork to reveal the full-resolution viewer…' : '');
  const res = deep ? await window.__DA_API.deepScan() : window.__DA_API.scan();
  setBusy(false);
  if (!res || !res.ok) {
    showNotice(`Could not scan this page: ${(res && res.error) || 'unknown error'}`, 'err');
    return;
  }
  state.data = res;
  state.sizes = {};
  state.probe = null;
  state.renderLimit = 40;
  state.selected = new Set();
  allImages().forEach(({ img }) => {
    if (img.role !== 'crop') state.selected.add(img.url);
  });
  $('#pageMeta').textContent = `${res.page.title} — ${res.page.artist} on DeviantArt`;
  setupRange();
  renderSummary();
  renderList();
  updateActionLabels();
  if (deep) {
    showNotice(
      res.page.portalOpened
        ? 'Viewer opened: extra resolution variants collected.'
        : 'No new image appeared. Tip: click the artwork on the page yourself, then press Rescan. The max row above is already the best quality the CDN will serve for this asset.',
      res.page.portalOpened ? '' : 'warn'
    );
  }
  loadSizes();
  verifyDownload();
}

function setRangeStatus(text, kind) {
  const s = $('#rangeStatus');
  s.textContent = text || '';
  s.className = `rangeStatus${kind ? ' ' + kind : ''}`;
}

async function refreshFolderLabel() {
  let saveMode = 'default';
  let folderName = '';
  try {
    const stored = await chrome.storage.local.get(['saveMode', 'folderName']);
    saveMode = stored.saveMode || 'default';
    folderName = stored.folderName || '';
  } catch (e) { }
  const label = saveMode === 'custom' ? (folderName || 'Custom') : saveMode === 'ask' ? 'Ask each time' : 'Default';
  $('#folderLabel').textContent = `Folder: ${label}`;
  $('#btnFolder').title = saveMode === 'custom'
    ? `Custom folder: ${folderName}. Click to change.`
    : saveMode === 'ask'
      ? 'A Save As dialog opens for every download. Click to change.'
      : 'Downloads\\DeviantArt (browser default). Click to choose a folder.';
}

function initFolderButton() {
  const icon = $('#btnFolder .folderIcon');
  if (icon && !icon.firstChild) {
    icon.appendChild(svgIcon(['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'], 13));
  }
  $('#btnFolder').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'DA_OPEN_SAVER' });
  });
  chrome.storage.onChanged.addListener(() => refreshFolderLabel());
  refreshFolderLabel();
}

async function initBestOnly() {
  try {
    const stored = await chrome.storage.local.get('bestOnly');
    if (stored.bestOnly) $('#chkBest').checked = true;
  } catch (e) { }
}

function setupRange() {
  const p = state.data && state.data.page;
  const box = $('#rangeBox');
  const show = !!(p && p.isProfile && p.artist);
  box.classList.toggle('hidden', !show);
  const bestWrap = $('#chkBestWrap');
  bestWrap.classList.toggle('hidden', !(state.data && (state.data.assets.length > 1 || !p.isArtPage)));
  if (!show) return;
  if (!$('#rangeFrom').value) {
    const to = new Date();
    const from = new Date(Date.now() - 30 * 86400000);
    $('#rangeTo').value = to.toISOString().slice(0, 10);
    $('#rangeFrom').value = from.toISOString().slice(0, 10);
  }
  state.range = { items: [], busy: false };
  setRangeStatus('');
  $('#btnRangeDownload').disabled = true;
  $('#btnRangeDownload').textContent = 'Download';
  $('#btnRangeCopy').disabled = true;
}

async function scanRange() {
  const from = $('#rangeFrom').value;
  const to = $('#rangeTo').value;
  if (!from || !to) {
    setRangeStatus('Pick both dates first.', 'warn');
    return;
  }
  if (from > to) {
    setRangeStatus('The From date is after the To date.', 'warn');
    return;
  }
  const artist = state.data.page.artist;
  $('#btnRangeScan').disabled = true;
  $('#btnRangeDownload').disabled = true;
  $('#btnRangeCopy').disabled = true;
  setRangeStatus('Scanning gallery pages…');
  const res = await window.__DA_API.profileScan({ artist, from, to, maxPages: 120 });
  $('#btnRangeScan').disabled = false;
  if (!res || !res.ok) {
    setRangeStatus(`Scan failed: ${(res && res.error) || 'unknown error'}`, 'warn');
    return;
  }
  state.range = { items: res.items, busy: false };
  let extra = '';
  if (res.timedOut) extra = ' (time limit reached, try a narrower range)';
  else if (res.hasMore) extra = ' (page cap reached, narrow the range for completeness)';
  setRangeStatus(`${res.items.length} image(s) between ${from} and ${to} · ${res.pages} page(s) scanned${extra}`, res.items.length ? '' : 'warn');
  $('#btnRangeDownload').disabled = !res.items.length;
  $('#btnRangeDownload').textContent = `Download (${res.items.length})`;
  $('#btnRangeCopy').disabled = !res.items.length;
  if (res.items.length) showRangeResults(res, from, to);
}

function showRangeResults(res, from, to) {
  const page = state.data.page;
  const assets = res.items.map((it) => ({
    base: it.bestUrl.split('/v1/')[0],
    shortId: '',
    id: it.id,
    ext: it.ext,
    caps: it.w && it.h ? { w: it.w, h: it.h } : null,
    bestUrl: it.bestUrl,
    bestW: it.w,
    bestH: it.h,
    bestExt: it.ext,
    downloadUrl: null,
    thumbUrl: it.thumbUrl || it.bestUrl,
    date: it.date,
    title: it.title,
    deviationUrl: it.url,
    images: [{
      url: it.bestUrl,
      w: it.w || 0,
      h: it.h || 0,
      exact: true,
      q: 100,
      role: 'max',
      roleLabel: 'max q100',
      ext: it.ext,
      tier: tierFor(it.w || 0)
    }],
    score: (it.w || 0) * (it.h || 0)
  }));
  state.data = {
    ok: true,
    page: Object.assign({}, page, { title: `Gallery ${from} \u2192 ${to}` }),
    assets,
    totalAssets: assets.length,
    truncated: false,
    rangeMode: { from, to }
  };
  state.sizes = {};
  state.renderLimit = 40;
  state.selected = new Set();
  assets.forEach((a) => a.images.forEach((img) => state.selected.add(img.url)));
  $('#pageMeta').textContent = `${page.artist} \u2014 published ${from} \u2192 ${to}`;
  renderSummary();
  renderList();
  updateActionLabels();
  loadSizes();
}

function rangeFilename(it) {
  const artist = (state.data.page.artist || 'deviantart').replace(/\s+/g, '_');
  const title = String(it.title || `deviation-${it.id}`).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 90) || `deviation-${it.id}`;
  return `${artist}_${it.date}_${title}.${it.ext}`;
}

function bindUi() {
  $('#btnRescan').addEventListener('click', () => scan(false));
  $('#btnReveal').addEventListener('click', () => scan(true));
  $('#chkSmall').addEventListener('change', () => {
    renderList();
    updateActionLabels();
  });
  $('#chkBest').addEventListener('change', () => {
    chrome.storage.local.set({ bestOnly: $('#chkBest').checked });
    renderList();
    updateActionLabels();
  });
  $('#btnRangeScan').addEventListener('click', () => scanRange());
  $('#btnRangeDownload').addEventListener('click', () => {
    const items = state.range && state.range.items ? state.range.items : [];
    if (!items.length) return;
    const batch = items.map((it) => ({ url: it.bestUrl, filename: rangeFilename(it), folder: 'DeviantArt' }));
    startBatch(batch, `Profile range (${batch.length})`);
  });
  $('#btnRangeCopy').addEventListener('click', async () => {
    const items = state.range && state.range.items ? state.range.items : [];
    if (!items.length) return;
    const ok = await copyText(items.map((it) => it.bestUrl).join('\n'));
    setRangeStatus(ok ? `Copied ${items.length} URLs to the clipboard.` : 'Could not access the clipboard.', ok ? '' : 'warn');
  });
  $('#btnBest').addEventListener('click', () => downloadEntries(pickBest(), 'Download best'));
  $('#btnSelected').addEventListener('click', () => {
    const entries = visibleImages().filter(({ img }) => state.selected.has(img.url));
    downloadEntries(entries, 'Download selected');
  });
  $('#btnAll').addEventListener('click', () => downloadEntries(visibleImages(), 'Download all'));
  $('#btnCopy').addEventListener('click', async () => {
    const urls = visibleImages().map(({ img }) => img.url);
    if (!urls.length) return;
    const ok = await copyText(urls.join('\n'));
    showNotice(ok ? `Copied ${urls.length} URLs to the clipboard.` : 'Could not access the clipboard.', ok ? '' : 'warn');
  });
  $('#list').addEventListener('click', (e) => {
    const btn = e.target.closest('.iconBtn');
    if (!btn) return;
    const row = btn.closest('.row');
    const url = row && row.dataset.url;
    if (!url) return;
    if (btn.classList.contains('open')) window.open(url, '_blank', 'noopener');
    else if (btn.classList.contains('copy')) copyText(url);
    else if (btn.classList.contains('dl')) {
      const entry = allImages().find(({ img }) => img.url === url);
      if (entry) downloadEntries([entry], 'Download');
    }
  });
  $('#list').addEventListener('scroll', () => {
    const l = $('#list');
    if (!state.data || state.renderLimit >= state.data.assets.length) return;
    if (l.scrollTop + l.clientHeight > l.scrollHeight - 160) {
      state.renderLimit += 40;
      renderList(true);
      loadSizes();
      updateActionLabels();
    }
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'DA_PROFILE_PROGRESS') {
    setRangeStatus(`Scanning page ${msg.page}… ${msg.found} match(es) so far`);
  }
});

const SIDEBAR_HOST_ID = 'da-image-hunter-sidebar';
let sidebarInited = false;

async function mountSidebar() {
  if (document.getElementById(SIDEBAR_HOST_ID)) return;
  const host = document.createElement('div');
  host.id = SIDEBAR_HOST_ID;
  host.style.cssText = 'position:fixed;top:0;right:0;width:600px;height:100vh;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  const [css, sidebarCss, markup] = await Promise.all([
    fetch(chrome.runtime.getURL('popup.css')).then((r) => r.text()),
    fetch(chrome.runtime.getURL('sidebar.css')).then((r) => r.text()),
    fetch(chrome.runtime.getURL('sidebar.html')).then((r) => r.text())
  ]);
  const style = document.createElement('style');
  style.textContent = `${css.replace(/:root/g, ':host')}\n${sidebarCss}`;
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const app = doc.getElementById('app');
  if (!app) return;
  root.appendChild(style);
  root.appendChild(app);
  const logo = root.querySelector('.logo');
  if (logo) logo.src = chrome.runtime.getURL('icons/icon48.png');
  const close = document.createElement('button');
  close.className = 'sidebarClose';
  close.title = 'Close panel';
  close.textContent = '\u2715';
  const top = root.querySelector('.top');
  if (top) top.appendChild(close);
  close.addEventListener('click', () => host.remove());
  document.documentElement.appendChild(host);
  $ = (s) => root.querySelector(s);
  if (!sidebarInited) {
    sidebarInited = true;
    bindUi();
    initFolderButton();
    await initBestOnly();
    await scan(false);
  }
}

function toggleSidebar() {
  const existing = document.getElementById(SIDEBAR_HOST_ID);
  if (existing) {
    existing.remove();
    return Promise.resolve();
  }
  return mountSidebar();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'DA_TOGGLE_SIDEBAR') {
    toggleSidebar().catch(() => { });
  }
});
