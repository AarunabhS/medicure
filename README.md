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

The weekly GitHub workflow pushes `catalog/weekly-sync`, refreshes an existing
catalog-update pull request or opens a new draft, and records the branch,
commit, comparison and report links in the run summary. If GitHub's Actions
policy blocks PR creation, the run explicitly reports **manual review handoff
required** with a comparison link for opening the draft manually. Other API,
authentication and network failures still fail the run. Reports are also saved
as the `catalog-review-reports` artifact, including after a failed handoff.
Generated report updates preserve review notes outside the marked report
section of the PR description.

To recover a blocked handoff, use the run summary's comparison link (or
`gh pr create --base main --head catalog/weekly-sync --draft`) and review the
report at the recorded commit. An existing PR can then be refreshed on later
runs without changing repository policy. Check medicine identities,
compositions, removals, source counts and old page URLs as well as the automated
checks. A prepared branch or successful handoff does not publish the catalog:
no synchronized source change reaches the public site until its pull request
is reviewed and merged.

## Archived U.S. snapshot

The former FDA/NDC snapshot and importer are retained only under
`assets/data/archive/` and `scripts/archive/` for rollback. They are not loaded
or referenced by the public interface.

The encyclopedia is educational product information. It does not diagnose,
prescribe, establish effectiveness or replace qualified medical care.
