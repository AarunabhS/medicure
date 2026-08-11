import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MANUFACTURERS } from "./catalog/sources.mjs";
import {
  parseBaksonPdf,
  parseHapcoHtml,
  parseMaheshHtml,
  parseReckewegDetail,
  parseReckewegHtml,
  parseSblPdf,
} from "./catalog/parsers.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const cacheDir = join(root, ".cache", "indian-catalog");
const seedPath = join(root, "scripts", "catalog", "seed-products.json");
const reportPath = join(root, "assets", "data", "catalog-sync-report.json");
const aliases = JSON.parse(await readFile(join(root, "scripts", "catalog", "aliases.json"), "utf8"));
const allowNetwork = !process.argv.includes("--offline");
const force = process.argv.includes("--force");
const startedAt = new Date();
const robotsCache = new Map();

await mkdir(cacheDir, { recursive: true });
await mkdir(join(root, "assets", "data"), { recursive: true });

const report = {
  schemaVersion: 1,
  startedAt: startedAt.toISOString(),
  completedAt: "",
  status: "running",
  products: 0,
  sources: [],
  warnings: [],
};
const products = [];

for (const manufacturer of MANUFACTURERS) {
  if (!manufacturer.automated) {
    report.sources.push({
      id: manufacturer.id,
      status: "manual-review",
      products: 0,
      sourceUrl: manufacturer.sourceUrl,
      note: manufacturer.reviewNote,
    });
    continue;
  }

  try {
    const parsed = await syncManufacturer(manufacturer);
    products.push(...parsed);
    report.sources.push({
      id: manufacturer.id,
      status: "parsed",
      products: parsed.length,
      sourceUrl: manufacturer.sourceUrl,
    });
  } catch (error) {
    report.sources.push({
      id: manufacturer.id,
      status: "failed",
      products: 0,
      sourceUrl: manufacturer.sourceUrl,
      error: error.message,
    });
    report.warnings.push(`${manufacturer.shortName}: ${error.message}`);
  }
}

const uniqueProducts = [...new Map(products.map((product) => [product.id, product])).values()];
report.products = uniqueProducts.length;
report.completedAt = new Date().toISOString();
report.status = uniqueProducts.length >= 100 ? "review-required" : "failed-quality-gate";

if (uniqueProducts.length < 100) {
  report.warnings.push(`Only ${uniqueProducts.length} products were normalized; at least 100 are required.`);
}

await writeFile(seedPath, `${JSON.stringify({
  schemaVersion: 1,
  generatedAt: report.completedAt,
  products: uniqueProducts,
}, null, 2)}\n`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Normalized ${uniqueProducts.length} official Indian product records.`);
console.log(`Review report: ${reportPath}`);

if (report.status === "failed-quality-gate") process.exitCode = 1;

async function syncManufacturer(manufacturer) {
  if (manufacturer.parser === "hapco-html") {
    const collected = [];
    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      const url = new URL(`${letter}.html`, manufacturer.sourceUrl).href;
      const path = join(cacheDir, `hapco-${letter}.html`);
      const html = await getText(url, path);
      collected.push(...parseHapcoHtml(html, url, aliases));
      await pause(175);
    }
    return collected;
  }

  const extension = manufacturer.parser.endsWith("pdf") ? ".pdf" : ".html";
  const cachePath = join(cacheDir, `${manufacturer.id}${extension}`);
  await getFile(manufacturer.sourceUrl, cachePath);

  if (manufacturer.parser === "bakson-pdf") {
    return parseBaksonPdf(cachePath, manufacturer.sourceUrl, aliases);
  }
  if (manufacturer.parser === "sbl-pdf") {
    return parseSblPdf(cachePath, manufacturer.sourceUrl);
  }

  const html = await readFile(cachePath, "utf8");
  if (manufacturer.parser === "mahesh-html") {
    return parseMaheshHtml(html, manufacturer.sourceUrl, aliases);
  }
  if (manufacturer.parser === "reckeweg-html") {
    const listed = parseReckewegHtml(html, manufacturer.sourceUrl);
    const detailed = [];
    for (const product of listed) {
      const detailPath = join(cacheDir, `reckeweg-${product.id}.html`);
      try {
        const detailHtml = await getText(product.sourceUrl, detailPath);
        detailed.push(parseReckewegDetail(detailHtml, product));
      } catch (error) {
        report.warnings.push(`Dr. Reckeweg detail ${product.productName}: ${error.message}`);
        detailed.push(product);
      }
      await pause(175);
    }
    return detailed;
  }
  return [];
}

async function getText(url, cachePath) {
  await getFile(url, cachePath);
  return readFile(cachePath, "utf8");
}

async function getFile(url, cachePath) {
  if (!force) {
    try {
      const cached = await readFile(cachePath);
      if (cached.length > 0) return;
    } catch {
      // Fetch below.
    }
  }

  if (!allowNetwork) {
    throw new Error(`Missing offline cache ${basename(cachePath)}`);
  }

  const allowed = await robotsAllows(url);
  if (!allowed) throw new Error(`robots.txt does not permit automated collection of ${url}`);

  const response = await fetchWithTimeout(url, 60_000);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 100) throw new Error(`Empty response from ${url}`);
  await writeFile(cachePath, bytes);
}

async function robotsAllows(url) {
  const parsed = new URL(url);
  const robotsUrl = `${parsed.origin}/robots.txt`;
  if (!robotsCache.has(robotsUrl)) {
    try {
      const response = await fetchWithTimeout(robotsUrl, 15_000);
      robotsCache.set(robotsUrl, response.ok ? await response.text() : "");
    } catch {
      robotsCache.set(robotsUrl, "");
    }
  }
  const robots = robotsCache.get(robotsUrl);
  if (!robots) return true;

  let applies = false;
  const disallowed = [];
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(field)) {
      applies = value === "*" || /medicure/i.test(value);
    } else if (applies && /^disallow$/i.test(field) && value) {
      disallowed.push(value);
    }
  }
  return !disallowed.some((path) => path === "/" || parsed.pathname.startsWith(path));
}

async function fetchWithTimeout(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "MedicureCatalogBot/1.0 (+https://medicur.in/; public catalog verification)",
        accept: "text/html,application/pdf;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
