(() => {
	if (window.__DA_SIDEBAR_LOADED__) return;
	window.__DA_SIDEBAR_LOADED__ = true;

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
		range: { items: [], busy: false },
	};
	let sizeObserver = null;
	let sizeQueue = [];
	const sizeQueued = new Set();
	let sizeRequestActive = false;
	const failedImageUrls = new Set();

	const el = (tag, cls) => {
		const e = document.createElement(tag);
		if (cls) e.className = cls;
		return e;
	};

	function svgIcon(paths, size) {
		const NS = "http://www.w3.org/2000/svg";
		const svg = document.createElementNS(NS, "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("width", String(size || 14));
		svg.setAttribute("height", String(size || 14));
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "2");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
		paths.forEach((d) => {
			const p = document.createElementNS(NS, "path");
			p.setAttribute("d", d);
			svg.appendChild(p);
		});
		return svg;
	}

	const _esc = (s) =>
		String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

	function fmtBytes(b) {
		if (b == null || !Number.isFinite(b)) return "…";
		const units = ["B", "KB", "MB", "GB"];
		let v = Number(b);
		let i = 0;
		while (v >= 1024 && i < units.length - 1) {
			v /= 1024;
			i++;
		}
		return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
	}

	const fmtDims = (w, h) => (w && h ? `${w}×${h}` : "|");

	function sendBg(msg) {
		return new Promise((resolve) => {
			chrome.runtime.sendMessage(msg, (res) => {
				if (chrome.runtime.lastError) resolve(null);
				else resolve(res);
			});
		});
	}

	function showNotice(text, kind) {
		const n = $("#notice");
		if (!text) {
			n.classList.add("hidden");
			n.textContent = "";
			return;
		}
		n.className = `notice${kind ? ` ${kind}` : ""}`;
		n.textContent = text;
	}

	function setProgress(text) {
		const p = $("#progress");
		if (!text) {
			p.classList.add("hidden");
			p.textContent = "";
			return;
		}
		p.classList.remove("hidden");
		p.textContent = text;
	}

	function setBusy(busy, label) {
		state.busy = busy;
		["#btnRescan", "#btnReveal", "#btnBest", "#btnSelected", "#btnAll", "#btnCopy"].forEach((s) => {
			const b = $(s);
			if (b) b.disabled = busy || (s === "#btnBest" && !state.data);
		});
		$("#btnReveal").textContent = busy && label === "reveal" ? "Revealing…" : "Reveal full";
		$("#btnRescan").textContent = busy && label === "scan" ? "Scanning…" : "Rescan";
	}

	function allImages() {
		if (!state.data) return [];
		state.data.assets.forEach((asset) => {
			asset.images = asset.images.filter((img) => !failedImageUrls.has(img.url));
		});
		state.data.assets = state.data.assets.filter((asset) => asset.images.length > 0);
		const out = [];
		state.data.assets.forEach((asset) => {
			asset.images.forEach((img) => { out.push({ img, asset }); });
		});
		return out;
	}

	function visibleImages() {
		const showSmall = $("#chkSmall").checked;
		let list = allImages();
		if (!showSmall) {
			list = list.filter(({ img }) => {
				if (img.role === "crop") return false;
				if (img.role === "scaled" && Math.max(img.w || 0, img.h || 0) < 400) return false;
				return true;
			});
		}
		const bestWrap = $("#chkBestWrap");
		const bestOnly = $("#chkBest").checked && bestWrap && !bestWrap.classList.contains("hidden");
		if (bestOnly) {
			const rank = (img) => (img.role === "download" ? 0 : img.role === "max" ? 1 : 2);
			const byAsset = new Map();
			list.forEach((entry) => {
				const cur = byAsset.get(entry.asset);
				if (!cur) {
					byAsset.set(entry.asset, entry);
					return;
				}
				const re = rank(entry.img);
				const rc = rank(cur.img);
				if (re < rc || (re === rc && entry.img.w * entry.img.h > cur.img.w * cur.img.h)) {
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
		const selBtn = $("#btnSelected");
		const selLbl = selBtn?.querySelector(".lbl");
		if (selLbl) selLbl.textContent = `Selected (${checked.length})`;
		else if (selBtn) selBtn.textContent = `Download selected (${checked.length})`;
		$("#btnSelected").disabled = state.busy || checked.length === 0;
		$("#btnAll").disabled = state.busy || visible.length === 0;
		const hasBest = pickBest().length > 0;
		$("#btnBest").disabled = state.busy || !hasBest;
		const dl = state.data?.page?.downloadUrl;
		$("#btnBest").title = dl
			? "Prefers the original download from the page when available"
			: "Max quality reconstruction from the CDN token limits";
	}

	function renderSummary() {
		const d = state.data;
		const s = $("#summary");
		s.classList.remove("hidden");
		s.textContent = "";
		const imgs = allImages();
		const bestDims = imgs.reduce(
			(acc, { img }) => {
				const px = (img.w || 0) * (img.h || 0);
				return px > acc.px ? { px, label: fmtDims(img.w, img.h) } : acc;
			},
			{ px: 0, label: "|" },
		);

		const add = (text, cls) => {
			const span = el("span", cls || "");
			span.textContent = text;
			s.appendChild(span);
		};

		if (d.rangeMode) {
			add(`${imgs.length} image${imgs.length === 1 ? "" : "s"} published in range`);
			add(`${d.assets.length} deviation${d.assets.length === 1 ? "" : "s"}`);
		} else {
			add(`${imgs.length} image${imgs.length === 1 ? "" : "s"} found`);
			add(`${d.assets.length} asset${d.assets.length === 1 ? "" : "s"} on page`);
		}
		add(`best ${bestDims.label}`);
		if (d.page.downloadUrl) add("original download detected", "ok");
		else if (d.assets.some((a) => a.bestUrl)) add("max CDN quality reconstructed");
		if (d.truncated) add(`more than ${d.assets.length} assets found, only these were transferred`, "warn");
	}

	function chip(text, cls) {
		const c = el("span", `chip${cls ? ` ${cls}` : ""}`);
		c.textContent = text;
		return c;
	}

	function buildRow(img, asset) {
		const rowScanId = scanGeneration;
		const li = el("li", "row");
		li.dataset.url = img.url;
		li.dataset.role = img.role;
		if (img.role === "download" || img.role === "max") li.classList.add("best");

		const pick = el("input", "pick");
		pick.type = "checkbox";
		pick.checked = state.selected.has(img.url);
		pick.addEventListener("change", () => {
			if (pick.checked) state.selected.add(img.url);
			else state.selected.delete(img.url);
			updateActionLabels();
		});
		li.appendChild(pick);

		const thumb = el("img", "thumb");
		thumb.loading = "lazy";
		thumb.alt = "";
		thumb.src = asset.thumbUrl || img.url;
		let triedFullImage = false;
		thumb.addEventListener("error", () => {
			if (rowScanId !== scanGeneration) return;
			if (!triedFullImage && thumb.src !== img.url) {
				triedFullImage = true;
				thumb.src = img.url;
				return;
			}
			removeUnavailableImage(img.url);
		});
		li.appendChild(thumb);

		const meta = el("div", "meta");
		const line1 = el("div", "line1");
		const dims = el("span", "dims");
		dims.textContent = img.role === "download" ? "original file" : fmtDims(img.w, img.h);
		line1.appendChild(dims);
		const size = el("span", "size");
		size.dataset.sizeFor = img.url;
		size.dataset.sizeRole = img.role;
		size.textContent = "…";
		line1.appendChild(size);
		meta.appendChild(line1);

		const line2 = el("div", "line2");
		if (asset?.date) line2.appendChild(chip(asset.date, "tier"));
		line2.appendChild(chip(img.roleLabel, img.role === "download" ? "role-download" : img.role === "max" ? "role-max" : ""));
		if (img.role === "download") line2.appendChild(chip(img.ext.toUpperCase()));
		else {
			if (img.q) line2.appendChild(chip(`q${img.q}`));
			line2.appendChild(chip(img.ext.toUpperCase()));
			if (img.tier) line2.appendChild(chip(img.tier, "tier"));
			if (!img.exact) line2.appendChild(chip("approx"));
		}
		meta.appendChild(line2);
		li.appendChild(meta);

		const actions = el("div", "rowActions");
		const mkIcon = (cls, title, paths) => {
			const b = el("button", `iconBtn ${cls}`);
			b.title = title;
			b.appendChild(svgIcon(paths));
			return b;
		};
		actions.appendChild(mkIcon("dl", "Download this image", ["M12 4v11", "m7 10 5 5 5-5", "M5 20h14"]));
		actions.appendChild(
			mkIcon("open", "Open in a new tab", ["M14 4h6v6", "M20 4l-9 9", "M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"]),
		);
		actions.appendChild(mkIcon("copy", "Copy URL", ["M9 9h10v10H9z", "M5 15V5h10"]));
		li.appendChild(actions);
		return li;
	}

	function renderList(keepScroll) {
		const list = $("#list");
		const prevScroll = keepScroll ? list.scrollTop : 0;
		list.textContent = "";
		const d = state.data;
		const visible = visibleImages();
		if (!d.assets.length || !visible.length) {
			const empty = el("li", "empty");
			const big = el("div", "big");
			big.textContent = state.busy ? "Scanning this page…" : "No images found in the main view";
			const small = el("div", "");
			small.textContent = state.busy
				? "Images will appear here as they are found."
				: "Open a deviation page, a gallery, or scroll the page so the images load, then press Rescan.";
			empty.appendChild(big);
			empty.appendChild(small);
			list.appendChild(empty);
			return;
		}
		const visibleSet = new Set(visible.map((v) => v.img));
		const total = d.assets.length;
		const shown = Math.min(state.renderLimit, total);

		const countBar = el("li", "listCount");
		if (d.rangeMode) {
			countBar.textContent = `Published ${d.rangeMode.from} → ${d.rangeMode.to} · showing ${shown} of ${total} · ${visible.length} image${visible.length === 1 ? "" : "s"}`;
		} else {
			countBar.textContent = `Showing ${shown} of ${total} asset${total === 1 ? "" : "s"} · ${visible.length} image${visible.length === 1 ? "" : "s"}`;
		}
		if (d.truncated) {
			const warn = el("span", "warn");
			warn.textContent = "600+ assets, only the first 600 were transferred";
			countBar.appendChild(warn);
		}
		list.appendChild(countBar);

		const showSmall = $("#chkSmall").checked;
		d.assets.slice(0, shown).forEach((asset, idx) => {
			const rows = asset.images.filter((img) => visibleSet.has(img));
			if (!rows.length) return;
			const head = el("li", "asset-head");
			if (asset.title) {
				const t = asset.title.length > 64 ? `${asset.title.slice(0, 61)}…` : asset.title;
				head.textContent = `${asset.date || ""} · ${t}`;
			} else {
				head.textContent = `Asset ${idx + 1} · ${asset.caps ? `${fmtDims(asset.caps.w, asset.caps.h)} max` : asset.ext.toUpperCase()}`;
			}
			if (asset.downloadUrl) {
				const best = el("span", "best");
				best.textContent = "original download available";
				head.appendChild(best);
			} else if (asset.bestUrl) {
				const best = el("span", "best");
				best.textContent = "reconstructed max quality";
				head.appendChild(best);
			}
			list.appendChild(head);
			rows.forEach((img) => { list.appendChild(buildRow(img, asset)); });
		});

		if (total > shown) {
			const more = el("li", "loadMore");
			const btn = el("button", "btn");
			const step = Math.min(40, total - shown);
			btn.textContent = `Load ${step} more (${total - shown} remaining)`;
			btn.addEventListener("click", () => {
				state.renderLimit += 40;
				renderList(true);
				loadSizes();
				updateActionLabels();
			});
			more.appendChild(btn);
			list.appendChild(more);
		}

		if (!showSmall) {
			const tip = el("li", "asset-head");
			tip.textContent = "scaled/cropped thumbnails hidden";
			list.appendChild(tip);
		}
		list.scrollTop = prevScroll;
	}

	function resetSizeQueue() {
		sizeQueue = [];
		sizeQueued.clear();
		if (sizeObserver) sizeObserver.disconnect();
		sizeObserver = null;
	}

	function renderSizeResult(url, info) {
		state.sizes[url] = info || { ok: false, status: 0 };
		const text = info?.ok ? fmtBytes(info.bytes) : info?.status ? `HTTP ${info.status}` : "|";
		$("#list")
			.querySelectorAll(`[data-size-for="${CSS.escape(url)}"]`)
			.forEach((cell) => {
				cell.textContent = text;
			});
	}

	function isPermanentImageFailure(info) {
		return !!(info && !info.ok && [401, 403, 404, 410].includes(info.status));
	}

	function removeUnavailableImage(url) {
		if (!url || failedImageUrls.has(url) || !state.data) return;
		const exists = state.data.assets.some((asset) => asset.images.some((img) => img.url === url));
		if (!exists) return;
		failedImageUrls.add(url);
		state.selected.delete(url);
		delete state.sizes[url];
		renderSummary();
		renderList(true);
		updateActionLabels();
		loadSizes();
	}

	function renderDownloadProbe(info) {
		state.probe = info || { ok: false, status: 0 };
		const row = $("#list").querySelector('.row[data-role="download"]');
		if (!row) return;
		const line2 = row.querySelector(".line2");
		if (!line2) return;
		if (state.probe.ok) {
			if (!line2.querySelector(".verified")) line2.appendChild(chip("verified", "verified"));
		} else {
			row.classList.add("warn");
			if (!line2.querySelector(".login")) line2.appendChild(chip("login required?", "login"));
		}
		updateActionLabels();
	}

	function queueSizeRequest(cell) {
		const url = cell.dataset.sizeFor;
		if (!url || failedImageUrls.has(url) || state.sizes[url]) return;
		const requestId = scanGeneration;
		const key = `${requestId}:${url}`;
		if (sizeQueued.has(key)) return;
		sizeQueued.add(key);
		sizeQueue.push({ url, requestId, isDownload: cell.dataset.sizeRole === "download" });
		pumpSizeQueue();
	}

	async function pumpSizeQueue() {
		if (sizeRequestActive) return;
		const item = sizeQueue.shift();
		if (!item) return;
		const key = `${item.requestId}:${item.url}`;
		if (item.requestId !== scanGeneration || failedImageUrls.has(item.url)) {
			sizeQueued.delete(key);
			pumpSizeQueue();
			return;
		}
		sizeRequestActive = true;
		try {
			const response = await sendBg(item.isDownload ? { type: "DA_PROBE", url: item.url } : { type: "DA_SIZES", urls: [item.url] });
			if (item.requestId === scanGeneration) {
				const info = item.isDownload ? response : response?.[item.url];
				if (isPermanentImageFailure(info)) removeUnavailableImage(item.url);
				else {
					renderSizeResult(item.url, info);
					if (item.isDownload) renderDownloadProbe(info);
				}
			}
		} catch (_e) {
			if (item.requestId === scanGeneration) renderSizeResult(item.url, null);
		} finally {
			sizeRequestActive = false;
			sizeQueued.delete(key);
			await new Promise((resolve) => setTimeout(resolve, 100));
			pumpSizeQueue();
		}
	}

	function loadSizes() {
		const list = $("#list");
		if (!sizeObserver) {
			sizeObserver = new IntersectionObserver(
				(entries) => {
					entries.forEach((entry) => {
						if (!entry.isIntersecting) return;
						sizeObserver.unobserve(entry.target);
						queueSizeRequest(entry.target);
					});
				},
				{ root: list, rootMargin: "72px 0px" },
			);
		}
		list.querySelectorAll("[data-size-for]").forEach((cell) => {
			const info = state.sizes[cell.dataset.sizeFor];
			if (failedImageUrls.has(cell.dataset.sizeFor)) return;
			if (info) {
				cell.textContent = info.ok ? fmtBytes(info.bytes) : info.status ? `HTTP ${info.status}` : "|";
				return;
			}
			sizeObserver.observe(cell);
		});
	}

	function pickBest() {
		const list = allImages();
		if (!list.length) return [];
		const dl = list.find(({ img }) => img.role === "download");
		const max = list.find(({ img }) => img.role === "max");
		const upgraded = list.filter(({ img }) => img.upgraded).sort((a, b) => b.img.w * b.img.h - a.img.w * a.img.h)[0];
		const biggest = list.filter(({ img }) => img.w && img.h).sort((a, b) => b.img.w * b.img.h - a.img.w * a.img.h)[0];
		const dlBroken = dl && state.probe && state.probe.ok === false;
		if (dl && !dlBroken) return [dl];
		if (max) return [max];
		if (upgraded) return [upgraded];
		return biggest ? [biggest] : [list[0]];
	}

	function tierFor(w) {
		if (!w) return "";
		if (w >= 3840) return "4K+";
		if (w >= 2560) return "QHD+";
		if (w >= 1920) return "FHD";
		if (w >= 1280) return "HD";
		return "SD";
	}

	function filenameFor(img, asset) {
		const p = state.data.page;
		const artist = (p.artist || "deviantart").replace(/\s+/g, "_");
		const ext = (img.ext || "jpg") === "jpeg" ? "jpg" : img.ext || "jpg";
		if (asset?.date) {
			const t =
				String(asset.title || `deviation-${asset.id || ""}`)
					.replace(/[^\w\- ]+/g, "")
					.trim()
					.replace(/\s+/g, "_")
					.slice(0, 90) || "deviation";
			return { filename: `${artist}_${asset.date}_${t}.${ext}`, folder: "DeviantArt" };
		}
		const title = (p.title || "artwork").replace(/\s+/g, "_");
		const dims = img.w && img.h ? `_(${img.w}x${img.h})` : "";
		const roleTag = img.role === "max" || img.role === "download" ? "" : `_[${(img.roleLabel || img.role).replace(/\s+/g, "-")}]`;
		return { filename: `${artist}_-_${title}${roleTag}${dims}.${ext}`, folder: "DeviantArt" };
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
		const res = await sendBg({ type: "DA_DOWNLOAD_BATCH", items });
		if (!res?.batchId) {
			showNotice("Could not start the download.", "err");
			return;
		}
		state.batchId = res.batchId;
		setProgress(`${label}: 0/${items.length}`);
		pollBatch();
	}

	async function pollBatch() {
		clearTimeout(state.pollTimer);
		if (!state.batchId) return;
		const st = await sendBg({ type: "DA_BATCH_STATUS", batchId: state.batchId });
		if (!st) {
			setProgress("");
			return;
		}
		const verb = st.finished ? "done" : "downloading";
		setProgress(
			`${verb}: ${st.done + st.failed}/${st.total}${st.failed ? ` · ${st.failed} failed` : ""}${!st.finished && st.current ? ` · ${st.current}` : ""}`,
		);
		if (!st.finished) {
			state.pollTimer = setTimeout(pollBatch, 500);
		} else {
			if (st.failed && st.errors?.length) showNotice(`Download error: ${st.errors[0].error}`, "warn");
			state.batchId = null;
		}
	}

	async function copyText(text) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (_e) {
			const ta = el("textarea");
			ta.value = text;
			document.body.appendChild(ta);
			ta.select();
			let ok = false;
			try {
				ok = document.execCommand("copy");
			} catch (_e2) {}
			ta.remove();
			return ok;
		}
	}

	let scanGeneration = 0;

	async function scan(deep) {
		const generation = ++scanGeneration;
		failedImageUrls.clear();
		resetSizeQueue();
		const startedAtUrl = location.href;
		setBusy(true, deep ? "reveal" : "scan");
		showNotice(deep ? "Clicking the artwork to reveal the full-resolution viewer…" : "Scanning this page…");
		setProgress(deep ? "" : "Looking for images…");
		state.data = { assets: [], totalAssets: 0, page: { url: startedAtUrl, title: document.title || "Scanning…", artist: "" } };
		state.sizes = {};
		state.probe = null;
		state.renderLimit = 40;
		state.selected = new Set();
		$("#pageMeta").textContent = `Scanning ${document.title || location.hostname}…`;
		renderSummary();
		renderList();
		updateActionLabels();
		try {
			const showExploreImages = $("#chkExplore").checked;
			const res = deep
				? await window.__DA_API.deepScan(showExploreImages)
				: await window.__DA_API.scan(showExploreImages, (partial, progress) => {
						if (generation !== scanGeneration || !partial || !partial.ok) return;
						state.data = partial;
						state.selected = new Set();
						allImages().forEach(({ img }) => {
							if (img.role !== "crop") state.selected.add(img.url);
						});
						$("#pageMeta").textContent = `${partial.page.title} | ${partial.page.artist} on DeviantArt`;
						renderSummary();
						renderList(true);
						updateActionLabels();
						loadSizes();
						setProgress(progress.complete ? "" : `Found ${progress.found} asset(s)…`);
					});
			if (generation !== scanGeneration) return;
			if (!res?.ok) {
				showNotice(`Could not scan this page: ${(res?.error) || "unknown error"}`, "err");
				return;
			}
			state.data = res;
			state.sizes = {};
			state.probe = null;
			state.renderLimit = 40;
			state.selected = new Set();
			allImages().forEach(({ img }) => {
				if (img.role !== "crop") state.selected.add(img.url);
			});
			$("#pageMeta").textContent = `${res.page.title} | ${res.page.artist} on DeviantArt`;
			setupRange();
			renderSummary();
			renderList(true);
			updateActionLabels();
			setProgress("");
			if (deep) {
				showNotice(
					res.page.portalOpened
						? "Viewer opened: extra resolution variants collected."
						: "No new image appeared. Tip: click the artwork on the page yourself, then press Rescan. The max row above is already the best quality the CDN will serve for this asset.",
					res.page.portalOpened ? "" : "warn",
				);
			} else {
				showNotice("");
			}
			loadSizes();
		} catch (error) {
			if (generation === scanGeneration) {
				showNotice(`Could not scan this page: ${(error?.message) || error}`, "err");
				setProgress("");
			}
		} finally {
			if (generation === scanGeneration) setBusy(false);
		}
	}

	function setRangeStatus(text, kind) {
		const s = $("#rangeStatus");
		s.textContent = text || "";
		s.className = `rangeStatus${kind ? ` ${kind}` : ""}`;
	}

	async function refreshFolderLabel() {
		let saveMode = "default";
		let folderName = "";
		try {
			const stored = await chrome.storage.local.get(["saveMode", "folderName"]);
			saveMode = stored.saveMode || "default";
			folderName = stored.folderName || "";
		} catch (_e) {}
		const label = saveMode === "custom" ? folderName || "Custom" : saveMode === "ask" ? "Ask each time" : "Default";
		$("#folderLabel").textContent = `Folder: ${label}`;
		$("#btnFolder").title =
			saveMode === "custom"
				? `Custom folder: ${folderName}. Click to change.`
				: saveMode === "ask"
					? "A Save As dialog opens for every download. Click to change."
					: "Downloads\\DeviantArt (browser default). Click to choose a folder.";
	}

	function initFolderButton() {
		const icon = $("#btnFolder .folderIcon");
		if (icon && !icon.firstChild) {
			icon.appendChild(svgIcon(["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"], 13));
		}
		$("#btnFolder").addEventListener("click", async () => {
			try {
				await chrome.tabs.create({ url: chrome.runtime.getURL("saver.html") });
			} catch (error) {
				showNotice(`Could not open folder settings: ${error?.message || String(error)}`, "err");
			}
		});
		chrome.storage.onChanged.addListener(() => refreshFolderLabel());
		refreshFolderLabel();
	}

	async function initBestOnly() {
		try {
			const stored = await chrome.storage.local.get("bestOnly");
			if (stored.bestOnly) $("#chkBest").checked = true;
		} catch (_e) {}
	}

	async function initExploreImages() {
		try {
			const stored = await chrome.storage.local.get("showExploreImages");
			$("#chkExplore").checked = stored.showExploreImages === true;
		} catch (_e) {}
	}

	function setupRange() {
		const p = state.data?.page;
		const box = $("#rangeBox");
		const show = !!(p?.isProfile && p.artist);
		box.classList.toggle("hidden", !show);
		const bestWrap = $("#chkBestWrap");
		bestWrap.classList.toggle("hidden", !(state.data && (state.data.assets.length > 1 || !p.isArtPage)));
		if (!show) return;
		if (!$("#rangeFrom").value) {
			const to = new Date();
			const from = new Date(Date.now() - 30 * 86400000);
			$("#rangeTo").value = to.toISOString().slice(0, 10);
			$("#rangeFrom").value = from.toISOString().slice(0, 10);
		}
		state.range = { items: [], busy: false };
		setRangeStatus("");
		$("#btnRangeDownload").disabled = true;
		$("#btnRangeDownload").textContent = "Download";
		$("#btnRangeCopy").disabled = true;
	}

	async function scanRange() {
		const from = $("#rangeFrom").value;
		const to = $("#rangeTo").value;
		if (!from || !to) {
			setRangeStatus("Pick both dates first.", "warn");
			return;
		}
		if (from > to) {
			setRangeStatus("The From date is after the To date.", "warn");
			return;
		}
		const artist = state.data.page.artist;
		$("#btnRangeScan").disabled = true;
		$("#btnRangeDownload").disabled = true;
		$("#btnRangeCopy").disabled = true;
		setRangeStatus("Scanning gallery pages…");
		const res = await window.__DA_API.profileScan({ artist, from, to, maxPages: 120 });
		$("#btnRangeScan").disabled = false;
		if (!res?.ok) {
			setRangeStatus(`Scan failed: ${(res?.error) || "unknown error"}`, "warn");
			return;
		}
		state.range = { items: res.items, busy: false };
		let extra = "";
		if (res.timedOut) extra = " (time limit reached, try a narrower range)";
		else if (res.hasMore) extra = " (page cap reached, narrow the range for completeness)";
		setRangeStatus(
			`${res.items.length} image(s) between ${from} and ${to} · ${res.pages} page(s) scanned${extra}`,
			res.items.length ? "" : "warn",
		);
		$("#btnRangeDownload").disabled = !res.items.length;
		$("#btnRangeDownload").textContent = `Download (${res.items.length})`;
		$("#btnRangeCopy").disabled = !res.items.length;
		if (res.items.length) showRangeResults(res, from, to);
	}

	function showRangeResults(res, from, to) {
		const page = state.data.page;
		const assets = res.items.map((it) => ({
			base: it.bestUrl.split("/v1/")[0],
			shortId: "",
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
			images: [
				{
					url: it.bestUrl,
					w: it.w || 0,
					h: it.h || 0,
					exact: true,
					q: 100,
					role: "max",
					roleLabel: "max q100",
					ext: it.ext,
					tier: tierFor(it.w || 0),
				},
			],
			score: (it.w || 0) * (it.h || 0),
		}));
		state.data = {
			ok: true,
			page: Object.assign({}, page, { title: `Gallery ${from} \u2192 ${to}` }),
			assets,
			totalAssets: assets.length,
			truncated: false,
			rangeMode: { from, to },
		};
		state.sizes = {};
		state.renderLimit = 40;
		state.selected = new Set();
		assets.forEach((a) => { a.images.forEach((img) => { state.selected.add(img.url); }); });
		$("#pageMeta").textContent = `${page.artist} \u2014 published ${from} \u2192 ${to}`;
		renderSummary();
		renderList();
		updateActionLabels();
		loadSizes();
	}

	function rangeFilename(it) {
		const artist = (state.data.page.artist || "deviantart").replace(/\s+/g, "_");
		const title =
			String(it.title || `deviation-${it.id}`)
				.replace(/[^\w\- ]+/g, "")
				.trim()
				.replace(/\s+/g, "_")
				.slice(0, 90) || `deviation-${it.id}`;
		return `${artist}_${it.date}_${title}.${it.ext}`;
	}

	function bindUi() {
		$("#btnRescan").addEventListener("click", () => scan(false));
		$("#btnReveal").addEventListener("click", () => scan(true));
		$("#chkSmall").addEventListener("change", () => {
			renderList();
			updateActionLabels();
		});
		$("#chkBest").addEventListener("change", () => {
			chrome.storage.local.set({ bestOnly: $("#chkBest").checked });
			renderList();
			updateActionLabels();
		});
		$("#chkExplore").addEventListener("change", () => {
			chrome.storage.local.set({ showExploreImages: $("#chkExplore").checked });
			scan(false);
		});
		$("#btnRangeScan").addEventListener("click", () => scanRange());
		$("#btnRangeDownload").addEventListener("click", () => {
			const items = state.range?.items ? state.range.items : [];
			if (!items.length) return;
			const batch = items.map((it) => ({ url: it.bestUrl, filename: rangeFilename(it), folder: "DeviantArt" }));
			startBatch(batch, `Profile range (${batch.length})`);
		});
		$("#btnRangeCopy").addEventListener("click", async () => {
			const items = state.range?.items ? state.range.items : [];
			if (!items.length) return;
			const ok = await copyText(items.map((it) => it.bestUrl).join("\n"));
			setRangeStatus(ok ? `Copied ${items.length} URLs to the clipboard.` : "Could not access the clipboard.", ok ? "" : "warn");
		});
		$("#btnBest").addEventListener("click", () => downloadEntries(pickBest(), "Download best"));
		$("#btnSelected").addEventListener("click", () => {
			const entries = visibleImages().filter(({ img }) => state.selected.has(img.url));
			downloadEntries(entries, "Download selected");
		});
		$("#btnAll").addEventListener("click", () => downloadEntries(visibleImages(), "Download all"));
		$("#btnCopy").addEventListener("click", async () => {
			const urls = visibleImages().map(({ img }) => img.url);
			if (!urls.length) return;
			const ok = await copyText(urls.join("\n"));
			showNotice(ok ? `Copied ${urls.length} URLs to the clipboard.` : "Could not access the clipboard.", ok ? "" : "warn");
		});
		$("#list").addEventListener("click", (e) => {
			const btn = e.target.closest(".iconBtn");
			if (!btn) return;
			const row = btn.closest(".row");
			const url = row?.dataset.url;
			if (!url) return;
			if (btn.classList.contains("open")) window.open(url, "_blank", "noopener");
			else if (btn.classList.contains("copy")) copyText(url);
			else if (btn.classList.contains("dl")) {
				const entry = allImages().find(({ img }) => img.url === url);
				if (entry) downloadEntries([entry], "Download");
			}
		});
		$("#list").addEventListener("scroll", () => {
			const l = $("#list");
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
		if (msg && msg.type === "DA_PROFILE_PROGRESS") {
			setRangeStatus(`Scanning page ${msg.page}… ${msg.found} match(es) so far`);
		}
	});

	const SIDEBAR_HOST_ID = "da-image-hunter-sidebar";
	const SIDEBAR_STATE_KEY = "sidebarState";
	const PAGE_LAYOUT_STYLE_ID = "dah-page-layout-style";
	let sidebarInited = false;
	let lastHref = location.href;
	let navTimer = null;
	let layoutStyleTimer = null;

	function hidePageScrollbar() {
		clearTimeout(layoutStyleTimer);
		if (!document.getElementById(PAGE_LAYOUT_STYLE_ID)) {
			const styleEl = document.createElement("style");
			styleEl.id = PAGE_LAYOUT_STYLE_ID;
			styleEl.textContent = `
      html.dah-sidebar-open {
        --dah-sidebar-track: 0px;
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) var(--dah-sidebar-track) !important;
        grid-template-rows: minmax(100vh, auto) !important;
        align-items: start !important;
        overflow-x: clip !important;
        transition: grid-template-columns 340ms cubic-bezier(.22, .8, .25, 1);
      }
      html.dah-sidebar-open.dah-sidebar-ready:not(.dah-sidebar-min) { --dah-sidebar-track: 600px; }
      html.dah-sidebar-open.dah-sidebar-min { --dah-sidebar-track: 46px; }
      html.dah-sidebar-open.dah-sidebar-closing { --dah-sidebar-track: 0px; }
      html.dah-sidebar-open > body {
        grid-column: 1 !important;
        grid-row: 1 !important;
        width: 100% !important;
        min-width: 0 !important;
        margin: 0 !important;
      }
      html.dah-sidebar-open > #${SIDEBAR_HOST_ID} {
        position: sticky !important;
        grid-column: 2 !important;
        grid-row: 1 !important;
        align-self: start !important;
        top: 0 !important;
        right: auto !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: none !important;
        height: 100vh !important;
        transition: opacity 220ms ease, transform 220ms ease;
      }
      html.dah-sidebar-open.dah-sidebar-closing > #${SIDEBAR_HOST_ID} {
        opacity: 0;
        transform: translateX(14px) !important;
      }
      @media (prefers-reduced-motion: reduce) {
        html.dah-sidebar-open,
        html.dah-sidebar-open > #${SIDEBAR_HOST_ID} { transition: none; }
      }
    `;
			(document.head || document.documentElement).appendChild(styleEl);
		}
		document.documentElement.classList.remove("dah-sidebar-closing");
		document.documentElement.classList.add("dah-sidebar-open");
	}

	function restorePageScrollbar() {
		document.documentElement.classList.remove("dah-sidebar-ready", "dah-sidebar-min");
		document.documentElement.classList.add("dah-sidebar-closing");
		clearTimeout(layoutStyleTimer);
		layoutStyleTimer = setTimeout(() => {
			if (!document.getElementById(SIDEBAR_HOST_ID)) {
				document.documentElement.classList.remove("dah-sidebar-open", "dah-sidebar-closing");
				const styleEl = document.getElementById(PAGE_LAYOUT_STYLE_ID);
				if (styleEl) styleEl.remove();
			}
		}, 500);
	}

	function unmountSidebar(host) {
		host.classList.add("dah-closing");
		host.style.pointerEvents = "none";
		host.style.transform = "translateX(100%)";
		restorePageScrollbar();
		saveSidebarState("closed");
		clearTimeout(host.__dahRemoveTimer);
		host.__dahRemoveTimer = setTimeout(() => host.remove(), 400);
	}

	function scheduleRescan() {
		clearTimeout(navTimer);
		navTimer = setTimeout(() => {
			const host = document.getElementById(SIDEBAR_HOST_ID);
			if (!host) return;
			scan(false).catch(() => {});
		}, 1500);
	}

	setInterval(() => {
		if (location.href !== lastHref) {
			lastHref = location.href;
			scheduleRescan();
		}
	}, 1000);

	function saveSidebarState(value) {
		try {
			chrome.storage.local.set({ [SIDEBAR_STATE_KEY]: value });
		} catch (_e) {}
	}

	function setMinimized(host, minimized) {
		host.classList.toggle("dah-min", minimized);
		document.documentElement.classList.toggle("dah-sidebar-min", minimized);
		host.style.width = minimized ? "46px" : "600px";
		saveSidebarState(minimized ? "min" : "open");
	}

	function decorateFooter(root) {
		const defs = {
			btnBest: { label: "Best", paths: ["m12 3.5 2.4 5.1 5.6.7-4.2 3.9 1.1 5.6L12 16.1 7.1 18.8l1.1-5.6L4 9.3l5.6-.7z"] },
			btnSelected: { label: "Selected", paths: ["M9 11l3 3 8-9", "M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"] },
			btnAll: { label: "All", paths: ["M12 4v11", "m7 10 5 5 5-5", "M5 20h14"] },
			btnCopy: { label: "URLs", paths: ["M9 9h10v10H9z", "M5 15V5h10"] },
		};
		Object.entries(defs).forEach(([id, def]) => {
			const btn = root.getElementById(id);
			if (!btn) return;
			btn.textContent = "";
			btn.appendChild(svgIcon(def.paths));
			const lbl = document.createElement("span");
			lbl.className = "lbl";
			lbl.textContent = def.label;
			btn.appendChild(lbl);
		});
	}

	async function mountSidebar(minimized) {
		if (document.getElementById(SIDEBAR_HOST_ID)) return;
		const host = document.createElement("div");
		host.id = SIDEBAR_HOST_ID;
		if (minimized) host.classList.add("dah-min");
		host.style.cssText = `position:sticky;top:0;width:${minimized ? 46 : 600}px;height:100vh;z-index:2147483647;overflow:hidden;transform:translateX(14px);opacity:0;`;
		const root = host.attachShadow({ mode: "open" });
		const [css, sidebarCss, markup] = await Promise.all([
			fetch(chrome.runtime.getURL("popup.css")).then((r) => r.text()),
			fetch(chrome.runtime.getURL("sidebar.css")).then((r) => r.text()),
			fetch(chrome.runtime.getURL("sidebar.html")).then((r) => r.text()),
		]);
		const style = document.createElement("style");
		style.textContent = `${css.replace(/:root/g, ":host")}\n${sidebarCss}`;
		const doc = new DOMParser().parseFromString(markup, "text/html");
		const app = doc.getElementById("app");
		if (!app) return;
		root.appendChild(style);
		root.appendChild(app);
		const logo = root.querySelector(".logo");
		if (logo) logo.src = chrome.runtime.getURL("icons/icon48.png");

		const top = root.querySelector(".top");
		if (top) {
			const min = document.createElement("button");
			min.className = "sidebarTopBtn sidebarMin";
			min.title = "Minimize panel";
			min.textContent = "\u2013";
			const close = document.createElement("button");
			close.className = "sidebarTopBtn sidebarClose";
			close.title = "Close panel";
			close.textContent = "\u2715";
			top.appendChild(min);
			top.appendChild(close);
			min.addEventListener("click", () => setMinimized(host, true));
			close.addEventListener("click", () => unmountSidebar(host));
		}

		const tab = document.createElement("button");
		tab.className = "sidebarTab";
		tab.title = "Open Deviation Lens";
		const tabLogo = document.createElement("img");
		tabLogo.src = chrome.runtime.getURL("icons/icon48.png");
		tabLogo.alt = "";
		const chev = document.createElement("span");
		chev.className = "sidebarTabChev";
		chev.textContent = "\u2039";
		tab.appendChild(chev);
		tab.appendChild(tabLogo);
		tab.addEventListener("click", () => setMinimized(host, false));
		root.appendChild(tab);

		document.documentElement.appendChild(host);
		hidePageScrollbar();
		document.documentElement.classList.toggle("dah-sidebar-min", !!minimized);
		requestAnimationFrame(() => {
			document.documentElement.classList.add("dah-sidebar-ready");
			host.style.transform = "translateX(0)";
			host.style.opacity = "1";
		});
		$ = (s) => root.querySelector(s);
		if (!sidebarInited) {
			sidebarInited = true;
			bindUi();
			decorateFooter(root);
			initFolderButton();
			await initBestOnly();
			await initExploreImages();
			await scan(false);
		}
	}

	function toggleSidebar() {
		const existing = document.getElementById(SIDEBAR_HOST_ID);
		if (existing) {
			if (existing.classList.contains("dah-closing")) {
				clearTimeout(existing.__dahRemoveTimer);
				existing.classList.remove("dah-closing");
				existing.style.pointerEvents = "";
				hidePageScrollbar();
				document.documentElement.classList.add("dah-sidebar-ready");
				existing.style.transform = "translateX(0)";
				existing.style.opacity = "1";
				saveSidebarState("open");
				return Promise.resolve();
			}
			if (existing.classList.contains("dah-min")) {
				setMinimized(existing, false);
				return Promise.resolve();
			}
			unmountSidebar(existing);
			return Promise.resolve();
		}
		return mountSidebar(false);
	}

	chrome.runtime.onMessage.addListener((msg) => {
		if (msg && msg.type === "DA_TOGGLE_SIDEBAR") {
			toggleSidebar().catch(() => {});
		}
	});

	chrome.storage.local
		.get(SIDEBAR_STATE_KEY)
		.then((stored) => {
			const st = stored?.[SIDEBAR_STATE_KEY];
			if (st === "open") mountSidebar(false).catch(() => {});
			else if (st === "min") mountSidebar(true).catch(() => {});
		})
		.catch(() => {});
})();
