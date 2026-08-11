import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalizeName,
  compositionFingerprint,
  daysSince,
  normalizeKey,
  remedyGroupKey,
  slugify,
  sortPotencies,
  stableId,
  unique,
  uniqueBy,
} from "./catalog/core.mjs";
import { ALL_SOURCES, HPI_SOURCE, MANUFACTURERS, RETAILERS } from "./catalog/sources.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const catalogDir = join(root, "assets", "data", "medicines");
const pagesDir = join(root, "medicines");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const aliases = await readJson(join(root, "scripts", "catalog", "aliases.json"));
const editorial = await readJson(join(root, "scripts", "catalog", "editorial-remedies.json"));
const manualProducts = await readJson(join(root, "scripts", "catalog", "manual-products.json"));
const manualSblProducts = await readJson(join(root, "scripts", "catalog", "manual-sbl-products.json"));
const verifiedRetailers = await readJson(join(root, "scripts", "catalog", "verified-retailers.json"));
const seed = await readJson(join(root, "scripts", "catalog", "seed-products.json"));
const generatedAt = new Date().toISOString();
const generatedDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(generatedAt));

await mkdir(catalogDir, { recursive: true });
await mkdir(pagesDir, { recursive: true });
await clearGeneratedFiles(catalogDir, ".json");
await clearGeneratedFiles(pagesDir, ".html");

const manufacturerMap = new Map(MANUFACTURERS.map((manufacturer) => [manufacturer.id, manufacturer]));
const retailerMap = new Map(RETAILERS.map((retailer) => [retailer.id, retailer]));
const editorialMap = new Map();

for (const item of editorial) {
  const canonicalName = canonicalizeName(item.name, aliases);
  editorialMap.set(normalizeKey(canonicalName), { ...item, canonicalName });
}

const normalizedProducts = [...seed.products, ...manualProducts, ...manualSblProducts].map((product) => ({
  ...product,
  id: product.id || stableId(product.manufacturerId, product.productName, product.form),
  type: product.type || "single",
  canonicalName: product.type === "combination" || product.type === "range"
    ? product.canonicalName
    : canonicalizeName(product.canonicalName || product.productName, aliases),
  potencies: sortPotencies(product.potencies || []),
  packSizes: unique(product.packSizes || []),
  ingredients: product.ingredients || [],
}));

const grouped = new Map();
for (const product of normalizedProducts) {
  if (!product.canonicalName || product.canonicalName.length < 3) continue;
  const key = remedyGroupKey(product);
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(product);
}

for (const item of editorialMap.values()) {
  const key = `single|${normalizeKey(item.canonicalName)}`;
  if (!grouped.has(key)) grouped.set(key, []);
}

