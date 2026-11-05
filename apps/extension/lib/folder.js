// Writes into the folder the user connected on the settings page. Used by the service worker and the offscreen document.
(() => {
	function openHandlesDb() {
		return new Promise((resolve, reject) => {
			const req = indexedDB.open("da-image-hunter", 1);
			req.onupgradeneeded = () => {
				if (!req.result.objectStoreNames.contains("handles")) req.result.createObjectStore("handles");
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}

	async function getFolderHandle() {
		try {
			const db = await openHandlesDb();
			try {
				return await new Promise((resolve, reject) => {
					const rq = db.transaction("handles", "readonly").objectStore("handles").get("folder");
					rq.onsuccess = () => resolve(rq.result);
					rq.onerror = () => reject(rq.error);
				});
			} finally {
				db.close();
			}
		} catch (_e) {
			return null;
		}
	}

	async function createUniqueFile(dir, name) {
		const dot = name.lastIndexOf(".");
		const stem = dot > 0 ? name.slice(0, dot) : name;
		const ext = dot > 0 ? name.slice(dot) : "";
		for (let n = 1; n < 10000; n++) {
			const candidate = n === 1 ? name : `${stem} (${n})${ext}`;
			try {
				await dir.getFileHandle(candidate);
			} catch (e) {
				if (e?.name === "NotFoundError") return { handle: await dir.getFileHandle(candidate, { create: true }), name: candidate };
				if (e?.name !== "TypeMismatchError") throw e;
			}
		}
		throw new Error(`Could not find a free file name for ${name}.`);
	}

	// Returns an error result, rather than throwing, when the folder is missing or its permission has lapsed.
	async function prepare() {
		const handle = await getFolderHandle();
		if (!handle) return { ok: false, error: "No custom folder selected yet. Open the extension folder settings." };
		let permission = "granted";
		try {
			permission = await handle.queryPermission({ mode: "readwrite" });
		} catch (_e) {}
		if (permission !== "granted") return { ok: false, error: "Folder access expired. Open Folder settings and click Connect again." };
		return { ok: true, handle };
	}

	async function writeBlob(root, relativePath, blob) {
		const parts = globalThis.DeviationLens.naming.sanitizePath(relativePath).split("/").filter(Boolean);
		if (!parts.length) parts.push("image");
		let dir = root;
		for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
		const { handle, name } = await createUniqueFile(dir, parts[parts.length - 1]);
		const writable = await handle.createWritable();
		await writable.write(blob);
		await writable.close();
		return [...parts.slice(0, -1), name].join("/");
	}

	globalThis.DeviationLens = globalThis.DeviationLens || {};
	globalThis.DeviationLens.folder = { prepare, writeBlob };
})();
