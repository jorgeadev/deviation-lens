const fs = require("node:fs");
const file = process.argv[2];
const d = JSON.parse(fs.readFileSync(file, "utf8"));

const fmtToken = (t) => {
	if (!t) return "no-token";
	if (t.obj) return JSON.stringify(t.obj).slice(0, 160);
	return JSON.stringify(t).slice(0, 160);
};

const show = (label, snap) => {
	console.log(`== ${label} == title=${snap.title} url=${snap.url}`);
	snap.imgs.forEach((i, idx) => {
		console.log(`#${idx} ${i.w}x${i.h} | ${i.cls.slice(0, 55)} | ${i.inLink ? `LINK:${i.inLink.slice(0, 60)}` : ""} | ${i.src.slice(0, 150)}`);
	});
	console.log(`dialogs: ${JSON.stringify(snap.dialogs.slice(0, 10))}`);
	console.log(`bodyKids: ${JSON.stringify(snap.bodyKids)}`);
};

show("BEFORE", d.before);
console.log("clicked:", JSON.stringify(d.clicked));
show("AFTER", d.after);
show("AFTER-ESC", d.afterEsc);

console.log("== REQUESTS ==");
d.requests.forEach((r) => { console.log(`${fmtToken(r.token)} || ${r.url.slice(0, 160)}`); });
console.log("== RESPONSES ==");
d.responses.filter((r) => /wixmp|\/download\//.test(r.url)).forEach((r) => { console.log(`${r.status} len=${r.len} ${r.type} ${r.url.slice(0, 130)}`); });