const remedies = [];
for (const [groupKey, products] of grouped) {
  const [type] = groupKey.split("|");
  const canonicalName = products[0]?.canonicalName || editorialMap.get(groupKey.replace(/^single\|/, ""))?.canonicalName;
  const editorialItem = editorialMap.get(normalizeKey(canonicalName));
  const composition = compositionFingerprint(products.flatMap((product) => product.ingredients || []));
  const slug = type === "combination" && composition
    ? `${slugify(canonicalName)}-${stableId(composition).slice(0, 8)}`
    : slugify(canonicalName);
  const productVariants = uniqueBy(products, (product) => product.id || stableId(product.manufacturerId, product.productName, product.form));
  const manufacturers = unique(productVariants.map((product) => product.manufacturerId))
    .map((id) => manufacturerMap.get(id))
    .filter(Boolean)
    .map(({ id, name, shortName, url }) => ({ id, name, shortName, url }));
  const availablePotencies = sortPotencies(productVariants.flatMap((product) => product.potencies || []));
  const forms = unique(productVariants.map((product) => product.form).filter(Boolean));
  const productIngredients = uniqueBy(
    productVariants.flatMap((product) => product.ingredients || []),
    (ingredient) => `${normalizeKey(ingredient.name)}|${normalizeKey(ingredient.potency)}|${normalizeKey(ingredient.proportion)}`,
  );
  const ingredients = type === "single"
    ? productIngredients.length ? productIngredients : [{ name: canonicalName, role: "source substance" }]
    : productIngredients;
  const indications = productVariants
    .filter((product) => product.indication)
    .map((product) => ({
      summary: product.indication,
      attribution: manufacturerMap.get(product.manufacturerId)?.shortName || product.manufacturerId,
      productId: product.id,
      sourceUrl: product.sourceUrl,
    }));
  const aliasesForMedicine = unique([
    ...(editorialItem?.bangla ? [editorialItem.bangla] : []),
    ...Object.entries(aliases)
      .filter(([, target]) => normalizeKey(target) === normalizeKey(canonicalName))
      .map(([alias]) => alias),
  ]);
  const sellerListings = verifiedRetailers
    .filter((listing) => normalizeKey(canonicalizeName(listing.canonicalName, aliases)) === normalizeKey(canonicalName))
    .map((listing) => ({
      ...listing,
      seller: retailerMap.get(listing.sellerId)?.name || listing.sellerId,
      stale: daysSince(listing.listingLastVerifiedAt, new Date(generatedAt)) > 30,
    }));
  const sources = uniqueBy([
    ...(type === "single" ? [HPI_SOURCE] : []),
    ...productVariants.map((product) => ({
      id: `product-${product.id}`,
      name: `${manufacturerMap.get(product.manufacturerId)?.shortName || product.manufacturerId} product source`,
      publisher: manufacturerMap.get(product.manufacturerId)?.name || product.manufacturerId,
      url: product.sourceUrl,
      role: product.sourceType || "Official product catalog",
    })),
  ], (source) => source.url);
  const sourceIdentity = ingredients.find((ingredient) => ingredient.sourceIdentity)?.sourceIdentity || "";

  remedies.push({
    schemaVersion: 1,
    id: stableId(type, canonicalName, type === "combination" ? composition : ""),
    slug,
    type,
    canonicalName,
    banglaName: editorialItem?.bangla || "",
    synonyms: aliasesForMedicine.filter((alias) => normalizeKey(alias) !== normalizeKey(canonicalName)),
    scientificIdentity: sourceIdentity,
    sourceMaterial: sourceIdentity || (type === "single" ? canonicalName : "See the manufacturer composition for this formulation."),
    hpiReferences: type === "single" ? [{
      title: "PCIM&H Homoeopathic Pharmacopoeia of India monograph index",
      url: HPI_SOURCE.url,
      verificationStatus: "index-linked",
    }] : [],
    ingredients,
    traditionalContext: editorialItem ? {
      summary: editorialItem.summary,
      bangla: editorialItem.banglaText,
      sourceBasis: editorialItem.source,
    } : null,
    manufacturerIndications: uniqueBy(indications, (item) => `${normalizeKey(item.summary)}|${item.attribution}`),
    safetyNotes: [
      "This profile is educational product information, not a diagnosis or prescription.",
      "Medicine selection, potency, repetition and dose should be confirmed by a qualified practitioner.",
      "Do not delay urgent or evidence-based medical care.",
    ],
    availablePotencies,
    forms,
    manufacturers,
    products: productVariants,
    sellerListings,
    retailerSearches: RETAILERS.map((retailer) => ({
      id: retailer.id,
      seller: retailer.name,
      url: retailer.searchUrl.replace("{query}", encodeURIComponent(canonicalName)),
      verifiedListing: false,
    })),
    sources,
    category: editorialItem?.category || (type === "combination" ? "formulation" : "single-remedy"),
    tags: unique([...(editorialItem?.tags || []), ...(editorialItem?.patterns || [])]),
    dataQuality: {
      identity: type === "single" ? "pharmacopoeia-index-linked" : "manufacturer-defined",
      composition: ingredients.length ? "structured" : "source-link-only",
      indications: indications.length ? "manufacturer-attributed" : editorialItem ? "traditional-context-only" : "not-published",
      dosage: productVariants.some((product) => product.labelDirections) ? "manufacturer-labelled" : "not-published",
    },
    generatedAt,
  });
}

remedies.sort((left, right) => left.canonicalName.localeCompare(right.canonicalName, "en-IN"));

