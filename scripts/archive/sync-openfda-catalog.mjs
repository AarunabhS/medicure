#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://api.fda.gov/drug/ndc.json";
const SOURCE_URL = "https://open.fda.gov/apis/drug/ndc/";
const LICENSE_URL = "https://open.fda.gov/license/";
const PAGE_SIZE = 1000;
const REQUEST_DELAY_MS = 220;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputPath = resolve(projectRoot, "assets/data/homeopathic-products.json");

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function first(value) {
  return Array.isArray(value) ? clean(value[0]) : clean(value);
}

function compactProduct(product) {
  return {
    id: clean(product.product_id) || `${clean(product.product_ndc)}_${clean(product.spl_id)}`,
    ndc: clean(product.product_ndc),
    brand: clean(product.brand_name),
    generic: clean(product.generic_name),
    manufacturer: clean(product.labeler_name) || first(product.openfda?.manufacturer_name),
    ingredients: (product.active_ingredients || []).map((ingredient) => ({
      name: clean(ingredient.name),
      strength: clean(ingredient.strength),
    })),
    dosageForm: clean(product.dosage_form),
    routes: (product.route || []).map(clean).filter(Boolean),
    packages: (product.packaging || []).map((item) => clean(item.description)).filter(Boolean),
    marketingStart: clean(product.marketing_start_date),
    listingExpiration: clean(product.listing_expiration_date),
    splSetId: first(product.openfda?.spl_set_id),
    finished: Boolean(product.finished),
  };
}

async function fetchPage(skip, attempt = 1) {
  const url = new URL(API_URL);
  url.searchParams.set("search", 'marketing_category:"UNAPPROVED HOMEOPATHIC"');
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("skip", String(skip));

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Medicure-Catalog-Sync/1.0 (https://medicur.in/)",
      },
    });
    if (!response.ok) throw new Error(`openFDA returned ${response.status} ${response.statusText}`);
    return response.json();
  } catch (error) {
    if (attempt >= 4) throw error;
    await sleep(750 * 2 ** (attempt - 1));
    return fetchPage(skip, attempt + 1);
  }
}

function countUnique(products, selector) {
  const values = new Set();
  products.forEach((product) => {
    const selected = selector(product);
    const list = Array.isArray(selected) ? selected : [selected];
    list.filter(Boolean).forEach((value) => values.add(value));
  });
  return values.size;
}

async function main() {
  const firstPage = await fetchPage(0);
  const expectedTotal = firstPage.meta.results.total;
  const rawProducts = [...firstPage.results];

  for (let skip = PAGE_SIZE; skip < expectedTotal; skip += PAGE_SIZE) {
    await sleep(REQUEST_DELAY_MS);
    const page = await fetchPage(skip);
    rawProducts.push(...page.results);
    process.stdout.write(`\rDownloaded ${Math.min(rawProducts.length, expectedTotal)} of ${expectedTotal} products`);
  }
  process.stdout.write("\n");

  const productsById = new Map();
  rawProducts.map(compactProduct).forEach((product) => productsById.set(product.id, product));
  const products = [...productsById.values()].sort((left, right) =>
    (left.generic || left.brand).localeCompare(right.generic || right.brand, "en", { sensitivity: "base" }),
  );

  const catalog = {
    meta: {
      title: "Medicure Homeopathic Product Encyclopedia",
      source: "U.S. FDA National Drug Code Directory via openFDA",
      sourceUrl: SOURCE_URL,
      license: "CC0 1.0 / public domain unless otherwise noted",
      licenseUrl: LICENSE_URL,
      sourceLastUpdated: clean(firstPage.meta.last_updated),
      generatedAt: new Date().toISOString(),
      marketingCategory: "UNAPPROVED HOMEOPATHIC",
      totalProducts: products.length,
      manufacturers: countUnique(products, (product) => product.manufacturer),
      ingredients: countUnique(products, (product) => product.ingredients.map((ingredient) => ingredient.name)),
      dosageForms: countUnique(products, (product) => product.dosageForm),
      disclaimer:
        "Directory entries are submitted by labelers. Listing does not indicate FDA approval, verification, effectiveness, or Medicure stock availability.",
    },
    products,
  };

  if (products.length < expectedTotal * 0.98) {
    throw new Error(`Catalog validation failed: expected about ${expectedTotal} records but retained ${products.length}`);
  }
  if (products.some((product) => !product.id || (!product.generic && !product.brand))) {
    throw new Error("Catalog validation failed: one or more products are missing an identity or display name");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalog)}\n`, "utf8");
  console.log(
    `Saved ${products.length} products from ${catalog.meta.manufacturers} labelers and ${catalog.meta.ingredients} active ingredients to ${outputPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
