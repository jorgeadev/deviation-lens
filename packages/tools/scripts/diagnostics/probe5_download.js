const url = process.env.DEVIATION_LENS_TEST_DOWNLOAD_URL;

if (!url) {
	console.error("Set DEVIATION_LENS_TEST_DOWNLOAD_URL to a temporary image URL before running this diagnostic.");
	process.exitCode = 1;
} else {
	const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" };

	(async () => {
		for (const [label, options] of [
			["HEAD(manual)", { method: "HEAD", redirect: "manual" }],
			["HEAD(follow)", { method: "HEAD", redirect: "follow" }],
			["GET(range)", { method: "GET", headers: { ...UA, Range: "bytes=0-0" }, redirect: "follow" }],
		]) {
			try {
				const response = await fetch(url, { ...options, headers: { ...UA, ...options.headers } });
				console.log(label, response.status, response.url);
				console.log("length=", response.headers.get("content-length"), "type=", response.headers.get("content-type"));
				if (response.body) await response.body.cancel();
			} catch (error) {
				console.error(label, error.message);
			}
		}
	})();
}