const index = {
  meta: {
    schemaVersion: 1,
    title: "Medicure Indian Homoeopathic Medicine Encyclopedia",
    generatedAt,
    catalogScope: "Indian manufacturer product ranges and PCIM&H-linked medicine identities",
    remedies: remedies.length,
    products: remedies.reduce((total, remedy) => total + remedy.products.length, 0),
    manufacturers: MANUFACTURERS.length,
    sources: ALL_SOURCES,
    disclaimer: "Product facts and attributed manufacturer statements only. This catalog is not Medicure inventory, a prescription, or proof of effectiveness.",
  },
  remedies: remedies.map((remedy) => ({
    id: remedy.id,
    slug: remedy.slug,
    type: remedy.type,
    canonicalName: remedy.canonicalName,
    banglaName: remedy.banglaName,
    synonyms: remedy.synonyms,
    scientificIdentity: remedy.scientificIdentity,
    sourceMaterial: remedy.sourceMaterial,
    category: remedy.category,
    tags: remedy.tags,
    availablePotencies: remedy.availablePotencies,
    forms: remedy.forms,
    manufacturers: remedy.manufacturers.map((manufacturer) => ({ id: manufacturer.id, shortName: manufacturer.shortName })),
    productCount: remedy.products.length,
    indication: remedy.manufacturerIndications[0]?.summary || remedy.traditionalContext?.summary || "",
    indicationType: remedy.manufacturerIndications.length ? "manufacturer" : remedy.traditionalContext ? "traditional" : "none",
    searchText: normalizeKey([
      remedy.canonicalName,
      remedy.banglaName,
      ...remedy.synonyms,
      remedy.scientificIdentity,
      ...remedy.tags,
      ...remedy.availablePotencies,
      ...remedy.forms,
      ...remedy.manufacturers.map((manufacturer) => manufacturer.shortName),
    ].join(" ")),
  })),
};

for (const remedy of remedies) {
  await writeFile(join(catalogDir, `${remedy.slug}.json`), `${JSON.stringify(remedy, null, 2)}\n`);
  await writeFile(join(pagesDir, `${remedy.slug}.html`), renderProfilePage(remedy));
}

await writeFile(join(root, "assets", "data", "medicine-index.json"), `${JSON.stringify(index, null, 2)}\n`);
await writeFile(join(root, "sitemap.xml"), renderSitemap(remedies));

console.log(`Built ${remedies.length} canonical medicine profiles from ${index.meta.products} product records.`);

