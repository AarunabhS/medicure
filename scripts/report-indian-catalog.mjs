import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = join(root, "assets", "data");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const index = await readJson(join(dataDir, "medicine-index.json"));
const sync = await readJson(join(dataDir, "catalog-sync-report.json"));
const profileFiles = (await readdir(join(dataDir, "medicines"))).filter((file) => file.endsWith(".json"));
const profiles = await Promise.all(profileFiles.map((file) => readJson(join(dataDir, "medicines", file))));
const withIngredients = profiles.filter((profile) => profile.ingredients?.length).length;
const withIndications = profiles.filter((profile) => profile.manufacturerIndications?.length).length;
const withDirections = profiles.filter((profile) => profile.products?.some((product) => product.labelDirections)).length;
const multiManufacturer = profiles.filter((profile) => profile.manufacturers?.length > 1).length;
const verifiedListings = profiles.flatMap((profile) => profile.sellerListings || []);
const staleListings = verifiedListings.filter((listing) => listing.stale).length;
const mergedVariants = profiles.filter((profile) => profile.products?.length > 1).length;
const reportDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(index.meta.generatedAt));
const publishedByManufacturer = new Map();
for (const product of profiles.flatMap((profile) => profile.products || [])) {
  publishedByManufacturer.set(product.manufacturerId, (publishedByManufacturer.get(product.manufacturerId) || 0) + 1);
}
const sourceRows = sync.sources.map((source) => `| ${source.id} | ${source.status} | ${source.products.toLocaleString("en-IN")} | ${(publishedByManufacturer.get(source.id) || 0).toLocaleString("en-IN")} |`).join("\n");
const warnings = sync.warnings.length ? sync.warnings.map((warning) => `- ${warning}`).join("\n") : "- None";

const markdown = `# Medicure catalog update report

Generated: ${reportDate}

## Coverage

| Measure | Count |
| --- | ---: |
| Canonical medicine profiles | ${profiles.length.toLocaleString("en-IN")} |
| Nested manufacturer products | ${index.meta.products.toLocaleString("en-IN")} |
| Profiles with structured ingredients | ${withIngredients.toLocaleString("en-IN")} |
| Profiles with manufacturer-stated indications | ${withIndications.toLocaleString("en-IN")} |
| Profiles with manufacturer-labelled directions | ${withDirections.toLocaleString("en-IN")} |
| Profiles spanning multiple Indian manufacturers | ${multiManufacturer.toLocaleString("en-IN")} |
| Profiles containing merged product variants | ${mergedVariants.toLocaleString("en-IN")} |
| Manually verified retailer listings | ${verifiedListings.length.toLocaleString("en-IN")} |
| Retailer listings older than 30 days | ${staleListings.toLocaleString("en-IN")} |

## Source adapters

| Source | Status | Automatically synchronized | Published catalog records |
| --- | --- | ---: | ---: |
${sourceRows}

## Parser warnings

${warnings}

## Review gates

- Duplicate canonical IDs: blocked by validation
- Missing official product URLs: blocked by validation
- Unresolved aliases and identity placeholders: blocked by validation
- Major automated source-count drops: blocked against reviewed floors
- Seller records older than 30 days: marked stale for manual review
- Publication: requires review and merge of this pull request
`;

await writeFile(join(dataDir, "catalog-update-report.md"), markdown);
console.log(`Wrote catalog review report for ${profiles.length} profiles.`);
