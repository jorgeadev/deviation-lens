import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSIONED_FILES } from "./versioned-files.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const next = process.argv[2];

if (!next || !/^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/i.test(next)) {
	console.error("Usage: pnpm version:set <major.minor.patch[-label.number]>");
	process.exit(1);
}

const { version: current } = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
if (current === next) {
	console.log(`Already at ${next}.`);
	process.exit(0);
}

// Read everything first, so a missing file or stale version leaves the repository untouched.
const updates = [];
for (const file of VERSIONED_FILES) {
	const absolutePath = path.join(rootDir, file);
	const before = await fs.readFile(absolutePath, "utf8");
	if (!before.includes(current)) throw new Error(`${file} does not contain the current version ${current}.`);
	let after = before.replaceAll(current, next);
	if (file.endsWith("manifest.json")) {
		// Chrome needs a purely numeric manifest version; the label lives in version_name.
		after = after.replace(/("version":\s*")[^"]+(")/, `$1${next.split("-")[0]}$2`);
	}
	updates.push({ file, absolutePath, after });
}

for (const { absolutePath, after } of updates) await fs.writeFile(absolutePath, after);
for (const { file } of updates) console.log(`updated ${file}`);
console.log(`${current} -> ${next}`);
