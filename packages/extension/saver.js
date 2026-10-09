const $ = (s) => document.querySelector(s);

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

function idbPut(db, store, value, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const rq = tx.objectStore(store).put(value, key);
    rq.onsuccess = () => resolve();
    rq.onerror = () => reject(rq.error);
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

async function getHandle() {
  try {
    const db = await openIdb();
    try {
      return (await idbGet(db, 'handles', 'folder')) || null;
    } finally {
      db.close();
    }
  } catch (e) {
    return null;
  }
}

async function setHandle(handle) {
  const db = await openIdb();
  try {
    await idbPut(db, 'handles', handle, 'folder');
  } finally {
    db.close();
  }
}

function setStatus(text, kind) {
  const s = $('#status');
  s.textContent = text || '';
  s.className = `saverStatus${kind ? ' ' + kind : ''}`;
}

let permissionState = 'none';
const FS_SUPPORTED = typeof window.showDirectoryPicker === 'function';

async function refresh() {
  const stored = await chrome.storage.local.get(['saveMode', 'folderName']);
  let saveMode = stored.saveMode || 'default';
  const folderName = stored.folderName || '';
  if (!FS_SUPPORTED && saveMode === 'custom') {
    saveMode = 'default';
    await chrome.storage.local.set({ saveMode: 'default' });
  }
  document.querySelectorAll('input[name="mode"]').forEach((r) => {
    r.checked = r.value === saveMode;
  });
  const customRadio = document.querySelector('input[name="mode"][value="custom"]');
  if (customRadio) {
    customRadio.disabled = !FS_SUPPORTED;
    const item = customRadio.closest('.modeItem');
    if (item) item.classList.toggle('disabled', !FS_SUPPORTED);
  }
  $('#btnPick').title = FS_SUPPORTED ? '' : 'Not supported in this browser - click for alternatives';
  $('#fsNote').classList.toggle('hidden', FS_SUPPORTED);
  $('#folderName').textContent = folderName || 'none';
  const label = saveMode === 'custom' ? (folderName || 'Custom folder') : saveMode === 'ask' ? 'Ask every time' : 'Browser default (Downloads\\DeviantArt)';
  $('#curMode').textContent = label;

  const handle = await getHandle();
  if (saveMode === 'custom' && !handle && FS_SUPPORTED) {
    saveMode = 'default';
    await chrome.storage.local.set({ saveMode: 'default' });
    document.querySelectorAll('input[name="mode"]').forEach((r) => {
      r.checked = r.value === saveMode;
    });
    $('#curMode').textContent = 'Browser default (Downloads\\DeviantArt)';
  }
  permissionState = 'none';
  if (handle) {
    try {
      permissionState = await handle.queryPermission({ mode: 'readwrite' });
    } catch (e) {
      permissionState = 'unknown';
    }
  }
  $('#btnGrant').classList.toggle('hidden', !(handle && permissionState !== 'granted'));
  $('#btnPick').textContent = saveMode === 'custom' && handle ? 'Change folder…' : 'Choose folder…';
}

async function chooseFolder() {
  if (typeof window.showDirectoryPicker !== 'function') {
    setStatus('This browser does not allow choosing a folder directly (File System Access API unavailable). Use "Ask every time", or change your browser download folder via "Browser download settings" and keep "Browser default".', 'err');
    return;
  }
  try {
    setStatus('Waiting for the folder picker…');
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await setHandle(handle);
    await chrome.storage.local.set({ saveMode: 'custom', folderName: handle.name });
    setStatus(`Folder "${handle.name}" selected. Downloads will be written there.`, 'ok');
  } catch (e) {
    if (e && e.name === 'AbortError') setStatus('Folder selection cancelled.');
    else setStatus(`Could not select the folder: ${(e && e.message) || e}`, 'err');
  }
  refresh();
}

document.querySelectorAll('input[name="mode"]').forEach((radio) => {
  radio.addEventListener('change', async () => {
    if (radio.value === 'custom') {
      const handle = await getHandle();
      if (!handle) {
        setStatus('Click "Choose folder…" to pick the custom folder first.', 'err');
        await chrome.storage.local.set({ saveMode: 'default' });
        refresh();
        return;
      }
      await chrome.storage.local.set({ saveMode: 'custom' });
      setStatus('Custom folder enabled.', 'ok');
    } else {
      await chrome.storage.local.set({ saveMode: radio.value });
      setStatus(radio.value === 'ask' ? 'A Save As dialog will open for every download.' : 'Using the browser default folder.', 'ok');
    }
    refresh();
  });
});

$('#btnPick').addEventListener('click', chooseFolder);

$('#btnGrant').addEventListener('click', async () => {
  const handle = await getHandle();
  if (!handle) return;
  try {
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') setStatus(`Folder "${handle.name}" is connected again.`, 'ok');
    else setStatus('Access was not granted.', 'err');
  } catch (e) {
    setStatus(`Could not connect the folder: ${(e && e.message) || e}`, 'err');
  }
  refresh();
});

$('#btnDefault').addEventListener('click', async () => {
  await chrome.storage.local.set({ saveMode: 'default' });
  setStatus('Using the browser default folder.', 'ok');
  refresh();
});

$('#btnShow').addEventListener('click', () => {
  chrome.downloads.showDefaultFolder();
});

$('#btnSettings').addEventListener('click', () => {
  const ua = navigator.userAgent;
  let url = 'chrome://settings/downloads';
  if (/Edg\//.test(ua)) url = 'edge://settings/downloads';
  else if (/OPR\//.test(ua)) url = 'opera://settings/downloads';
  else if (/YaBrowser/i.test(ua)) url = 'browser://settings/downloads';
  chrome.tabs.create({ url });
});

refresh();
