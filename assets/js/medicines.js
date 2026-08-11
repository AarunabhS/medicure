(() => {
  "use strict";

  const CATALOG_URL = "assets/data/medicine-index.json";
  const PAGE_SIZE = 24;
  const state = {
    catalog: null,
    remedies: [],
    filtered: [],
    query: "",
    manufacturer: "",
    type: "",
    form: "",
    potency: "",
    withIndications: false,
    multiBrand: false,
    sort: "relevance",
    page: 1,
    language: localStorage.getItem("medicure-catalog-language") === "bn" ? "bn" : "en",
  };

  const copy = {
    en: {
      navEncyclopedia: "Medicine encyclopedia", navDoctor: "Meet Dr. Som", navVisit: "Visit Medicure", askMedicure: "Ask Medicure",
      eyebrow: "Medicure knowledge desk", title: "Indian Homoeopathic Medicine Encyclopedia", heroCopy: "Canonical remedies, ingredients, potency ranges and product records from leading Indian manufacturers.",
      searchLabel: "Search medicine encyclopedia", searchPlaceholder: "Search Nux Vomica, acidity, 30CH, SBL or নাক্স ভমিকা", searchButton: "Search medicines", popular: "Popular:", motherTincture: "Mother tincture",
      indiaFocused: "India-focused", hpiLinked: "PCIM&H HPI linked", indianManufacturers: "Indian manufacturers", canonicalMedicines: "canonical medicine profiles", productVariants: "nested product records", sourcesMethod: "Sources & method",
      safetyTitle: "Educational product information, not a prescription.", safetyText: "Medicine selection, potency, repetition and dosage require qualified clinical advice. Manufacturer indications are not proven cure claims.",
      filters: "Filters", refine: "Refine", filterTitle: "Medicine filters", manufacturer: "Manufacturer", allManufacturers: "All manufacturers", medicineType: "Medicine type", allTypes: "All types", singleRemedy: "Single remedy", formulation: "Proprietary formulation", manufacturerRange: "Manufacturer range", form: "Form", allForms: "All forms", potency: "Potency", allPotencies: "All potencies", quickFilters: "Quick filters", withIndications: "Manufacturer indication available", multiBrand: "Multiple Indian brands", clearFilters: "Clear filters", stockNote: "Catalog presence does not mean Medicure stock availability. Ask the store to confirm a product.",
      results: "medicines", allCatalogContext: "Across reviewed Indian manufacturer catalogs", sortBy: "Sort by", relevance: "Relevance", nameAZ: "Name A-Z", mostBrands: "Most brands", mostPotencies: "Most potencies", loading: "Loading the Indian medicine catalog...", noResults: "No canonical medicine matches these filters.", noResultsText: "Try a synonym, shorter medicine name, different potency, or clear the selected filters.",
      sourceStandard: "Source standard", traceableTitle: "Every published fact should be traceable.", traceableText: "Medicine identities link to the Homoeopathic Pharmacopoeia of India index. Product compositions, potencies, packs, indications and directions remain attached to their official manufacturer source. Retailer links carry a manual verification date and never imply live price or stock.", reviewMethod: "Review catalog method",
      footerCopy: "Homeopathic medicine store and consultation clinic in Maniktala, Kolkata.", visit: "Visit", catalog: "Catalog", allMedicines: "All medicines", footerDisclaimer: "This encyclopedia is educational and does not diagnose, prescribe or replace medical care.",
      catalogGovernance: "Catalog governance", methodTitle: "Indian source and publication method", identityHeading: "Medicine identity", identityBody: "One canonical profile groups potency, form and pack variants for the same medicine. Synonyms and spelling variants resolve through a reviewed alias table. Differently composed proprietary formulations remain separate.", manufacturerHeading: "Manufacturer facts", manufacturerBody: "Structured facts come from official SBL, Schwabe India, Dr. Reckeweg India, Bakson, HAPCO, Mahesh Laboratories and M. Bhattacharyya / King & Co. sources. Automated collection respects robots policies; blocked catalogs require reviewed snapshots.", claimHeading: "Indications and directions", claimBody: "Indications are explicitly labelled as manufacturer-stated. Directions appear only inside the relevant manufacturer product and are never merged into a universal dose.", sellerHeading: "Seller links", sellerBody: "Tata 1mg, Netmeds, Healthmug and Homeomart links are for product discovery. Verified listings show the date checked; records older than 30 days are marked for review. Prices and live stock are excluded.",
      profile: "Open medicine profile", aliases: "Also known as", sourceMaterial: "Source identity", commonForms: "Common forms", availablePotencies: "Available potencies", brands: "Indian brands", manufacturerIndication: "Manufacturer-stated indication", traditionalContext: "Traditional educational context", noClaim: "No indication summary published", products: "product records", previous: "Previous", next: "Next", page: "Page", of: "of", searchMatches: (query) => `Matches for “${query}”`, filteredContext: "Filtered Indian catalog results", typeSingle: "Single remedy", typeCombination: "Formulation", typeRange: "Manufacturer range", more: (count) => `+${count} more`, clear: "Clear", queryFilter: "Search",
      loadError: "The medicine catalog could not be loaded.", loadErrorText: "Please refresh the page or ask Medicure for help by WhatsApp.",
    },
    bn: {
      navEncyclopedia: "ওষুধ বিশ্বকোষ", navDoctor: "ডাঃ সোম", navVisit: "মেডিকিওরে আসুন", askMedicure: "Medicure-কে জিজ্ঞেস করুন",
      eyebrow: "Medicure জ্ঞানকেন্দ্র", title: "ভারতীয় হোমিওপ্যাথিক ওষুধ বিশ্বকোষ", heroCopy: "ভারতের প্রধান প্রস্তুতকারকদের ওষুধ, উপাদান, পোটেন্সি ও প্রোডাক্ট তথ্য এক জায়গায়।",
      searchLabel: "ওষুধ বিশ্বকোষে খুঁজুন", searchPlaceholder: "Nux Vomica, অম্বল, 30CH, SBL বা নাক্স ভমিকা খুঁজুন", searchButton: "ওষুধ খুঁজুন", popular: "জনপ্রিয়:", motherTincture: "মাদার টিংচার",
      indiaFocused: "ভারত-কেন্দ্রিক", hpiLinked: "PCIM&H HPI সংযুক্ত", indianManufacturers: "ভারতীয় প্রস্তুতকারক", canonicalMedicines: "মূল ওষুধের প্রোফাইল", productVariants: "সংযুক্ত প্রোডাক্ট রেকর্ড", sourcesMethod: "উৎস ও পদ্ধতি",
      safetyTitle: "শিক্ষামূলক প্রোডাক্ট তথ্য, প্রেসক্রিপশন নয়।", safetyText: "ওষুধ নির্বাচন, পোটেন্সি, পুনরাবৃত্তি ও ডোজের জন্য যোগ্য চিকিৎসকের পরামর্শ নিন। প্রস্তুতকারকের ইন্ডিকেশন প্রমাণিত নিরাময়ের দাবি নয়।",
      filters: "ফিল্টার", refine: "বাছাই", filterTitle: "ওষুধের ফিল্টার", manufacturer: "প্রস্তুতকারক", allManufacturers: "সব প্রস্তুতকারক", medicineType: "ওষুধের ধরন", allTypes: "সব ধরন", singleRemedy: "একক রেমেডি", formulation: "কম্বিনেশন ফর্মুলেশন", manufacturerRange: "প্রস্তুতকারকের রেঞ্জ", form: "ফর্ম", allForms: "সব ফর্ম", potency: "পোটেন্সি", allPotencies: "সব পোটেন্সি", quickFilters: "দ্রুত ফিল্টার", withIndications: "প্রস্তুতকারকের ইন্ডিকেশন আছে", multiBrand: "একাধিক ভারতীয় ব্র্যান্ড", clearFilters: "ফিল্টার মুছুন", stockNote: "ক্যাটালগে থাকা Medicure-এর বর্তমান স্টকের নিশ্চয়তা নয়। স্টোরে জিজ্ঞেস করে নিশ্চিত করুন।",
      results: "টি ওষুধ", allCatalogContext: "পর্যালোচিত ভারতীয় প্রস্তুতকারক ক্যাটালগ থেকে", sortBy: "সাজান", relevance: "প্রাসঙ্গিকতা", nameAZ: "নাম A-Z", mostBrands: "সর্বাধিক ব্র্যান্ড", mostPotencies: "সর্বাধিক পোটেন্সি", loading: "ভারতীয় ওষুধ ক্যাটালগ লোড হচ্ছে...", noResults: "এই ফিল্টারে কোনও মূল ওষুধ পাওয়া যায়নি।", noResultsText: "সমার্থক নাম, ছোট নাম, অন্য পোটেন্সি দিয়ে চেষ্টা করুন বা ফিল্টার মুছুন।",
      sourceStandard: "উৎসের মান", traceableTitle: "প্রকাশিত প্রতিটি তথ্যের উৎস যাচাইযোগ্য।", traceableText: "ওষুধের পরিচয় Homoeopathic Pharmacopoeia of India সূচকের সঙ্গে যুক্ত। প্রোডাক্টের উপাদান, পোটেন্সি, প্যাক, ইন্ডিকেশন ও নির্দেশনা সংশ্লিষ্ট প্রস্তুতকারকের উৎসের সঙ্গেই থাকে। বিক্রেতার লিঙ্কে যাচাইয়ের তারিখ থাকে; তা বর্তমান দাম বা স্টক বোঝায় না।", reviewMethod: "ক্যাটালগ পদ্ধতি দেখুন",
      footerCopy: "মানিকতলা, কলকাতার হোমিওপ্যাথিক ওষুধের দোকান ও কনসালটেশন ক্লিনিক।", visit: "ঠিকানা", catalog: "ক্যাটালগ", allMedicines: "সব ওষুধ", footerDisclaimer: "এই বিশ্বকোষ শিক্ষামূলক; এটি রোগ নির্ণয়, প্রেসক্রিপশন বা চিকিৎসার বিকল্প নয়।",
      catalogGovernance: "ক্যাটালগ পরিচালনা", methodTitle: "ভারতীয় উৎস ও প্রকাশনা পদ্ধতি", identityHeading: "ওষুধের পরিচয়", identityBody: "একই ওষুধের পোটেন্সি, ফর্ম ও প্যাক একটি মূল প্রোফাইলে থাকে। পর্যালোচিত alias তালিকার মাধ্যমে সমার্থক ও ভিন্ন বানান মেলে। উপাদান আলাদা হলে কম্বিনেশন ফর্মুলেশন আলাদা থাকে।", manufacturerHeading: "প্রস্তুতকারকের তথ্য", manufacturerBody: "SBL, Schwabe India, Dr. Reckeweg India, Bakson, HAPCO, Mahesh Laboratories এবং M. Bhattacharyya / King & Co.-র অফিসিয়াল উৎস থেকে গঠিত তথ্য নেওয়া হয়েছে। অটোমেশন robots নীতি মানে; নিষিদ্ধ ক্যাটালগ পর্যালোচিত snapshot হিসেবে রাখা হয়।", claimHeading: "ইন্ডিকেশন ও নির্দেশনা", claimBody: "ইন্ডিকেশনকে স্পষ্টভাবে প্রস্তুতকারকের বক্তব্য বলা হয়। ডোজ শুধু সংশ্লিষ্ট প্রোডাক্টের ভিতরে দেখানো হয়; কোনও সার্বজনীন ডোজ তৈরি করা হয় না।", sellerHeading: "বিক্রেতার লিঙ্ক", sellerBody: "Tata 1mg, Netmeds, Healthmug ও Homeomart-এর লিঙ্ক প্রোডাক্ট খোঁজার জন্য। যাচাই করা লিস্টিংয়ে তারিখ থাকে; ৩০ দিনের বেশি পুরনো হলে পুনরায় দেখার চিহ্ন থাকে। দাম ও লাইভ স্টক দেখানো হয় না।",
      profile: "ওষুধের প্রোফাইল খুলুন", aliases: "অন্য নাম", sourceMaterial: "উৎস পরিচয়", commonForms: "সাধারণ ফর্ম", availablePotencies: "পাওয়া পোটেন্সি", brands: "ভারতীয় ব্র্যান্ড", manufacturerIndication: "প্রস্তুতকারকের ইন্ডিকেশন", traditionalContext: "ঐতিহ্যগত শিক্ষামূলক তথ্য", noClaim: "কোনও ইন্ডিকেশন সারাংশ প্রকাশিত হয়নি", products: "টি প্রোডাক্ট রেকর্ড", previous: "আগের পাতা", next: "পরের পাতা", page: "পাতা", of: "/", searchMatches: (query) => `“${query}”-এর ফলাফল`, filteredContext: "ফিল্টার করা ভারতীয় ক্যাটালগ", typeSingle: "একক রেমেডি", typeCombination: "ফর্মুলেশন", typeRange: "প্রস্তুতকারকের রেঞ্জ", more: (count) => `আরও ${count}টি`, clear: "মুছুন", queryFilter: "অনুসন্ধান",
      loadError: "ওষুধ ক্যাটালগ লোড করা যায়নি।", loadErrorText: "পাতাটি রিফ্রেশ করুন অথবা WhatsApp-এ Medicure-এর সাহায্য নিন।",
    },
  };

  const elements = {
    searchForm: document.querySelector("#catalog-search-form"), search: document.querySelector("#catalog-search"),
    manufacturer: document.querySelector("#manufacturer-filter"), type: document.querySelector("#type-filter"), form: document.querySelector("#form-filter"), potency: document.querySelector("#potency-filter"),
    withIndications: document.querySelector("#with-indications"), multiBrand: document.querySelector("#multi-brand"), sort: document.querySelector("#sort-filter"),
    grid: document.querySelector("[data-medicine-grid]"), loading: document.querySelector("[data-loading]"), empty: document.querySelector("[data-empty]"), pagination: document.querySelector("[data-pagination]"),
    count: document.querySelector("[data-results-count]"), context: document.querySelector("[data-results-context]"), activeFilters: document.querySelector(".active-filters"),
    filterPanel: document.querySelector("#catalog-filters"), filterButton: document.querySelector(".mobile-filter-button"), backdrop: document.querySelector(".filter-backdrop"), filterCount: document.querySelector(".active-filter-count"),
    methodology: document.querySelector("#methodology-dialog"),
  };

  initialize();

  async function initialize() {
    hydrateStateFromUrl();
    bindEvents();
    applyLanguage();
    try {
      const response = await fetch(CATALOG_URL, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Catalog request failed with ${response.status}`);
      state.catalog = await response.json();
      state.remedies = state.catalog.remedies.map(prepareRemedy);
      updateStats();
      populateFilters();
      syncControls();
      elements.loading.hidden = true;
      applyFilters({ updateUrl: false });
    } catch (error) {
      console.error(error);
      renderLoadError();
    }
  }

  function prepareRemedy(remedy) {
    const text = [remedy.canonicalName, remedy.banglaName, ...(remedy.synonyms || []), remedy.scientificIdentity, remedy.sourceMaterial, ...(remedy.tags || []), ...(remedy.forms || []), ...(remedy.availablePotencies || []), ...(remedy.manufacturers || []).map((maker) => maker.shortName), remedy.indication].join(" ");
    return { ...remedy, normalizedText: normalize(text), normalizedName: normalize(remedy.canonicalName), words: normalize(text).split(" ").filter(Boolean) };
  }

  function bindEvents() {
    elements.searchForm.addEventListener("submit", (event) => { event.preventDefault(); state.query = elements.search.value.trim(); state.page = 1; applyFilters(); });
    elements.search.addEventListener("input", debounce(() => { state.query = elements.search.value.trim(); state.page = 1; applyFilters(); }, 180));
    for (const [element, key] of [[elements.manufacturer, "manufacturer"], [elements.type, "type"], [elements.form, "form"], [elements.potency, "potency"], [elements.sort, "sort"]]) {
      element.addEventListener("change", () => { state[key] = element.value; state.page = 1; applyFilters(); });
    }
    elements.withIndications.addEventListener("change", () => { state.withIndications = elements.withIndications.checked; state.page = 1; applyFilters(); });
    elements.multiBrand.addEventListener("change", () => { state.multiBrand = elements.multiBrand.checked; state.page = 1; applyFilters(); });
    document.querySelectorAll(".clear-filters, [data-empty-clear]").forEach((button) => button.addEventListener("click", clearFilters));
    document.querySelectorAll("[data-query]").forEach((button) => button.addEventListener("click", () => { elements.search.value = button.dataset.query; state.query = button.dataset.query; state.page = 1; applyFilters(); elements.search.focus(); }));
    document.querySelector(".language-toggle").addEventListener("click", () => { state.language = state.language === "en" ? "bn" : "en"; localStorage.setItem("medicure-catalog-language", state.language); applyLanguage(); if (state.catalog) render(); });
    elements.filterButton.addEventListener("click", () => toggleFilters(true));
    document.querySelector(".close-filters").addEventListener("click", () => toggleFilters(false));
    elements.backdrop.addEventListener("click", () => toggleFilters(false));
    document.querySelectorAll("[data-methodology-open]").forEach((button) => button.addEventListener("click", () => elements.methodology.showModal()));
    elements.methodology.querySelector(".dialog-close").addEventListener("click", () => elements.methodology.close());
    elements.methodology.addEventListener("click", (event) => { if (event.target === elements.methodology) elements.methodology.close(); });
    window.addEventListener("popstate", () => { hydrateStateFromUrl(); syncControls(); if (state.catalog) applyFilters({ updateUrl: false }); });
  }

  function populateFilters() {
    const manufacturers = unique(state.remedies.flatMap((remedy) => remedy.manufacturers.map((maker) => [maker.id, maker.shortName]))).sort((a, b) => a[1].localeCompare(b[1], "en-IN"));
    appendOptions(elements.manufacturer, manufacturers);
    const forms = [...new Set(state.remedies.flatMap((remedy) => remedy.forms).filter((form) => form && form.length < 54))].sort((a, b) => a.localeCompare(b, "en-IN"));
    appendOptions(elements.form, forms.map((form) => [form, form]));
    const potencies = [...new Set(state.remedies.flatMap((remedy) => remedy.availablePotencies))].sort(potencySort);
    appendOptions(elements.potency, potencies.map((potency) => [potency, potency]));
  }

  function appendOptions(select, options) {
    for (const [value, label] of options) {
      const option = document.createElement("option"); option.value = value; option.textContent = label; select.append(option);
    }
  }

  function applyFilters({ updateUrl = true } = {}) {
    const query = normalize(state.query);
    const queryTokens = query.split(" ").filter(Boolean);
    state.filtered = state.remedies
      .map((remedy) => ({ remedy, score: searchScore(remedy, query, queryTokens) }))
      .filter(({ remedy, score }) => score >= 0
        && (!state.manufacturer || remedy.manufacturers.some((maker) => maker.id === state.manufacturer))
        && (!state.type || remedy.type === state.type)
        && (!state.form || remedy.forms.includes(state.form))
        && (!state.potency || remedy.availablePotencies.includes(state.potency))
        && (!state.withIndications || remedy.indicationType === "manufacturer")
        && (!state.multiBrand || remedy.manufacturers.length > 1));

    state.filtered.sort((left, right) => {
      if (state.sort === "name") return left.remedy.canonicalName.localeCompare(right.remedy.canonicalName, "en-IN");
      if (state.sort === "brands") return right.remedy.manufacturers.length - left.remedy.manufacturers.length || left.remedy.canonicalName.localeCompare(right.remedy.canonicalName, "en-IN");
      if (state.sort === "potencies") return right.remedy.availablePotencies.length - left.remedy.availablePotencies.length || left.remedy.canonicalName.localeCompare(right.remedy.canonicalName, "en-IN");
      return right.score - left.score || right.remedy.manufacturers.length - left.remedy.manufacturers.length || left.remedy.canonicalName.localeCompare(right.remedy.canonicalName, "en-IN");
    });
    const pages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    state.page = Math.min(Math.max(state.page, 1), pages);
    if (updateUrl) updateUrlState();
    render();
  }

  function searchScore(remedy, query, tokens) {
    if (!query) return 0;
    let score = 0;
    if (remedy.normalizedName === query) score += 200;
    else if (remedy.normalizedName.startsWith(query)) score += 130;
    else if (remedy.normalizedName.includes(query)) score += 100;
    else if (remedy.normalizedText.includes(query)) score += 65;

    for (const token of tokens) {
      if (remedy.words.includes(token)) score += 24;
      else if (remedy.words.some((word) => word.startsWith(token) || token.startsWith(word))) score += 15;
      else if (token.length >= 4 && remedy.words.some((word) => Math.abs(word.length - token.length) <= 2 && levenshtein(word, token) <= (token.length > 7 ? 2 : 1))) score += 8;
      else return -1;
    }
    return score || -1;
  }

  function render() {
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = state.filtered.slice(start, start + PAGE_SIZE).map((item) => item.remedy);
    elements.count.textContent = formatNumber(state.filtered.length);
    elements.context.textContent = state.query ? currentCopy().searchMatches(state.query) : hasFilters() ? currentCopy().filteredContext : currentCopy().allCatalogContext;
    elements.grid.innerHTML = pageItems.map(renderCard).join("");
    elements.grid.hidden = pageItems.length === 0;
    elements.empty.hidden = pageItems.length !== 0;
    renderPagination(totalPages);
    renderActiveFilters();
    window.lucide?.createIcons();
  }

  function renderCard(remedy) {
    const c = currentCopy();
    const typeLabel = remedy.type === "single" ? c.typeSingle : remedy.type === "combination" ? c.typeCombination : c.typeRange;
    const aliases = [remedy.banglaName, ...(remedy.synonyms || [])].filter(Boolean).slice(0, 3);
    const potencies = remedy.availablePotencies.slice(0, 6);
    const makers = remedy.manufacturers.slice(0, 3).map((maker) => maker.shortName);
    const indicationLabel = remedy.indicationType === "manufacturer" ? c.manufacturerIndication : remedy.indicationType === "traditional" ? c.traditionalContext : c.noClaim;
    return `<article class="medicine-card">
      <div class="card-topline"><span class="medicine-type ${escapeHtml(remedy.type)}">${escapeHtml(typeLabel)}</span><span class="record-count">${formatNumber(remedy.productCount)} ${escapeHtml(c.products)}</span></div>
      <div class="medicine-heading"><h2><a href="medicines/${escapeHtml(remedy.slug)}.html">${escapeHtml(remedy.canonicalName)}</a></h2>${remedy.banglaName ? `<p lang="bn">${escapeHtml(remedy.banglaName)}</p>` : ""}</div>
      ${aliases.length ? `<p class="aliases"><span>${escapeHtml(c.aliases)}</span> ${aliases.map(escapeHtml).join(" · ")}</p>` : ""}
      <div class="identity-row"><i data-lucide="sprout"></i><p><span>${escapeHtml(c.sourceMaterial)}</span><strong>${escapeHtml(remedy.scientificIdentity || remedy.sourceMaterial || remedy.canonicalName)}</strong></p></div>
      <div class="indication-block ${escapeHtml(remedy.indicationType)}"><span>${escapeHtml(indicationLabel)}</span><p>${escapeHtml(remedy.indication || c.noClaim)}</p></div>
      <dl class="medicine-facts">
        <div><dt>${escapeHtml(c.commonForms)}</dt><dd>${escapeHtml(remedy.forms.slice(0, 2).join(" · ") || "—")}</dd></div>
        <div><dt>${escapeHtml(c.brands)}</dt><dd>${escapeHtml(makers.join(" · ") || "—")}${remedy.manufacturers.length > makers.length ? ` <small>${escapeHtml(c.more(remedy.manufacturers.length - makers.length))}</small>` : ""}</dd></div>
      </dl>
      <div class="potency-row"><span>${escapeHtml(c.availablePotencies)}</span><div>${potencies.length ? potencies.map((potency) => `<b>${escapeHtml(potency)}</b>`).join("") : "<b>Source record</b>"}${remedy.availablePotencies.length > potencies.length ? `<b class="more-potencies">${escapeHtml(c.more(remedy.availablePotencies.length - potencies.length))}</b>` : ""}</div></div>
      <a class="card-link" href="medicines/${escapeHtml(remedy.slug)}.html"><span>${escapeHtml(c.profile)}</span><i data-lucide="arrow-up-right"></i></a>
    </article>`;
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) { elements.pagination.innerHTML = ""; return; }
    const pages = paginationWindow(state.page, totalPages);
    elements.pagination.innerHTML = `<button type="button" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""} aria-label="${escapeHtml(currentCopy().previous)}"><i data-lucide="chevron-left"></i><span>${escapeHtml(currentCopy().previous)}</span></button>
      <div class="page-numbers">${pages.map((page) => page === "…" ? `<span>…</span>` : `<button type="button" data-page="${page}" class="${page === state.page ? "active" : ""}" ${page === state.page ? 'aria-current="page"' : ""}>${formatNumber(page)}</button>`).join("")}</div>
      <button type="button" data-page="${state.page + 1}" ${state.page === totalPages ? "disabled" : ""}><span>${escapeHtml(currentCopy().next)}</span><i data-lucide="chevron-right"></i></button>`;
    elements.pagination.querySelectorAll("button[data-page]").forEach((button) => button.addEventListener("click", () => { state.page = Number(button.dataset.page); updateUrlState(); render(); document.querySelector("#catalog-results").scrollIntoView({ behavior: "smooth", block: "start" }); }));
  }

  function renderActiveFilters() {
    const c = currentCopy();
    const items = [];
    if (state.query) items.push(["query", `${c.queryFilter}: ${state.query}`]);
    if (state.manufacturer) items.push(["manufacturer", elements.manufacturer.selectedOptions[0]?.textContent]);
    if (state.type) items.push(["type", elements.type.selectedOptions[0]?.textContent]);
    if (state.form) items.push(["form", state.form]);
    if (state.potency) items.push(["potency", state.potency]);
    if (state.withIndications) items.push(["withIndications", c.withIndications]);
    if (state.multiBrand) items.push(["multiBrand", c.multiBrand]);
    elements.activeFilters.innerHTML = items.map(([key, label]) => `<button type="button" data-remove-filter="${key}"><span>${escapeHtml(label)}</span><i data-lucide="x"></i></button>`).join("");
    elements.activeFilters.hidden = items.length === 0;
    elements.filterCount.textContent = items.length;
    elements.filterCount.hidden = items.length === 0;
    elements.activeFilters.querySelectorAll("[data-remove-filter]").forEach((button) => button.addEventListener("click", () => removeFilter(button.dataset.removeFilter)));
  }

  function removeFilter(key) {
    if (key === "query") { state.query = ""; elements.search.value = ""; }
    else if (key === "withIndications" || key === "multiBrand") state[key] = false;
    else state[key] = "";
    state.page = 1; syncControls(); applyFilters();
  }

  function clearFilters() {
    Object.assign(state, { query: "", manufacturer: "", type: "", form: "", potency: "", withIndications: false, multiBrand: false, sort: "relevance", page: 1 });
    syncControls(); applyFilters(); toggleFilters(false);
  }

  function syncControls() {
    elements.search.value = state.query; elements.manufacturer.value = state.manufacturer; elements.type.value = state.type; elements.form.value = state.form; elements.potency.value = state.potency; elements.withIndications.checked = state.withIndications; elements.multiBrand.checked = state.multiBrand; elements.sort.value = state.sort;
  }

  function hydrateStateFromUrl() {
    const params = new URLSearchParams(location.search);
    state.query = params.get("q") || ""; state.manufacturer = params.get("manufacturer") || ""; state.type = params.get("type") || ""; state.form = params.get("form") || ""; state.potency = params.get("potency") || ""; state.withIndications = params.get("indications") === "1"; state.multiBrand = params.get("brands") === "multiple"; state.sort = params.get("sort") || "relevance"; state.page = Math.max(1, Number(params.get("page")) || 1);
  }

  function updateUrlState() {
    const params = new URLSearchParams();
    if (state.query) params.set("q", state.query); if (state.manufacturer) params.set("manufacturer", state.manufacturer); if (state.type) params.set("type", state.type); if (state.form) params.set("form", state.form); if (state.potency) params.set("potency", state.potency); if (state.withIndications) params.set("indications", "1"); if (state.multiBrand) params.set("brands", "multiple"); if (state.sort !== "relevance") params.set("sort", state.sort); if (state.page > 1) params.set("page", state.page);
    history.replaceState({}, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
  }

  function applyLanguage() {
    document.documentElement.lang = state.language === "bn" ? "bn" : "en-IN";
    document.body.classList.toggle("bangla", state.language === "bn");
    const c = currentCopy();
    document.querySelectorAll("[data-i18n]").forEach((element) => { const value = c[element.dataset.i18n]; if (typeof value === "string") element.textContent = value; });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { const value = c[element.dataset.i18nPlaceholder]; if (typeof value === "string") element.placeholder = value; });
    document.querySelector(".language-toggle span").textContent = state.language === "en" ? "বাংলা" : "English";
    window.lucide?.createIcons();
  }

  function updateStats() {
    document.querySelector("[data-stat='manufacturers']").textContent = formatNumber(state.catalog.meta.manufacturers);
    document.querySelector("[data-stat='remedies']").textContent = formatNumber(state.catalog.meta.remedies);
    document.querySelector("[data-stat='products']").textContent = formatNumber(state.catalog.meta.products);
  }

  function renderLoadError() {
    elements.loading.hidden = true; elements.grid.hidden = true; elements.empty.hidden = false;
    elements.empty.querySelector("h2").textContent = currentCopy().loadError; elements.empty.querySelector("p").textContent = currentCopy().loadErrorText;
    elements.empty.querySelector("button").hidden = true; elements.count.textContent = "0";
    window.lucide?.createIcons();
  }

  function toggleFilters(open) {
    document.body.classList.toggle("filters-open", open); elements.filterButton.setAttribute("aria-expanded", String(open));
  }

  function hasFilters() { return Boolean(state.manufacturer || state.type || state.form || state.potency || state.withIndications || state.multiBrand); }
  function currentCopy() { return copy[state.language]; }
  function formatNumber(value) { return new Intl.NumberFormat(state.language === "bn" ? "bn-IN" : "en-IN").format(value); }
  function normalize(value) { return String(value || "").toLocaleLowerCase(state.language === "bn" ? "bn-IN" : "en-IN").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
  function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }
  function unique(pairs) { const map = new Map(); for (const pair of pairs) if (!map.has(pair[0])) map.set(pair[0], pair); return [...map.values()]; }
  function potencySort(left, right) { const scale = (value) => value === "Q" || value === "MT" ? 0 : /X$|D$/i.test(value) ? 1 : /CH$|C$/i.test(value) ? 2 : value === "CM" ? 5 : /M$/i.test(value) && !/^LM/i.test(value) ? 3 : /^LM/i.test(value) ? 4 : 9; return scale(left) - scale(right) || (parseFloat(left.replace(/\D/g, "")) || 0) - (parseFloat(right.replace(/\D/g, "")) || 0) || left.localeCompare(right); }
  function paginationWindow(current, total) { if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1); const values = [1]; if (current > 4) values.push("…"); for (let page = Math.max(2, current - 1); page <= Math.min(total - 1, current + 1); page += 1) values.push(page); if (current < total - 3) values.push("…"); values.push(total); return values; }
  function levenshtein(a, b) { const row = Array.from({ length: b.length + 1 }, (_, index) => index); for (let i = 1; i <= a.length; i += 1) { let previous = row[0]; row[0] = i; for (let j = 1; j <= b.length; j += 1) { const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = old; } } return row[b.length]; }
})();
