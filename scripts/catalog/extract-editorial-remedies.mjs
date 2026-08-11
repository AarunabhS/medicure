import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const match = source.match(/const remedies = (\[[\s\S]*?\n\s*\]);\n\n\s*const categoryLabels/);

if (!match) {
  throw new Error("Could not locate the homepage remedy data.");
}

const remedies = vm.runInNewContext(match[1], Object.create(null), { timeout: 1000 });
await writeFile(
  new URL("./editorial-remedies.json", import.meta.url),
  `${JSON.stringify(remedies, null, 2)}\n`,
);

console.log(`Extracted ${remedies.length} reviewed homepage remedy summaries.`);
