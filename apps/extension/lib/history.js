// Optional local record of artwork the user has saved. Kept in its own database so the folder-handle database never needs migrating.
(() => {
	const DB_NAME = "deviation-lens-history";
	const STORE = "saved";

	function open() {
		return new Promise((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, 1);
			req.onupgradeneeded = () => {
				if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}

	async function run(mode, work) {
		const db = await open();
		try {
			return await new Promise((resolve, reject) => {
				const tx = db.transaction(STORE, mode);
				const request = work(tx.objectStore(STORE));
				tx.oncomplete = () => resolve(request?.result);
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
	}

	async function add(keys) {
		const unique = [...new Set((keys || []).filter(Boolean))];
		if (!unique.length) return;
		const savedAt = Date.now();
		await run("readwrite", (store) => {
			for (const key of unique) store.put(savedAt, key);
		});
	}

	async function all() {
		return new Set(await run("readonly", (store) => store.getAllKeys()));
	}

	function count() {
		return run("readonly", (store) => store.count());
	}

	function clear() {
		return run("readwrite", (store) => store.clear());
	}

	globalThis.DeviationLens = globalThis.DeviationLens || {};
	globalThis.DeviationLens.history = { add, all, count, clear };
})();
