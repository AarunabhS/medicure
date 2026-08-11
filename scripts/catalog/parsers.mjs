import { readFile } from "node:fs/promises";
import {
  canonicalizeName,
  extractForm,
  extractPackSizes,
  extractPotencies,
  formatPotency,
  normalizeKey,
  normalizeWhitespace,
  stableId,
  titleCaseMedicine,
  unique,
} from "./core.mjs";

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripHtml(value) {
  return normalizeWhitespace(
    decodeHtml(String(value ?? "").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ")),
  );
}

function productRecord({ manufacturerId, canonicalName, productName, form, potencies, packSizes, ingredients, labelDirections, indication, sourceUrl, sourceType = "official catalog", type = "single" }) {
  return {
    id: stableId(manufacturerId, productName, form),
    manufacturerId,
    canonicalName,
    productName: normalizeWhitespace(productName),
    type,
    form: normalizeWhitespace(form),
    ingredients: ingredients || [],
    potencies: unique((potencies || []).map(formatPotency)),
    packSizes: unique(packSizes || []),
    labelDirections: normalizeWhitespace(labelDirections),
    indication: normalizeWhitespace(indication),
    sourceUrl,
    sourceType,
  };
}

async function loadPdfPages(filePath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(filePath));
  const document = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      items: content.items
        .filter((item) => normalizeWhitespace(item.str))
        .map((item) => ({
          text: normalizeWhitespace(item.str),
          x: item.transform[4],
          y: item.transform[5],
        })),
    });
  }

  return pages;
}

function nearestPotency(x, columnStart) {
  const positions = [
    [157, "Q"],
    [186, "3X"],
    [216, "6X"],
    [246, "6CH"],
    [276, "30CH"],
    [306, "200CH"],
    [336, "1M"],
    [366, "10M"],
    [397, "50M"],
    [427, "CM"],
  ];
  const relative = x - columnStart;
  const [distance, potency] = positions
    .map(([position, value]) => [Math.abs(relative - position), value])
    .sort((left, right) => left[0] - right[0])[0];
  return distance <= 14 ? potency : "";
}

