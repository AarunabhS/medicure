export const HPI_SOURCE = {
  id: "pcimh-hpi",
  name: "Homoeopathic Pharmacopoeia of India",
  publisher: "Pharmacopoeia Commission for Indian Medicine & Homoeopathy, Ministry of AYUSH",
  url: "https://www.portal.pcimh.gov.in/products?categories=97e857d1-7288-4f31-b142-bf55adeb7d14&page=1",
  role: "Canonical medicine names, synonyms, identity and pharmacopoeial reference",
};

export const CDSCO_SOURCE = {
  id: "cdsco-drugs-rules",
  name: "Drugs and Cosmetics Rules, 1945",
  publisher: "Central Drugs Standard Control Organisation",
  url: "https://cdsco.gov.in/opencms/export/sites/CDSCO_WEB/Pdf-documents/Ethics-Committee/Guideline-Document/Drugs_CosmeticsAct1940_Rules1945.pdf",
  role: "Indian homoeopathic composition, potency and labelling context",
};

export const MANUFACTURERS = [
  {
    id: "bakson",
    name: "Bakson Drugs & Pharmaceuticals",
    shortName: "Bakson",
    url: "https://www.buybakson.com/pages/download-catalogue",
    sourceUrl: "https://cdn.shopify.com/s/files/1/0743/0904/2417/files/MT_Dilution_Catalogue_14-05-24_1.pdf?v=1754394718",
    parser: "bakson-pdf",
    automated: true,
  },
  {
    id: "hapco",
    name: "Hahnemann Publishing Co. Pvt. Ltd.",
    shortName: "HAPCO",
    url: "https://www.hapco.co.in/products.html",
    sourceUrl: "https://www.hapco.co.in/products.html",
    parser: "hapco-html",
    automated: true,
  },
  {
    id: "mahesh",
    name: "Mahesh Laboratories Pvt. Ltd.",
    shortName: "Mahesh",
    url: "https://www.maheshlab.com/catalogue.html",
    sourceUrl: "https://www.maheshlab.com/catalogue.html",
    parser: "mahesh-html",
    automated: true,
  },
  {
    id: "reckeweg",
    name: "Dr. Reckeweg & Co. GmbH / Dr. Roshanlal Aggarwal & Sons",
    shortName: "Dr. Reckeweg",
    url: "https://www.reckeweg-india.com/",
    sourceUrl: "https://www.reckeweg-india.com/homoeopathy-products/world-famous-specialities-r1-to-r89-1.html",
    parser: "reckeweg-html",
    automated: true,
  },
  {
    id: "sbl",
    name: "SBL Pvt. Ltd.",
    shortName: "SBL",
    url: "https://sblglobal.com/",
    sourceUrl: "https://sblglobal.com/admin/public/uploads/catalogs/1658568424.pdf",
    parser: "reviewed-manual",
    automated: false,
    reviewNote: "The official booklet is maintained as a reviewed snapshot because the publisher's robots policy does not permit automated catalog retrieval.",
  },
  {
    id: "schwabe-india",
    name: "Dr. Willmar Schwabe India Pvt. Ltd.",
    shortName: "Schwabe India",
    url: "https://www.schwabeindia.com/",
    sourceUrl: "https://www.schwabeindia.com/download/",
    parser: "reviewed-manual",
    automated: false,
    reviewNote: "Official product pages and downloadable catalog are reviewed manually when automated access is unavailable.",
  },
  {
    id: "mb-king",
    name: "M. Bhattacharyya & Co. Pvt. Ltd. / King & Co.",
    shortName: "M. Bhattacharyya / King & Co.",
    url: "https://mbhomeo.in/",
    sourceUrl: "https://mbhomeo.in/wp-content/uploads/2023/03/englishcatalogue_2023_a5_digital.pdf",
    parser: "reviewed-manual",
    automated: false,
    reviewNote: "The official scan is image-based; normalized records require human review after OCR.",
  },
];

export const RETAILERS = [
  {
    id: "tata-1mg",
    name: "Tata 1mg",
    searchUrl: "https://www.1mg.com/search/all?name={query}",
    verification: "manual",
  },
  {
    id: "netmeds",
    name: "Netmeds",
    searchUrl: "https://www.netmeds.com/catalogsearch/result?q={query}",
    verification: "manual",
  },
  {
    id: "healthmug",
    name: "Healthmug",
    searchUrl: "https://www.healthmug.com/search?keyword={query}",
    verification: "manual",
  },
  {
    id: "homeomart",
    name: "Homeomart",
    searchUrl: "https://homeomart.com/search?q={query}",
    verification: "manual",
  },
];

export const ALL_SOURCES = [
  HPI_SOURCE,
  CDSCO_SOURCE,
  ...MANUFACTURERS.map((manufacturer) => ({
    id: `manufacturer-${manufacturer.id}`,
    name: `${manufacturer.shortName} official catalog`,
    publisher: manufacturer.name,
    url: manufacturer.sourceUrl,
    role: "Product range, formulation, potency, pack and label information",
  })),
];
