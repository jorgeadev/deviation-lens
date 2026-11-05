import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHANGELOG_PAGE, VERSION_RULES } from "./versioned-files.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const next = process.argv[2];

if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
	console.error("Usage: pnpm version:set <major.minor.patch>");
	process.exit(1);
}

// Read everything first, so a missing field leaves the repository untouched.
const updates = [];
for (const { file, patterns } of VERSION_RULES) {
	const absolutePath = path.join(rootDir, file);
	let text = await fs.readFile(absolutePath, "utf8");
	for (const pattern of patterns) {
		if (!text.match(pattern)) throw new Error(`${file} has no version field matching ${pattern}.`);
		text = text.replace(pattern, (_whole, before, _version, after) => `${before}${next}${after}`);
	}
	updates.push({ file, absolutePath, text });
}

for (const { absolutePath, text } of updates) await fs.writeFile(absolutePath, text);
for (const { file } of updates) console.log(`updated ${file}`);
console.log(`Version set to ${next}.`);

const changelog = await fs.readFile(path.join(rootDir, CHANGELOG_PAGE), "utf8");
if (!changelog.includes(`id="v${next}"`)) console.log(`Next: add an entry with id="v${next}" to ${CHANGELOG_PAGE}. Packaging requires it.`);