export async function parseBaksonPdf(filePath, sourceUrl, aliases = {}) {
  const pages = await loadPdfPages(filePath);
  const products = [];
  const excluded = new Set([
    "MOTHER TINCTURES & DILUTIONS",
    "ITEM NAME",
    "CUSTOMER CARE",
    "THIN LAYER CHROMATOGRAPHY",
  ]);

  for (const page of pages.slice(2)) {
    for (const columnStart of [0, page.width / 2]) {
      const nameX = columnStart + 62;
      const candidates = page.items.filter((item) =>
        Math.abs(item.x - nameX) <= 18
        && item.y > 30
        && item.y < page.height - 35
        && item.text === item.text.toLocaleUpperCase("en-IN")
        && /^[A-Z][A-Z0-9 .,'()/-]{2,}$/.test(item.text)
        && !excluded.has(item.text),
      );

      for (const candidate of candidates) {
        const rawName = candidate.text.replace(/\s+\(EXT\.?\)$/i, "").replace(/\s+EXT\.?$/i, "");
        const canonicalName = canonicalizeName(rawName, aliases);
        if (canonicalName.length < 3 || /^Mother Tinctures/i.test(canonicalName)) continue;

        const potencyMarks = page.items
          .filter((item) => item.text.includes("ü") && Math.abs(item.y - (candidate.y - 6)) <= 9)
          .map((item) => nearestPotency(item.x, columnStart))
          .filter(Boolean);
        const categoryMark = page.items.some((item) =>
          /^[A-J]$/.test(item.text)
          && Math.abs(item.x - (columnStart + 191)) <= 16
          && Math.abs(item.y - candidate.y) <= 8,
        );
        if (categoryMark) potencyMarks.push("Q");

        const commonName = page.items.find((item) =>
          Math.abs(item.x - candidate.x) <= 4
          && item.y < candidate.y
          && candidate.y - item.y >= 7
          && candidate.y - item.y <= 13
          && item.text !== item.text.toLocaleUpperCase("en-IN"),
        )?.text || "";
        const isExternal = /EXT/i.test(candidate.text);
        const form = isExternal
          ? "External preparation"
          : categoryMark && potencyMarks.length > 1
            ? "Mother tincture / dilution"
            : categoryMark
              ? "Mother tincture"
              : "Dilution";

        products.push(productRecord({
          manufacturerId: "bakson",
          canonicalName,
          productName: `Bakson ${titleCaseMedicine(rawName)}`,
          form,
          potencies: potencyMarks,
          packSizes: [],
          ingredients: [{ name: canonicalName, role: "source substance", sourceIdentity: commonName }],
          sourceUrl,
        }));
      }
    }
  }

  return dedupeProducts(products);
}

export function parseHapcoHtml(html, sourceUrl, aliases = {}) {
  const productArea = html.match(/<div class="product-txt">([\s\S]*?)<!--product txt end-->/i)?.[1] || html;
  const blocks = [...productArea.matchAll(/<(?:p|h1)\b[^>]*>([\s\S]*?)<\/(?:p|h1)>/gi)];
  const products = [];

  for (const block of blocks) {
    let text = stripHtml(block[1]).replace(/[]/g, "Q");
    if (!text || text.length > 100 || /^(Homoeopathic Medicines|The potencies|Natural Healing|FAQs)/i.test(text)) continue;
    const trailingNotation = text.match(/\b(?:[1-9]\d{0,3}(?:X|CH|C)?|Q)\s*$/i)?.[0] || "";
    text = text.replace(/\b(?:[1-9]\d{0,3}(?:X|CH|C)?|Q)\s*$/i, "").trim();
    if (!/^[A-Za-z][A-Za-z .,'()-]{2,}$/.test(text)) continue;
    const bareCentesimal = /^(?:3|6|12|30|200|1000)$/.test(trailingNotation) ? `${trailingNotation}CH` : "";
    const potency = /(?:X|CH|C)$/i.test(trailingNotation) || trailingNotation === "Q" ? trailingNotation : bareCentesimal;

    const canonicalName = canonicalizeName(text, aliases);
    products.push(productRecord({
      manufacturerId: "hapco",
      canonicalName,
      productName: `HAPCO ${canonicalName}`,
      form: potency === "Q" ? "Mother tincture" : /x$/i.test(potency) ? "Trituration / dilution" : "Dilution",
      potencies: potency ? [potency === "Q" ? "Q" : potency] : [],
      ingredients: [{ name: canonicalName, role: "source substance" }],
      sourceUrl,
    }));
  }

  return dedupeProducts(products);
}

export function parseMaheshHtml(html, sourceUrl, aliases = {}) {
  const values = [...html.matchAll(/<font\b[^>]*color=["']?#333333["']?[^>]*>([\s\S]*?)<\/font>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter((value) => /^[A-Za-z][A-Za-z .,'()/-]{2,}$/.test(value))
    .filter((value) => !/^(Mother Tinctures?|Dilution|Potentised|Medicine|Packing|Price|External|Category|Name)(?:\s|$)/i.test(value))
    .filter((value) => !/(available in different packing|key to price|rates of homoeopathic|special preparations|price groups)/i.test(value));

  return dedupeProducts(values.map((value) => {
    const canonicalName = canonicalizeName(value, aliases);
    return productRecord({
      manufacturerId: "mahesh",
      canonicalName,
      productName: `Mahesh ${canonicalName}`,
      form: "Mother tincture / dilution",
      potencies: [],
      ingredients: [{ name: canonicalName, role: "source substance" }],
      sourceUrl,
    });
  }));
}

export function parseReckewegHtml(html, sourceUrl) {
  const rowPattern = /<tr\b[\s\S]*?<a class="protitle" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<td[^>]*class="[^"]*disc[^"]*"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
  const products = [];

  for (const match of html.matchAll(rowPattern)) {
    const listedName = stripHtml(match[2]);
    const indication = stripHtml(match[3]);
    if (!listedName) continue;
    const detailUrl = match[1].startsWith("http") ? match[1] : new URL(match[1], sourceUrl).href;
    const productName = listedName
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\b\d+(?:\.\d+)?\s*(?:ml|mL|gm|g|kg)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const identity = canonicalizeName(productName.replace(/^Dr\.?\s*Reckeweg\s*/i, ""));
    const canonicalName = `Dr. Reckeweg ${identity}`;
    products.push(productRecord({
      manufacturerId: "reckeweg",
      canonicalName,
      productName,
      type: "combination",
      form: extractForm(indication) || (/spray/i.test(indication) ? "Spray" : /tonic/i.test(indication) ? "Tonic" : "Drops"),
      potencies: extractPotencies(listedName),
      packSizes: extractPackSizes(listedName),
      ingredients: [],
      indication,
      sourceUrl: detailUrl,
      sourceType: "official product listing",
    }));
  }

  return dedupeProducts(products);
}

export function parseReckewegDetail(html, product) {
  const scripts = [...String(html).matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  let record;
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1].trim());
      if (parsed?.["@type"] === "Product") {
        record = parsed;
        break;
      }
    } catch {
      // Ignore unrelated malformed structured-data blocks.
    }
  }
  if (!record) return product;

  const description = normalizeWhitespace(decodeHtml(record.description || ""));
  const indication = sectionBetween(description, "INDICATIONS", ["MODE OF ACTION OF MAIN INGREDIENTS", "COMPOSITION", "DOSAGE"]);
  const ingredientText = sectionBetween(description, "MODE OF ACTION OF MAIN INGREDIENTS", ["DOSAGE", "REMARKS"])
    || sectionBetween(description, "COMPOSITION", ["DOSAGE", "REMARKS"]);
  const directions = sectionBetween(description, "DOSAGE", ["REMARKS", "NOTE"]);
  const ingredients = [];
  const ingredientPattern = /(?:^|[.:;]\s)([A-Z][A-Za-z][A-Za-z .-]{1,48}?)(?:\s+(LM\/?\d+|\d+(?:\.\d+)?\s*(?:X|CH|C|D|M)))?:/g;
  for (const match of ingredientText.matchAll(ingredientPattern)) {
    const name = normalizeWhitespace(match[1]);
    if (/^(mode|action|main|ingredients?|dosage)$/i.test(name)) continue;
    ingredients.push({ name, potency: match[2] ? formatPotency(match[2]) : "", role: "active ingredient" });
  }
  const packSizes = unique([
    ...product.packSizes,
    ...(record.additionalProperty || [])
      .filter((item) => /net quantity|pack|size/i.test(item.name || ""))
      .map((item) => normalizeWhitespace(item.value)),
  ]);

  return {
    ...product,
    productName: normalizeWhitespace(record.name || product.productName),
    ingredients: ingredients.length ? ingredients : product.ingredients,
    packSizes,
    indication: concise(indication || product.indication, 360),
    labelDirections: concise(directions, 460),
    sourceType: "official product detail page",
  };
}

function sectionBetween(value, heading, nextHeadings) {
  const start = value.toLocaleUpperCase("en-IN").indexOf(heading.toLocaleUpperCase("en-IN"));
  if (start < 0) return "";
  const contentStart = start + heading.length;
  const upper = value.toLocaleUpperCase("en-IN");
  const stops = nextHeadings
    .map((next) => upper.indexOf(next.toLocaleUpperCase("en-IN"), contentStart))
    .filter((position) => position >= 0);
  return normalizeWhitespace(value.slice(contentStart, stops.length ? Math.min(...stops) : undefined));
}

function concise(value, maximum) {
  const text = normalizeWhitespace(value);
  if (text.length <= maximum) return text;
  const clipped = text.slice(0, maximum);
  const sentence = clipped.lastIndexOf(". ");
  return `${clipped.slice(0, sentence > maximum * 0.55 ? sentence + 1 : maximum).trim()}...`;
}

export async function parseSblPdf(filePath, sourceUrl) {
  const pages = await loadPdfPages(filePath);
  const products = [];
  const excluded = /^(DOSAGE|PRESENTATION|COMPOSITION|CONTRA-INDICATION|RECOMMENDED FOR|SYMPTOMS|NEW INTRODUCTIONS|SBL|TABLETS|SYRUP|DROPS|INDICATIONS|DIRECTIONS? FOR USE)$/i;

  for (const page of pages.slice(6)) {
    const lines = groupPdfLines(page.items);
    const texts = lines.map((line) => line.text).filter(Boolean);
    const firstHeading = texts.findIndex((line) => /^(?:Tablets?|(?:Cough |Eye |Paediatric )?Drops?|Syrup|Tonic|Spray|Oil|Ointment|Cream|Lotion|Mouth Wash|Roll-On)(?:\s|$|\()/i.test(line));
    let titleParts = firstHeading > 0 ? texts.slice(0, firstHeading) : texts.slice(0, 3);
    titleParts = titleParts
      .filter((line) => line.length >= 2 && line.length <= 46 && !excluded.test(line))
      .filter((line) => !/^(For |Heartburn|Anaemia|Anxiety|Eye |Blood |Cataract|All type|Cervical |Indigestion)/i.test(line))
      .slice(0, 3);
    if (firstHeading < 0) titleParts = titleParts.filter((line) => line === line.toLocaleUpperCase("en-IN") || /^SBL DROPS/i.test(line));
    const title = normalizeWhitespace(titleParts.join(" "));
    if (!title) continue;

    const form = firstHeading >= 0 ? texts[firstHeading] : extractForm(title) || "Speciality formulation";
    const explicitIndication = textSection(texts, /^(?:INDICATIONS?|RECOMMENDED FOR)\s*:?$/i, /^(?:CONTRA|DOSAGE|DIRECTIONS?|PRESENTATION|COMPOSITION)/i);
    const subtitle = firstHeading >= 0
      ? texts.slice(firstHeading + 1, firstHeading + 4).filter((line) => line.length < 58).join(" ")
      : "";
    const indication = concise(explicitIndication || subtitle, 360);
    const compositionText = textSection(texts, /^COMPOSITION\s*:?$/i, /^(?:An In-house|If you wish|Customer Relation|CONTRA|DOSAGE|PRESENTATION)/i);
    const ingredients = parseComposition(compositionText);
    const directions = textSection(texts, /^(?:DOSAGE|DIRECTIONS? FOR USE)\s*:?$/i, /^(?:CONTRA|PRESENTATION|COMPOSITION|REMARKS)/i);
    const presentation = textSection(texts, /^PRESENTATION\s*:?$/i, /^(?:COMPOSITION|CONTRA|DOSAGE)/i);

    products.push(productRecord({
      manufacturerId: "sbl",
      canonicalName: `SBL ${titleCaseMedicine(title)}`,
      productName: titleCaseMedicine(title),
      type: "combination",
      form,
      ingredients,
      indication,
      labelDirections: concise(directions, 460),
      packSizes: extractPackSizes(presentation),
      sourceUrl,
      sourceType: `official product booklet, page ${page.pageNumber}`,
    }));
  }

  return dedupeProducts(products);
}

function textSection(lines, startPattern, stopPattern) {
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) return "";
  const collected = [];
  for (const line of lines.slice(start + 1)) {
    if (stopPattern.test(line)) break;
    if (/^\d{1,2}$/.test(line)) continue;
    collected.push(line);
  }
  return normalizeWhitespace(collected.join(" "));
}

function parseComposition(value) {
  const ingredients = [];
  const pattern = /([A-Z][A-Za-z][A-Za-z .()'-]{1,44}?)\s+(Q|\d+(?:\.\d+)?\s*(?:X|CH|C|D|M))(?=\s+[A-Z]|$)/gi;
  for (const match of String(value).matchAll(pattern)) {
    ingredients.push({
      name: titleCaseMedicine(match[1]),
      potency: formatPotency(match[2]),
      role: "active ingredient",
    });
  }
  return ingredients;
}

function groupPdfLines(items) {
  const rows = [];
  for (const item of [...items].sort((left, right) => right.y - left.y || left.x - right.x)) {
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  return rows
    .sort((left, right) => right.y - left.y)
    .map((row) => ({
      y: row.y,
      text: normalizeWhitespace(row.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(" ")),
    }));
}

function dedupeProducts(products) {
  const map = new Map();
  for (const product of products) {
    const key = `${product.manufacturerId}|${normalizeKey(product.canonicalName)}|${normalizeKey(product.productName)}|${normalizeKey(product.form)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, product);
      continue;
    }
    existing.potencies = unique([...existing.potencies, ...product.potencies]);
    existing.packSizes = unique([...existing.packSizes, ...product.packSizes]);
    existing.ingredients = existing.ingredients.length ? existing.ingredients : product.ingredients;
  }
  return [...map.values()];
}

export { decodeHtml, stripHtml, productRecord };
