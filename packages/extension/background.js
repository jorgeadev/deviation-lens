const batches = new Map();
let batchSeq = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sanitize(name) {
  return String(name == null ? '' : name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '')
    .trim();
}

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('da-image-hunter', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('handles')) req.result.createObjectStore('handles');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const rq = tx.objectStore(store).get(key);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}

async function getFolderHandle() {
  try {
    const db = await openIdb();
    try {
      return await idbGet(db, 'handles', 'folder');
    } finally {
      db.close();
    }
  } catch (e) {
    return null;
  }
}

async function writeToCustomFolder(item) {
  const handle = await getFolderHandle();
  if (!handle) return { ok: false, error: 'No custom folder selected yet. Open the extension folder settings.' };
  let perm = 'granted';
  try {
    perm = await handle.queryPermission({ mode: 'readwrite' });
  } catch (e) { }
  if (perm !== 'granted') return { ok: false, error: 'Folder access expired. Open Folder settings and click Connect again.' };
  const res = await fetch(item.url, { credentials: 'include' });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const blob = await res.blob();
  const parts = String(item.filename || 'image').split('/').map((p) => sanitize(p)).filter(Boolean);
  if (!parts.length) parts.push('image');
  let dir = handle;
  for (const p of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(p, { create: true });
  }
  const name = parts[parts.length - 1] || 'image';
  let fh;
  try {
    fh = await dir.getFileHandle(name);
  } catch (e) {
    fh = await dir.getFileHandle(name, { create: true });
  }
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
  return { ok: true, path: parts.join('/') };
}

function downloadViaBrowser(item, ask) {
  return new Promise((resolve) => {
    const folder = item.folder ? sanitize(item.folder) : '';
    const file = sanitize(item.filename).slice(0, 180) || 'image';
    const full = folder ? `${folder}/${file}` : file;
    chrome.downloads.download(
      { url: item.url, filename: full, conflictAction: 'uniquify', saveAs: !!ask },
      (id) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve({ ok: true, id });
        }
      }
    );
  });
}

async function startDownload(item) {
  let saveMode = 'default';
  try {
    const stored = await chrome.storage.local.get('saveMode');
    saveMode = stored.saveMode || 'default';
  } catch (e) { }
  if (saveMode === 'custom') {
    try {
      return await writeToCustomFolder(item);
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }
  return downloadViaBrowser(item, saveMode === 'ask');
}

function armTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function fetchInfo(url) {
  const guard = armTimeout(15000);
  try {
    let r = await fetch(url, { method: 'HEAD', credentials: 'include', redirect: 'follow', signal: guard.signal });
    const headLen = r.headers.get('content-length');
    const headType = r.headers.get('content-type');
    if (r.ok && headLen) {
      return { ok: true, status: r.status, bytes: Number(headLen), type: headType, finalUrl: r.url };
    }
    r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, credentials: 'include', redirect: 'follow', signal: guard.signal });
    const type = r.headers.get('content-type');
    if (r.status === 206) {
      const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
      try { if (r.body) await r.body.cancel(); } catch (e) { }
      if (m) return { ok: true, status: 206, bytes: Number(m[1]), type, finalUrl: r.url };
    }
    const len = r.headers.get('content-length');
    try { if (r.body) await r.body.cancel(); } catch (e) { }
    if (r.ok) return { ok: true, status: r.status, bytes: len ? Number(len) : null, type, finalUrl: r.url };
    return { ok: false, status: r.status, bytes: null, type, finalUrl: r.url };
  } catch (e) {
    return { ok: false, status: 0, bytes: null, type: null, finalUrl: url, error: String((e && e.message) || e) };
  } finally {
    guard.done();
  }
}

async function getSizes(urls) {
  const queue = [...new Set((urls || []).filter((u) => typeof u === 'string' && u))].slice(0, 60);
  const out = {};
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      out[u] = await fetchInfo(u);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
  return out;
}

async function runBatch(batchId, items) {
  const st = batches.get(batchId);
  if (!st) return;
  for (const item of items) {
    st.current = item.filename || item.url;
    const res = await startDownload(item);
    if (res.ok) st.done++;
    else {
      st.failed++;
      st.errors.push({ filename: st.current, error: res.error });
    }
    await sleep(350);
  }
  st.current = null;
  st.finished = true;
  st.finishedAt = Date.now();
  setTimeout(() => batches.delete(batchId), 300000);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'DA_SIZES') {
    getSizes(msg.urls).then(sendResponse);
    return true;
  }
  if (msg.type === 'DA_PROBE') {
    fetchInfo(msg.url).then(sendResponse);
    return true;
  }
  if (msg.type === 'DA_DOWNLOAD') {
    startDownload(msg.item).then(sendResponse);
    return true;
  }
  if (msg.type === 'DA_DOWNLOAD_BATCH') {
    const batchId = `b${++batchSeq}`;
    batches.set(batchId, { id: batchId, total: msg.items.length, done: 0, failed: 0, current: null, finished: false, errors: [] });
    runBatch(batchId, msg.items);
    sendResponse({ batchId });
    return false;
  }
  if (msg.type === 'DA_BATCH_STATUS') {
    sendResponse(batches.get(msg.batchId) || null);
    return false;
  }
});
