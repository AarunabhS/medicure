import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeName, normalizeKey } from "./catalog/core.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = join(root, "assets", "data");
const profilesDir = join(dataDir, "medicines");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const index = await readJson(join(dataDir, "medicine-index.json"));
const aliases = await readJson(join(root, "scripts", "catalog", "aliases.json"));
const syncReport = await readJson(join(dataDir, "catalog-sync-report.json"));
const errors = [];
const warnings = [];

const profileFiles = (await readdir(profilesDir)).filter((file) => file.endsWith(".json"));
const profiles = await Promise.all(profileFiles.map((file) => readJson(join(profilesDir, file))));

assert(index.meta.schemaVersion === 1, "Unsupported medicine index schema version.");
assert(index.meta.remedies === profiles.length, `Index says ${index.meta.remedies} remedies but ${profiles.length} profile files exist.`);
assert(profiles.length >= 100, `Only ${profiles.length} canonical profiles were built; at least 100 are required.`);
assert(syncReport.status !== "failed-quality-gate", "The latest catalog sync failed its quality gate.");

assertUnique(profiles, "id", "canonical ID");
assertUnique(profiles, "slug", "profile slug");

for (const remedy of profiles) {
  assert(Boolean(remedy.canonicalName), `${remedy.slug}: missing canonical name.`);
  assert(remedy.sources?.every((source) => isHttpUrl(source.url)), `${remedy.slug}: every published source must have an HTTP URL.`);
  assert(remedy.products?.every((product) => product.id && isHttpUrl(product.sourceUrl)), `${remedy.slug}: every product must have an ID and official source URL.`);
  assert(remedy.manufacturerIndications?.every((claim) => claim.attribution && isHttpUrl(claim.sourceUrl)), `${remedy.slug}: every indication must name a manufacturer and source URL.`);
  assert(remedy.products?.every((product) => !product.labelDirections || isHttpUrl(product.sourceUrl)), `${remedy.slug}: labelled directions are missing their official source.`);
  if (remedy.type === "single") {
    assert(remedy.hpiReferences?.some((reference) => isHttpUrl(reference.url)), `${remedy.slug}: single remedies require a PCIM&H reference.`);
  }

  const pagePath = join(root, "medicines", `${remedy.slug}.html`);
  try {
    await access(pagePath);
    const pageHtml = await readFile(pagePath, "utf8");
    const canonicalUrl = `https://medicur.in/medicines/${remedy.slug}.html`;
    assert(pageHtml.includes(`<link rel="canonical" href="${canonicalUrl}">`), `${remedy.slug}: generated SEO page has a missing or incorrect canonical URL.`);
    const structuredDataMatch = pageHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert(Boolean(structuredDataMatch), `${remedy.slug}: generated SEO page is missing structured data.`);
    if (structuredDataMatch) {
      try {
        const structuredData = JSON.parse(structuredDataMatch[1]);
        assert(structuredData["@type"] === "MedicalWebPage", `${remedy.slug}: structured page type must be MedicalWebPage.`);
        assert(structuredData.about?.["@type"] === "Drug", `${remedy.slug}: structured medicine entity must be a Drug.`);
        assert(structuredData.url === canonicalUrl, `${remedy.slug}: structured data URL does not match its canonical URL.`);
      } catch {
        errors.push(`${remedy.slug}: generated structured data is not valid JSON.`);
      }
    }
  } catch {
    errors.push(`${remedy.slug}: generated SEO page is missing.`);
  }

  for (const listing of remedy.sellerListings || []) {
    assert(isHttpUrl(listing.url), `${remedy.slug}: retailer listing URL is invalid.`);
    const age = Math.floor((Date.now() - Date.parse(listing.listingLastVerifiedAt)) / 86_400_000);
    assert(listing.stale === (age > 30 || !Number.isFinite(age)), `${remedy.slug}: retailer stale status does not match its verification date.`);
  }
}

const nux = profiles.filter((profile) => normalizeKey(canonicalizeName(profile.canonicalName, aliases)) === "nux vomica");
assert(nux.length === 1, `Nux Vomica must resolve to exactly one profile; found ${nux.length}.`);
if (nux[0]) {
  assert(new Set(nux[0].availablePotencies).size === nux[0].availablePotencies.length, "Nux Vomica contains duplicate potency values.");
  assert(nux[0].products.length >= 2, "Nux Vomica should contain nested products from more than one Indian manufacturer source.");
}

const coveredManufacturers = new Set(profiles.flatMap((profile) => profile.products.map((product) => product.manufacturerId)));
for (const manufacturerId of ["sbl", "schwabe-india", "reckeweg", "bakson", "hapco", "mahesh", "mb-king"]) {
  assert(coveredManufacturers.has(manufacturerId), `Initial catalog coverage is missing manufacturer: ${manufacturerId}.`);
}

const compositionKeys = new Map();
for (const remedy of profiles.filter((profile) => profile.type === "combination")) {
  const key = normalizeKey(remedy.canonicalName);
  const signature = remedy.ingredients.map((ingredient) => `${normalizeKey(ingredient.name)}:${normalizeKey(ingredient.potency)}:${normalizeKey(ingredient.proportion)}`).sort().join("|");
  if (!compositionKeys.has(key)) compositionKeys.set(key, new Set());
  compositionKeys.get(key).add(signature);
}
for (const [name, signatures] of compositionKeys) {
  if (signatures.size > 1) {
    const matching = profiles.filter((profile) => profile.type === "combination" && normalizeKey(profile.canonicalName) === name);
    assert(matching.length === signatures.size, `${name}: differently composed formulations were merged.`);
  }
}

let baseline;
try {
  baseline = await readJson(join(root, "scripts", "catalog", "source-baseline.json"));
} catch {
  warnings.push("No source-count baseline exists yet; major source-drop validation was skipped.");
}
if (baseline) {
  for (const [sourceId, minimum] of Object.entries(baseline.minimumProducts || {})) {
    const source = syncReport.sources.find((item) => item.id === sourceId);
    assert(source && source.status === "parsed", `${sourceId}: source did not parse successfully.`);
    assert(source.products >= minimum, `${sourceId}: parsed ${source.products} records, below the reviewed floor of ${minimum}.`);
  }
}

const unresolved = index.remedies.filter((remedy) => /\b(?:unknown|unnamed|undefined|null)\b/i.test(remedy.canonicalName));
assert(unresolved.length === 0, `${unresolved.length} unresolved canonical names remain.`);

if (errors.length) {
  console.error(`Catalog validation failed with ${errors.length} error${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);
console.log(`Validated ${profiles.length} canonical remedies, ${index.meta.products} product records and ${index.meta.manufacturers} manufacturers.`);

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function assertUnique(items, field, label) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item[field])) errors.push(`Duplicate ${label}: ${item[field]}`);
    seen.add(item[field]);
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