async function clearGeneratedFiles(directory, extension) {
  try {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(directory);
    await Promise.all(files.filter((file) => file.endsWith(extension)).map((file) => rm(join(directory, file))));
  } catch {
    // Directory may not exist on the first build.
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderProfilePage(remedy) {
  const description = remedy.manufacturerIndications[0]?.summary
    || remedy.traditionalContext?.summary
    || `Indian manufacturer, ingredient and potency information for ${remedy.canonicalName}.`;
  const manufacturers = remedy.manufacturers.map((manufacturer) => manufacturer.shortName).join(", ") || "Source catalog pending";
  const potencyText = remedy.availablePotencies.join(", ") || "See individual manufacturer records";
  const ingredientRows = remedy.ingredients.length
    ? remedy.ingredients.map((ingredient) => `<li><strong>${escapeHtml(ingredient.name)}</strong>${ingredient.potency ? ` <span>${escapeHtml(ingredient.potency)}</span>` : ""}${ingredient.sourceIdentity ? `<small>${escapeHtml(ingredient.sourceIdentity)}</small>` : ""}</li>`).join("")
    : `<li class="empty-note">Composition has not yet been normalized from the official manufacturer source.</li>`;
  const indicationRows = remedy.manufacturerIndications.length
    ? remedy.manufacturerIndications.map((item) => `<article class="claim-row"><p>${escapeHtml(item.summary)}</p><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Stated by ${escapeHtml(item.attribution)} <i data-lucide="external-link"></i></a></article>`).join("")
    : `<p class="empty-note">No manufacturer indication has been published in the normalized record. Traditional context is kept separate below.</p>`;
  const productRows = remedy.products.length
    ? remedy.products.map((product) => {
      const maker = remedy.manufacturers.find((manufacturer) => manufacturer.id === product.manufacturerId)?.shortName || product.manufacturerId;
      const directionRow = product.labelDirections
        ? `\n        <div class="label-direction"><strong>Manufacturer-labelled directions</strong><p>${escapeHtml(product.labelDirections)}</p></div>`
        : "";
      return `<article class="brand-row">
        <div><span class="maker">${escapeHtml(maker)}</span><h3>${escapeHtml(product.productName)}</h3><p>${escapeHtml(product.form || "Form not specified")}</p></div>
        <div class="brand-facts"><p><strong>Potencies</strong>${escapeHtml(product.potencies.join(", ") || "See source")}</p><p><strong>Pack sizes</strong>${escapeHtml(product.packSizes.join(", ") || "See source")}</p></div>${directionRow}
        <a class="source-link" href="${escapeHtml(product.sourceUrl)}" target="_blank" rel="noreferrer">Official source <i data-lucide="external-link"></i></a>
      </article>`;
    }).join("")
    : `<p class="empty-note">No normalized Indian manufacturer variant is currently attached.</p>`;
  const sellerRows = remedy.sellerListings.length
    ? remedy.sellerListings.map((listing) => `<a class="seller-row" href="${escapeHtml(listing.url)}" target="_blank" rel="noreferrer"><span><strong>${escapeHtml(listing.seller)}</strong><small>${escapeHtml(listing.product)}</small></span><span class="verification ${listing.stale ? "stale" : ""}">${listing.stale ? "Review overdue" : `Verified ${escapeHtml(listing.listingLastVerifiedAt)}`}</span><i data-lucide="external-link"></i></a>`).join("")
    : `<p class="empty-note">No retailer product listing has been manually verified for this medicine yet.</p>`;
  const sourceRows = remedy.sources.map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(source.name)}</strong><span>${escapeHtml(source.publisher || source.role || "")}</span><i data-lucide="external-link"></i></a></li>`).join("");

  return `<!doctype html>
<html lang="en-IN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(remedy.canonicalName)}: Ingredients, Potencies & Indian Brands | Medicure</title>
  <link rel="canonical" href="https://medicur.in/medicines/${remedy.slug}.html">
  <link rel="icon" type="image/svg+xml" href="../assets/images/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Bengali:wght@400;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/css/medicines.css?v=20260812">
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    name: `${remedy.canonicalName} medicine profile`,
    url: `https://medicur.in/medicines/${remedy.slug}.html`,
    description,
    about: { "@type": "Drug", name: remedy.canonicalName },
    lastReviewed: generatedDate,
    publisher: { "@type": "Pharmacy", name: "Medicure Homeopathy", url: "https://medicur.in/" },
  })}</script>
