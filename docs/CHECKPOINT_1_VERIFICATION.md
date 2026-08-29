# Checkpoint 1 verification

Verified on 29 August 2026 against the current `main` worktree. This is an implementation receipt, not a product-direction document; product decisions remain in `LIFEHACK_SOURCE_OF_TRUTH.md`.

## Verified behavior

| Requirement | Evidence |
|---|---|
| Fresh standalone project | Local Git history begins with the LifeHack Merchant Studio and contains no prior-hackathon routes or dependencies. |
| Live import | A fresh TREOO run inspected 17 public pages and produced 16 current product records. The fetch path and streaming API use `no-store`; DONE has no product-result cache. A merchant CDN or the operating system may still serve network responses quickly. |
| Preview limit | The interface states “up to 16 products”; the importer enforces 16 as a ceiling, not a promised count or production-catalogue architecture. |
| Truthful missing data | Unresolved template strings are rejected as descriptions. A corporate Sony products page without credible commerce evidence is rejected instead of becoming a fake product. |
| Provenance | Every imported row links to its public source. The proof rail shows homepage, platform, robots response, sitemap count, product count, acquisition methods, and uncached-fetch status. |
| Review workflow | Search for `SteelSeries` returned three matching rows. Excluding one row changed the summary to 15 included and the Excluded filter to one row. Editing description/category produced an Edited state and preserved the source link. |
| Bulk approval | After one exclusion, **Approve all complete products** changed the state to 15 included, 15 approved, zero needing review, then disabled itself. Products with missing facts are not approved by this action. |
| Safe failure | Importing `http://127.0.0.1:3100/` was blocked before fetch with an explicit private-network/SSRF explanation. Robots wildcard and allow-rule behavior has a regression test. |
| One-scroll layout | At a 1280-pixel desktop viewport and a 390-pixel phone viewport, document width equalled viewport width and no nested vertical scroll container existed. |
| Responsive presentation | Desktop and 390-by-844 phone layouts were visually inspected after the reference-driven redesign. |

## Automated verification

Run from the repository root:

```bash
pnpm test
pnpm lint
pnpm build
pnpm typecheck
```

The same sequence runs in `.github/workflows/ci.yml` on every push to `main` and every pull request.

## Human approval script

1. Open `http://127.0.0.1:3100/merchant`.
2. Choose TREOO or paste another public storefront URL.
3. Select **Build merchant draft** and watch the five import stages.
4. Inspect at least three product titles, images, descriptions, prices, availability states, variant counts, and source links.
5. Search for a product, exclude one, and confirm the summary/filter counts change.
6. Open **Review**, edit a field, save, and confirm the source remains attached.
7. Select **Approve all complete products** and confirm only complete, included rows become approved.
8. Start another import with `http://127.0.0.1:3100/` and confirm the private-network safety failure.
9. Return to TREOO for the presentation-ready state.
10. Decide **approve**, **change**, or **stop** for Checkpoint 1.

## Honest limitations

- This is a reviewable live preview, not a full-catalogue production crawler. Production requires pagination, durable jobs, refresh policies, and merchant-owned credentials where necessary.
- Product count and speed depend on the exact URL, public structured data, robots policy, merchant response, and network/CDN state.
- Sites that expose no credible public product records are rejected. DONE does not bypass login, access controls, or bot protection.
- Publishing, the generated Agent View, shopper flow, authentication, and simulated Visa authorization remain locked behind later checkpoints.
