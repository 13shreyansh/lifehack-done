# DONE — LifeHack 2026

DONE is a two-sided conversational-commerce product for the Visa challenge **Conversational Commerce Agents for Every Merchant**.

Checkpoint 1 is the Merchant Studio: paste a public merchant website, watch a live uncached import, inspect sourced products and missing facts, edit or exclude items, and approve every complete item in one decision. The imported layer is an independent hackathon demonstration; it does not claim merchant affiliation and does not place a real order.

The product direction, exact demonstration story, trust boundaries, and human checkpoints live in [`docs/LIFEHACK_SOURCE_OF_TRUTH.md`](docs/LIFEHACK_SOURCE_OF_TRUTH.md).

## Run Merchant Studio

Requires Node.js 22.13 or newer.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/merchant`. The root route opens Merchant Studio.

## Verify

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

The importer reads only public HTTP(S) material, validates redirects and network destinations, respects `robots.txt`, limits response sizes and crawl breadth, and reports unsupported or blocked stores rather than bypassing their controls.

## Current boundaries

- Merchant Studio is implemented and awaiting the Checkpoint 1 visual approval decision.
- Human and Agent Views, DONE Shopper, the visible browser agent, WebAuthn approval, and the simulated Visa authorization belong to later checkpoints.
- No real order or payment occurs in Checkpoint 1.
