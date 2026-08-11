# Medicure Homeopathy

Static website for the Medicure Homeopathy medicine store and consultation
clinic at 45, Maniktala Main Road, Kolkata.

## Pages

- `index.html` - store, consultation, ordering, location and the concise remedy
  guide.
- `medicines.html` - India-focused searchable medicine encyclopedia.
- `medicines/<slug>.html` - generated, indexable canonical medicine profiles.

## Indian medicine catalog

The public catalog is organized around medicines, not individual potency or
pack listings. A single profile can contain product variants from Bakson,
HAPCO, Mahesh Laboratories, Dr. Reckeweg India, SBL, Schwabe India and
M. Bhattacharyya / King & Co.

Source identity and pharmacopoeial links use the PCIM&H Homoeopathic
Pharmacopoeia of India index. Product facts remain attributed to official
manufacturer catalogs or product pages. Indications are labelled as
manufacturer statements. Directions appear only inside the product record from
which they came and are never presented as a universal dose.

Retailer links are limited to selected Indian sellers. They show a manual
verification date, do not display prices, and do not claim current stock.
Medicure inventory is intentionally separate from the encyclopedia.

## Catalog commands

Node.js 22.13 or newer is required.

```sh
npm install
npm run catalog:sync
npm run catalog:all
```

- `catalog:sync` downloads permitted official sources, respects `robots.txt`,
  and writes a review report. Sources that prohibit automation remain reviewed
  snapshots.
- `catalog:build` merges aliases, brands, potencies, forms and packs into
  canonical profiles, then generates JSON and HTML pages.
- `catalog:validate` fails on duplicate identities, missing sources, unresolved
  aliases, malformed attribution, major source-count drops or missing initial
  manufacturer coverage.
- `catalog:test` covers aliases, potency notation, canonical merging,
  composition collisions and source adapters.
- `catalog:report` writes `assets/data/catalog-update-report.md` for human
  review.

The weekly GitHub workflow creates or refreshes a catalog-update pull request.
No synchronized source change reaches the public site until that pull request
is reviewed and merged.

## Archived U.S. snapshot

The former FDA/NDC snapshot and importer are retained only under
`assets/data/archive/` and `scripts/archive/` for rollback. They are not loaded
or referenced by the public interface.

The encyclopedia is educational product information. It does not diagnose,
prescribe, establish effectiveness or replace qualified medical care.
