import { createHash } from "node:crypto";

const POTENCY_TOKEN = /\b(?:\d+(?:\.\d+)?\s*(?:CH|C|X|D|M)|LM\s*\/?\s*\d+|0\s*\/\s*\d+|CM|Q|MT)\b/gi;
const PACK_TOKEN = /\b\d+(?:\.\d+)?\s*(?:ml|mL|gm|g|kg|tablets?|pills?|globules?|drops?)\b/gi;
const FORM_TOKEN = /\b(?:dilution|mother tincture|triturations?|tablets?|drops?|liquid|syrup|tonic|ointment|cream|gel|spray|globules?|pills?|powder|oil)\b/gi;

export function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeKey(value) {
  return normalizeWhitespace(value)
    .toLocaleLowerCase("en-IN")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function titleCaseMedicine(value) {
  const smallWords = new Set(["and", "of", "with", "for"]);
  return normalizeWhitespace(value)
    .toLocaleLowerCase("en-IN")
    .split(" ")
    .map((word, index) => {
      if (index > 0 && smallWords.has(word)) return word;
      if (/^r\d+/i.test(word)) return word.toUpperCase();
      return word ? `${word[0].toUpperCase()}${word.slice(1)}` : word;
    })
    .join(" ")
    .replace(/\bLm\b/g, "LM")
    .replace(/\bCh\b/g, "CH");
}

export function slugify(value) {
  return normalizeKey(value).replace(/\s+/g, "-") || "medicine";
}

export function extractPotencies(value) {
  const values = String(value ?? "").match(POTENCY_TOKEN) || [];
  return unique(values.map(formatPotency));
}

export function extractPackSizes(value) {
  return unique((String(value ?? "").match(PACK_TOKEN) || []).map(normalizeWhitespace));
}

export function extractForm(value) {
  const match = String(value ?? "").match(FORM_TOKEN);
  return match ? titleCaseMedicine(match[0]) : "";
}

export function formatPotency(value) {
  return normalizeWhitespace(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^LM\/(\d+)$/, "LM$1")
    .replace(/^(\d+)C$/, "$1CH")
    .replace(/^0\/(\d+)$/, "LM$1");
}

export function canonicalizeName(rawName, aliases = {}) {
  let name = normalizeWhitespace(rawName)
    .replace(/\((?:EXT\.?|EXTERNAL)\)/gi, "")
    .replace(/\bEXT\.?$/gi, "")
    .replace(PACK_TOKEN, "")
    .replace(POTENCY_TOKEN, "")
    .replace(FORM_TOKEN, "")
    .replace(/\b(?:Bakson|SBL|HAPCO|Mahesh|Schwabe|Reckeweg)\b/gi, "")
    .replace(/[®™]/g, "")
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  const alias = aliases[normalizeKey(name)];
  if (alias) return alias;

  name = name
    .replace(/^Acid\s+/i, "Acidum ")
    .replace(/^Acidum\s+/i, "Acidum ")
    .replace(/\bOfficinalis\.$/i, "Officinalis")
    .replace(/\bMontana\s+Radix$/i, "Montana Radix");

  return titleCaseMedicine(name);
}

export function stableId(...parts) {
  return createHash("sha256").update(parts.map(normalizeKey).join("|")).digest("hex").slice(0, 16);
}

export function compositionFingerprint(ingredients = []) {
  return ingredients
    .map((ingredient) => [
      normalizeKey(ingredient.name),
      normalizeKey(ingredient.potency),
      normalizeKey(ingredient.proportion),
    ].join(":"))
    .filter((value) => value.replaceAll(":", ""))
    .sort()
    .join("|");
}

export function remedyGroupKey(product) {
  const type = product.type === "combination" || product.type === "range" ? product.type : "single";
  const identity = normalizeKey(product.canonicalName);
  const composition = type === "combination" ? compositionFingerprint(product.ingredients) : "";
  return [type, identity, composition].filter(Boolean).join("|");
}

export function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

export function uniqueBy(values, keyFn) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sortPotencies(values) {
  const scaleRank = { Q: 0, MT: 0, X: 1, D: 1, CH: 2, C: 2, M: 3, LM: 4, CM: 5 };
  return unique(values).sort((left, right) => {
    const parse = (value) => {
      if (value === "Q" || value === "MT" || value === "CM") return [scaleRank[value], 0];
      const match = value.match(/^(LM)?(\d+(?:\.\d+)?)(CH|C|X|D|M)?$/i);
      if (!match) return [99, value];
      const scale = (match[1] || match[3] || "").toUpperCase();
      return [scaleRank[scale] ?? 98, Number(match[2])];
    };
    const [leftScale, leftNumber] = parse(left);
    const [rightScale, rightNumber] = parse(right);
    return leftScale - rightScale || leftNumber - rightNumber || left.localeCompare(right);
  });
}

export function daysSince(dateString, now = new Date()) {
  const timestamp = Date.parse(dateString);
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - timestamp) / 86_400_000);
}
