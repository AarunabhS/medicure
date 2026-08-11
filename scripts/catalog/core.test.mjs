import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeName,
  extractPotencies,
  remedyGroupKey,
  sortPotencies,
} from "./core.mjs";
import { parseHapcoHtml, parseMaheshHtml, parseReckewegDetail, parseReckewegHtml } from "./parsers.mjs";
import aliases from "./aliases.json" with { type: "json" };

test("potencies and dosage forms do not create separate medicine identities", () => {
  assert.equal(canonicalizeName("Nux Vomica 6C Dilution 30 ml", aliases), "Nux Vomica");
  assert.equal(canonicalizeName("Nux Vomica 200CH Liquid", aliases), "Nux Vomica");
  assert.equal(canonicalizeName("Nux Vom 1M", aliases), "Nux Vomica");
});

test("common Indian catalog aliases resolve to canonical names", () => {
  assert.equal(canonicalizeName("Calc Fluor 6X Tablets", aliases), "Calcarea Fluorica");
  assert.equal(canonicalizeName("Ars Alb 30C", aliases), "Arsenicum Album");
  assert.equal(canonicalizeName("China Officinalis Q", aliases), "Cinchona Officinalis");
});

test("potency notation covers mother tincture, decimal, centesimal and LM scales", () => {
  assert.deepEqual(extractPotencies("Q 3X 6C 30CH 200C 1M LM/3 0/4"), ["Q", "3X", "6CH", "30CH", "200CH", "1M", "LM3", "LM4"]);
  assert.deepEqual(sortPotencies(["1M", "30CH", "Q", "LM2", "6X", "200CH"]), ["Q", "6X", "30CH", "200CH", "1M", "LM2"]);
});

test("combination identity includes its structured composition", () => {
  const first = remedyGroupKey({ type: "combination", canonicalName: "Test Drops", ingredients: [{ name: "Aconitum", potency: "3X" }] });
  const second = remedyGroupKey({ type: "combination", canonicalName: "Test Drops", ingredients: [{ name: "Aconitum", potency: "6X" }] });
  assert.notEqual(first, second);
});

test("HAPCO pages normalize potency variants into product facts", () => {
  const html = '<div class="product-txt"><p>Aconitum Napellus 30</p><p>Nux Vomica Q</p><!--product txt end-->';
  const products = parseHapcoHtml(html, "https://www.hapco.co.in/a.html", aliases);
  assert.equal(products.length, 2);
  assert.equal(products[1].canonicalName, "Nux Vomica");
  assert.deepEqual(products[0].potencies, ["30CH"]);
  assert.deepEqual(products[1].potencies, ["Q"]);
});

test("Mahesh and Reckeweg adapters retain official source attribution", () => {
  const mahesh = parseMaheshHtml('<font color="#333333">ARNICA MONTANA</font>', "https://www.maheshlab.com/catalogue.html", aliases);
  assert.equal(mahesh[0].canonicalName, "Arnica Montana");
  assert.match(mahesh[0].sourceUrl, /^https:/);

  const reckeweg = parseReckewegHtml('<tr><td><a class="protitle" href="r1.html">R1 (Drops)</a></td><td class="disc">For inflammatory discomfort</td></tr>', "https://www.reckeweg-india.com/list.html");
  assert.equal(reckeweg.length, 1);
  assert.equal(reckeweg[0].type, "combination");
  assert.match(reckeweg[0].sourceUrl, /r1\.html$/);
});

test("Reckeweg detail pages attach ingredients, pack and labelled directions", () => {
  const [product] = parseReckewegHtml('<tr><td><a class="protitle" href="r1.html">R1 (Drops)</a></td><td class="disc">Inflammation drops</td></tr>', "https://www.reckeweg-india.com/list.html");
  const structured = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Dr. Reckeweg R1",
    description: "INDICATIONS Local inflammatory complaints. MODE OF ACTION OF MAIN INGREDIENTS: Apis mellifica: Manufacturer description. Belladonna: Manufacturer description. DOSAGE 10 drops twice daily. REMARKS Practitioner use only.",
    additionalProperty: [{ "@type": "PropertyValue", name: "Net Quantity", value: "22 ml" }],
  });
  const enriched = parseReckewegDetail(`<script type="application/ld+json">${structured}</script>`, product);
  assert.deepEqual(enriched.ingredients.map((item) => item.name), ["Apis mellifica", "Belladonna"]);
  assert.deepEqual(enriched.packSizes, ["22 ml"]);
  assert.equal(enriched.labelDirections, "10 drops twice daily.");
});