</head>
<body class="profile-page">
  <a class="skip-link" href="#profile-content">Skip to medicine information</a>
  <header class="catalog-header"><div class="header-main shell"><a class="brand" href="../index.html" aria-label="Medicure Homeopathy home"><span class="brand-mark"><i data-lucide="cross"></i></span><span>Medicure <small>Homeopathy</small></span></a><nav class="catalog-nav"><a href="../medicines.html">Medicine encyclopedia</a><a href="../index.html#doctor">Meet Dr. Som</a><a href="../index.html#visit">Visit Medicure</a></nav><a class="button button-primary header-whatsapp" href="https://wa.me/918647837624?text=${encodeURIComponent(`Hello Medicure, please help me check ${remedy.canonicalName}, including the correct brand and potency.`)}" target="_blank" rel="noreferrer"><i data-lucide="message-circle"></i><span>Check with Medicure</span></a></div></header>
  <main id="profile-content">
    <nav class="breadcrumbs shell" aria-label="Breadcrumb"><a href="../index.html">Medicure</a><i data-lucide="chevron-right"></i><a href="../medicines.html">Encyclopedia</a><i data-lucide="chevron-right"></i><span>${escapeHtml(remedy.canonicalName)}</span></nav>
    <section class="profile-hero"><div class="shell profile-hero-grid"><div><p class="eyebrow">Indian medicine profile</p><h1>${escapeHtml(remedy.canonicalName)}</h1>${remedy.banglaName ? `<p class="bangla-name">${escapeHtml(remedy.banglaName)}</p>` : ""}<p class="profile-intro">${escapeHtml(description)}</p><div class="profile-tags"><span>${remedy.type === "single" ? "Single remedy" : "Manufacturer formulation"}</span><span>${remedy.products.length} product record${remedy.products.length === 1 ? "" : "s"}</span><span>${remedy.manufacturers.length} Indian brand${remedy.manufacturers.length === 1 ? "" : "s"}</span></div></div><aside class="profile-quick-facts"><p><span>Source material</span><strong>${escapeHtml(remedy.sourceMaterial)}</strong></p><p><span>Available potencies</span><strong>${escapeHtml(potencyText)}</strong></p><p><span>Catalogued manufacturers</span><strong>${escapeHtml(manufacturers)}</strong></p></aside></div></section>
    <div class="safety-banner"><div class="shell"><i data-lucide="shield-alert"></i><p><strong>Educational information, not a prescription.</strong> Medicine selection, potency, repetition and dose require qualified clinical advice. Do not delay urgent or evidence-based care.</p></div></div>
    <div class="shell profile-layout">
      <aside class="profile-nav"><strong>On this page</strong><a href="#overview">Overview</a><a href="#ingredients">Ingredients</a><a href="#uses">Uses & safety</a><a href="#potencies">Potencies & brands</a><a href="#sellers">Sellers</a><a href="#sources">Sources</a></aside>
      <div class="profile-sections">
        <section id="overview"><p class="section-kicker">Overview</p><h2>One medicine, all verified variants.</h2><p>This canonical profile groups manufacturer products and potencies without treating each potency as a different medicine.</p>${remedy.traditionalContext ? `<div class="traditional-context"><strong>Traditional educational context</strong><p>${escapeHtml(remedy.traditionalContext.summary)}</p>${remedy.traditionalContext.bangla ? `<p lang="bn">${escapeHtml(remedy.traditionalContext.bangla)}</p>` : ""}<small>Source basis: ${escapeHtml(remedy.traditionalContext.sourceBasis)}. This is separate from manufacturer indications.</small></div>` : ""}</section>
        <section id="ingredients"><p class="section-kicker">Ingredients</p><h2>What the source identifies.</h2><ul class="ingredient-list">${ingredientRows}</ul></section>
        <section id="uses"><p class="section-kicker">Uses & safety</p><h2>Manufacturer-stated indications.</h2>${indicationRows}<div class="red-note"><strong>Not a cure claim</strong><p>These statements reproduce or summarize what the named manufacturer publishes. They are not independent evidence of effectiveness and are not Medicure's diagnosis or treatment advice.</p></div></section>
        <section id="potencies"><p class="section-kicker">Potencies & brands</p><h2>Indian product records.</h2><div class="brand-list">${productRows}</div></section>
        <section id="sellers"><p class="section-kicker">Sellers</p><h2>Manually verified Indian listings.</h2><p class="section-intro">Links confirm that a listing existed on the stated date. They do not claim current price, stock, authenticity, or Medicure availability.</p><div class="seller-list">${sellerRows}</div><details class="retailer-searches"><summary>Search other selected Indian retailers</summary>${remedy.retailerSearches.map((retailer) => `<a href="${escapeHtml(retailer.url)}" target="_blank" rel="noreferrer">Search ${escapeHtml(retailer.seller)} <i data-lucide="search"></i></a>`).join("")}</details></section>
        <section id="sources"><p class="section-kicker">Sources</p><h2>Trace every published fact.</h2><ul class="source-list">${sourceRows}</ul></section>
      </div>
    </div>
  </main>
  <footer class="catalog-footer"><div class="shell footer-bottom"><p>&copy; ${new Date().getFullYear()} Medicure Homeopathy.</p><p>45, Maniktala Main Road, Kolkata 700054</p></div></footer>
  <script src="https://unpkg.com/lucide@0.468.0/dist/umd/lucide.min.js"></script><script>window.lucide?.createIcons();</script>
</body>
</html>`;
}

function renderSitemap(items) {
  const urls = [
    ["https://medicur.in/", "1.0"],
    ["https://medicur.in/medicines.html", "0.9"],
    ...items.map((item) => [`https://medicur.in/medicines/${item.slug}.html`, item.manufacturerIndications.length || item.traditionalContext ? "0.8" : "0.6"]),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([url, priority]) => `  <url><loc>${url}</loc><lastmod>${generatedDate}</lastmod><changefreq>weekly</changefreq><priority>${priority}</priority></url>`).join("\n")}\n</urlset>\n`;
}
