# DONE - LifeHack 2026 Product Source of Truth

> This document records the product we have decided to build and the experience we intend to prove. It fixes the product direction, not incidental technology choices. Implementers should make intelligent decisions that preserve the experience, truthfulness, and judging story below.

| Field | Decision |
|---|---|
| Hackathon | LifeHack 2026 |
| Team | PTJM98 |
| Challenge | Visa - Conversational Commerce Agents for Every Merchant |
| Working product name | DONE |
| Product form | Mobile-first web app plus merchant studio and a visible browser agent |
| Demonstration category | Consumer electronics, initially headphones |
| Payment | Explicitly simulated Visa payment |
| Last updated | 29 August 2026, Singapore |

## 1. The aim

We are building to win the Visa challenge with one unusually complete, high-taste loop:

> Paste a merchant website and DONE turns its public commerce information into an agent-ready store. A shopper then asks naturally for an outcome, watches a real agent research the live web, receives an evidence-backed recommendation, approves one exact purchase with Face ID or a passkey, and sees a simulated Visa payment finish inside the conversation.

The product is not merely a shopping chatbot. Its core insight is that agentic commerce needs both sides:

- a simple way for any merchant to become understandable and usable by agents; and
- a trusted customer agent that can discover, compare, decide, obtain consent, and act.

The moment judges should remember is: **one URL turns into an agent-ready merchant, and one authenticated approval turns a conversation into a completed task.**

## 2. Why this matches Visa's challenge

The official Visa material asks for:

- a category-trained chatbot or voice assistant;
- discovery, recommendation, comparison, and purchase decisions;
- no-code or low-code merchant access for both SMEs and larger retailers;
- a simulated Visa payment completed inside the conversation with no redirect;
- transaction preview, user authorization, identity verification, and confirmation before the agent transacts; and
- an end-to-end demonstration of discover -> decide -> build cart -> authenticate -> pay.

The judging criteria are innovation, user experience, technical feasibility, scalability, and trust and safety. DONE must visibly answer all five rather than explain them only in slides.

Primary challenge evidence reviewed locally:

- `~/Downloads/Visa Problem Statement.pdf`
- `~/Downloads/Visa Presentation.pdf` (organizer-provided confidential material; do not commit or redistribute)

## 3. Product decisions

These decisions define the product:

1. **Two-sided product.** DONE contains Merchant Studio and DONE Shopper. Neither is a decorative side feature.
2. **Mobile-first shopper experience.** The shopper uses our responsive web app on an iPhone or laptop. We are not using iMessage.
3. **Grok Bot quality bar, not a clone.** The interface is a quiet conversation, concise status updates, a visible computer view, one clear action at a time, and no dashboard clutter or generic AI styling.
4. **A real adaptive browser agent.** A visible Chrome window researches current public pages. The result is not a prerecorded sequence or a fixed list of browser actions.
5. **Real merchant information.** The demonstration imports public catalog and commerce facts from a real Singapore merchant into an independent hackathon layer hosted on our domain.
6. **No affiliation claim.** The imported layer clearly says that it is an independent hackathon demonstration, is not the merchant's official website, and is not endorsed by or affiliated with the merchant.
7. **Agent-ready publishing.** Merchant Studio turns imported information into a structured catalog and UCP-aligned discovery, cart, and checkout capabilities that agents can understand without scraping every page again.
8. **Conditional comparison.** The agent compares products when the request is about an outcome or asks for the best option. An exact product request can take a shorter verify-and-buy path. The judging demo includes comparison because Visa explicitly asks for it.
9. **One exact approval.** The shopper reviews the merchant, item, variant, quantity, fulfillment, total, evidence, and authority before authenticating.
10. **Real authentication, simulated money.** WebAuthn invokes genuine Face ID on a supported iPhone or Touch ID/passkey on a Mac. The Visa authorization is simulated and always labelled as such.
11. **LifeHack-native architecture.** The repository contains only components needed for the Visa challenge and does not depend on any prior hackathon implementation or sponsor positioning.
12. **No hard-coded recommendation.** The request can be rehearsed, but live candidate data, eligibility, ranking, recommendation, cart, and receipt must be produced from current evidence.

## 4. The product at a glance

| Layer | What it does | What judges can inspect |
|---|---|---|
| Merchant Studio | Accepts a public website URL, extracts commerce information, and creates an agent-ready layer | Crawl progress, imported products, source URLs, confidence, and publish action |
| Agent-ready merchant | Exposes normalized catalog, policies, fulfillment, cart, and simulated checkout on our domain | Link to the merchant's original human website, DONE-generated agent view, discovery profile, and structured responses |
| DONE Shopper | Holds the natural conversation and keeps the customer informed | Request, clarification, progress, comparison, approval, and receipt |
| Browser agent | Searches and visits real public pages using a visible Chrome session | Live Chrome window, current URLs, timestamps, and extracted evidence |
| Decision engine | Applies hard constraints and ranks the valid candidates | Rejections, trade-offs, scoring inputs, and explanation |
| Trust gateway | Identifies the agent, binds authority to an exact action, and verifies the user | Signed request status, cart hash, amount ceiling, expiry, nonce, and passkey result |
| Visa simulator | Executes only the approved intent and returns a deterministic result | Clearly labelled simulated authorization and audit record |

The protocols have different jobs:

- **UCP-aligned merchant layer:** what the business offers and how an agent discovers catalog, cart, fulfillment, and checkout capabilities.
- **Visa Trusted Agent Protocol-inspired trust:** who the agent is, who authorized it, what domain/action it may perform, and whether the request is fresh and unmodified.
- **WebAuthn/passkeys:** proof that the shopper personally approved the displayed purchase.
- **Visa simulator:** the challenge-compliant payment outcome without moving real money or handling card credentials.

We may implement real cryptographic signatures using our own demo keys, but we must never describe DONE as a Visa-approved agent or its signatures as Visa-issued. Full UCP or Visa protocol compliance is claimed only if it is actually tested.

## 5. Merchant Studio

### Merchant promise

> Give DONE your website. DONE creates the commerce interface that shopping agents wish every merchant had.

### Interface direction

The canonical UI reference pack is `brians-ai-ui-reference-pack/IMPORTANT_POSTS.md`. It informs the interface through durable principles, not wholesale copying:

- the Merchant Studio behaves like a focused readiness scanner: one URL in, visible checks and evidence out;
- agent work is observable through explicit stages, sources, uncertainty, and human review rather than decorative “AI” effects;
- the surface uses familiar product-tool controls, restrained color, consistent states, keyboard support, and purposeful motion;
- provenance and merchant readiness are primary information, not hidden technical detail;
- real product references solve specific interaction problems while the DONE identity and flow remain original.

### Core flow

1. The user pastes a real merchant website URL.
2. DONE scans public commerce pages using sitemaps, structured data, known commerce-platform formats, and browser extraction where necessary.
3. It identifies products, variants, prices, availability, images, categories, policies, fulfillment information, and source URLs.
4. It normalizes those facts into a category-aware catalog and flags missing or uncertain fields.
5. **Human View** opens the merchant's original public website in a new tab. DONE does not clone, restyle, or present that site as its own.
6. **Agent View** opens the DONE-generated, agent-ready representation on a DONE-owned URL.
7. One publish action creates that public, agent-ready layer on a DONE-owned URL.
8. DONE generates a discovery profile plus catalog, cart, and simulated-checkout capabilities.

The Agent View is not a raw Markdown page and it is not a copy of the human storefront. It has two synchronized representations:

- a judge-readable visual profile showing normalized products, prices, availability, provenance, refresh time, policies, and supported actions; and
- canonical machine-readable discovery and capability responses for catalog search, product lookup, cart creation, and simulated checkout.

Markdown such as `agents.md` can be generated as a readable orientation document, but it is not the catalog source of truth. Structured responses and their schemas are authoritative.

The hackathon import is allowed to run without the merchant operating the studio. In that mode, the published page must visibly say:

> Independent hackathon demonstration using publicly accessible product information. Not the merchant's official website and not affiliated with, endorsed by, or operated by the merchant. Prices and availability may change; source pages and retrieval times are shown. No real order is placed here.

"Import the website" means importing commerce-relevant public facts and structure. It does not mean impersonating the merchant, copying customer accounts or private data, bypassing access controls, or presenting our demo checkout as the merchant's real checkout.

### Category adaptability

One common commerce model supports category packs:

- electronics: specifications, compatibility, warranty, availability;
- fashion: size, colour, material, fit, returns;
- food: options, dietary information, allergens, pickup/delivery;
- bookings: time, capacity, location, cancellation policy.

The hackathon should implement consumer electronics deeply and show how another pack would fit, rather than shallowly pretending every category already works.

### Jaben's role

Jaben is a **reference implementation**, not our demo integration or partner. Its public `agents.md`, `/.well-known/ucp`, and agent tools demonstrate what an agent-ready merchant can look like. We can show Jaben briefly to establish that this direction is real, then show DONE producing a similar class of capability for a different public merchant that does not already provide it.

- Human website: <https://www.jaben.com/>
- Agent instructions: <https://www.jaben.com/agents.md>
- UCP discovery: <https://www.jaben.com/.well-known/ucp>

## 6. DONE Shopper

### Experience

The shopper opens DONE as a responsive website. The main screen is intentionally simple:

- one conversation;
- one composer;
- short, human progress updates;
- compact product evidence and comparisons;
- a collapsible live computer view;
- one approval card; and
- one receipt.

The mobile page and laptop page share the same run. The iPhone is the preferred approval surface because genuine Face ID produces the clearest trust moment. The demonstration remains operable on the Mac using Touch ID/passkeys if the phone path is unreliable.

### Canonical demonstration request

The chosen category is headphones because the decision has meaningful constraints, several comparable real products, and enough value to justify strong consent:

> I need comfortable over-ear noise-cancelling headphones for a long flight tomorrow. Keep it under S$450 and make sure I can get them in Singapore in time.

DONE may ask one useful clarification, such as whether battery life, comfort, sound, or compactness matters most. It must not interrogate the shopper when the request already contains enough information.

The winner is deliberately not specified here. The browser agent must discover current candidates and choose from live evidence. The test passes even if the winner changes.

## 7. Real browser and adaptive agent

Chrome runs visibly on the presentation Mac. DONE Chat can run on the iPhone, while the judges simultaneously see Chrome search, open product pages, inspect details, and revisit finalists.

Using Playwright or Chrome DevTools does not make the agent fake. Those are the hands controlling the browser. The intelligence must come from an adaptive loop:

1. interpret the goal and constraints;
2. decide what evidence is missing;
3. choose the next search or browser action;
4. observe the real page result;
5. extract and normalize evidence;
6. revise the plan when pages or results differ;
7. stop when enough current evidence exists.

A fixed macro that always visits the same pages in the same order is not acceptable. A reliable search API may help identify URLs, but the visible browser must still inspect the material pages used in the decision.

Use at most two understandable roles in the interface:

- **Scout** discovers relevant products and merchants.
- **Verifier** rechecks finalists for price, variant, availability, fulfillment, and source freshness.

Do not show hidden chain-of-thought. Show useful actions and evidence: "Searching Singapore retailers", "Checking pickup availability", "Rejected: exceeds budget", and the actual public URL.

## 8. Recommendation and comparison

The language model interprets intent and explains results. A deterministic policy enforces hard requirements such as budget, form factor, delivery deadline, compatibility, and stock.

The comparison should show only decision-relevant facts:

- current product and merchant;
- current price and fulfillment;
- whether every hard requirement passes;
- the two or three meaningful trade-offs;
- source links and retrieval time; and
- why the recommended option best fits this request.

The system must retain rejected candidates and reasons. If source data changes, the eligibility or recommendation must be able to change without editing code.

## 9. Trust, consent, and transparency

Visa's Trusted Agent Protocol asks merchants to distinguish a legitimate commerce agent from a malicious bot and to verify agent intent, user identity, and payment information. DONE demonstrates that model without falsely claiming Visa certification.

### Before approval

The transaction card shows:

- DONE agent identity and whether it is demo-verified;
- exact merchant name and source domain;
- product, variant, quantity, and fulfillment;
- subtotal, fees, delivery, and total;
- why the item was selected;
- evidence sources and verification time;
- exact action being authorized;
- maximum amount and currency;
- approval expiry and single-use status; and
- **Simulated Visa payment**.

### Approval and execution

1. DONE creates a canonical cart hash and a short-lived, single-use purchase mandate.
2. The mandate is bound to agent, shopper session, merchant domain, operation, cart, currency, amount ceiling, nonce, and expiry.
3. The shopper taps **Approve with Face ID** on iPhone or the corresponding passkey action on Mac.
4. The operating system displays the genuine biometric/passkey interface.
5. The server verifies the WebAuthn assertion.
6. Only then does the simulator mint a one-time demo payment token and execute the exact approved intent.
7. Any material cart change invalidates approval and requires a new preview.

This borrows the strongest interaction from Stripe Link's agent flow: the agent presents merchant, context, line items, and total; the user approves; only then does the agent receive a single-use payment credential. DONE uses a simulated token because Link's live agent capability is not the challenge requirement and may not be available to us in Singapore.

### Security proof shown to judges

- signed, time-bound request;
- unique nonce and replay prevention;
- merchant-domain and operation binding;
- cart hash and amount ceiling;
- real user-verification result;
- single-use execution token;
- idempotent payment result;
- redacted audit trail; and
- visible failure when an approved cart is altered.

No real card number is collected, generated, stored, logged, or shown.

## 10. Exact five-minute demonstration

This is the full target story. If the judge gives less time, use the compressed version below.

| Time | What happens | What it proves |
|---|---|---|
| 0:00-0:20 | Hook: “The web is built for humans. DONE makes any merchant ready for agents, then lets a customer buy through one trusted conversation.” | Clear problem and product |
| 0:20-0:55 | Paste a real merchant URL. The import visibly finds products, prices, variants, sources, and missing fields. | No-code merchant onboarding and real data |
| 0:55-1:15 | Open Human View, which launches the merchant's original website; then open DONE's generated Agent View, discovery profile, and one catalog response. Mention Jaben as evidence that this pattern already exists. | Agent-ready merchant layer and scalability |
| 1:15-1:35 | Open DONE Chat on iPhone and send the headphones request. Answer at most one clarification. | Simple customer experience |
| 1:35-2:35 | Scout searches in visible Chrome; Verifier rechecks the best candidates and the imported merchant. The phone shows concise live progress. | Real adaptive work, not a hard-coded carousel |
| 2:35-3:05 | DONE shows a compact comparison, rejects failures, and recommends the current best option with sources. | Discovery, recommendation, comparison, decision |
| 3:05-3:35 | Open the exact transaction preview: merchant, cart, source, total, agent authority, and simulated-payment label. | Transparency and bounded consent |
| 3:35-4:05 | Tap Approve; genuine Face ID/passkey appears. The signed mandate becomes approved. | Identity verification and human authorization |
| 4:05-4:25 | DONE builds the cart and returns **Visa authorization simulated** without leaving the chat. | Frictionless challenge-compliant payment |
| 4:25-4:45 | Show receipt and audit proof: signatures, cart hash, nonce, amount ceiling, timestamps, and idempotency. | Technical feasibility and trust |
| 4:45-5:00 | Change the amount or variant; DONE rejects the old approval and asks again. Close: “Any merchant becomes agent-ready; every agent action remains inspectable and user-controlled.” | Memorable safety proof |

## 11. Compressed three-minute demonstration

Use a previously imported merchant, but rerun a short live refresh so the data is still demonstrably current.

| Time | What happens |
|---|---|
| 0:00-0:15 | Problem and one-line promise |
| 0:15-0:40 | URL import/refresh; open the original merchant website, then DONE's generated Agent View |
| 0:40-0:55 | Shopper request and one clarification |
| 0:55-1:35 | Visible Chrome discovery and verification |
| 1:35-1:55 | Evidence-backed comparison and recommendation |
| 1:55-2:20 | Exact approval card and genuine Face ID/passkey |
| 2:20-2:40 | In-chat simulated Visa payment and receipt |
| 2:40-3:00 | Signed audit proof plus tamper/replay rejection |

The official material checked so far does not publish an individual team duration. The product therefore must tell a complete story in three minutes and expand naturally to five.

## 12. Human checkpoints in demonstration order

Development follows the same order in which judges experience the product. Each checkpoint is independently visible and requires Shreyansh's explicit approval before work begins on the next checkpoint.

| Checkpoint | What Shreyansh visually inspects | Approval condition |
|---|---|---|
| 1. Merchant ready | Paste the selected real merchant URL; watch ingestion; inspect real products, prices, variants, images, source links, warnings, draft edits, and inclusion controls | The merchant experience is polished, truthful, convincingly no-code, and usable without editing source code |
| 2. Original Site and Agent View | Open the merchant's original website through Human View; open DONE's generated Agent View; inspect catalog and cart responses; compare a product against its source | The boundary is unmistakable: the human experience remains the merchant's, while DONE supplies a useful and trustworthy interface for agents |
| 3. Shopper interface | Open DONE Chat on iPhone and Mac; inspect the conversation, composer, live-computer panel, comparison card, approval card, and receipt design | The interface feels premium and Grok Bot-simple before agent logic is connected |
| 4. Conversation and live research | Send the real request; answer one clarification; watch Chrome search, visit pages, and stream evidence into the conversation | A materially different request causes different research, proving adaptive behavior rather than a fixed script |
| 5. Trust and buying simulator | Inspect the transaction preview; use genuine Face ID/passkey; watch mandate approval, simulated authorization, receipt, and changed-cart rejection | The valid purchase succeeds exactly once while tampering, replay, expiry, and changed totals visibly fail |
| 6. Complete demonstration | Run the complete experience from merchant URL to receipt without developer intervention | The three-minute path works repeatedly and the five-minute path feels calm and intentional |

Every checkpoint handoff includes:

- the exact URL or screen to open;
- a short click-by-click verification script;
- what is real, simulated, incomplete, or blocked;
- known limitations and remaining risks; and
- an explicit approve/change/stop decision.

### Checkpoint 1 - Merchant ready

Checkpoint 1 includes only the merchant import and review experience:

- a working Merchant Studio;
- the chosen real public merchant displayed clearly;
- URL input and truthful ingestion progress;
- imported catalog with product-level provenance and retrieval times;
- detected prices, variants, images, availability, and explicit missing-field warnings;
- search, draft editing, selection, and exclusion controls;
- a polished desktop and mobile layout; and
- the independent-hackathon, non-affiliation, and no-real-order disclaimer.

It does not claim that the shopper agent, agent-view publication, authentication, or payment flow is complete.

Checkpoint 1 is approved only after Shreyansh can paste the URL, inspect several imported products against their live source pages, edit and exclude products without code changes, exercise non-happy states, and judge the interface presentation-ready.

Current verification (29 August 2026):

- The importer is general-purpose rather than TREOO-specific. It reads live public storefronts through structured data, page metadata, sitemaps, and exposed commerce-platform catalogues; it does not promise access when a merchant blocks automation or exposes no usable public product facts.
- Checkpoint 1 intentionally imports at most 16 products as a fast, reviewable live preview. Sixteen is a ceiling, not a promised result count or the future production-catalogue architecture; production ingestion requires pagination and background refresh. The interface must state this limit instead of implying a complete catalogue.
- Fresh, uncached end-to-end imports were verified against both TREOO and Stereo Electronics. Stereo previously failed because DONE incorrectly interpreted a wildcard `robots.txt` rule as a site-wide block; that parser defect is fixed and covered by a regression test.
- Imported descriptions now use the product record first and the live product page metadata as a fallback. Missing fields remain explicit instead of being invented.
- Review has a real decision state: each product is unapproved until reviewed, and **Approve all complete products** approves only included products with no missing required facts. Products needing fixes remain unapproved.
- The desktop and phone catalogue use one document scroll, with no nested product-list scrollbar or horizontal overflow. The application root opens Merchant Studio and inherited presentation routes are not part of this repository.
- Checkpoint 1 is implemented and technically verified, but remains awaiting Shreyansh's visual approve/change/stop decision.
- The first visual design was rejected after a reference audit found overuse of tiny uppercase labels, numbered setup scaffolding, dashboard-like metric tiles, and a pale-paper/acid treatment. The revised interface removes those patterns in favour of a focused merchant command, familiar review controls, restrained colour, visible provenance, and explicit approval states. The revision remains awaiting Shreyansh's visual approval.

### Checkpoint 2 - Original Site and Agent View

Checkpoint 2 makes **Human View** a direct link to the merchant's original public website and adds the DONE-generated Agent View, discovery information, catalog search, product lookup, cart contract, and simulated-checkout contract. DONE does not generate or host a replacement human storefront. The same product must remain consistent between its original source and the visual and machine-readable Agent View. Jaben appears only as a reference for the pattern.

### Checkpoint 3 - Shopper interface

Checkpoint 3 establishes the responsive DONE Chat interface before connecting the live agent. It fixes typography, spacing, message density, composer, computer preview, comparison, approval, receipt, and overall visual taste. Temporary layout data must be clearly identified and removed before functional verification.

### Checkpoint 4 - Conversation and live agent

Checkpoint 4 connects natural conversation, minimal clarification, adaptive search planning, visible Chrome control, live evidence, constraint enforcement, comparison, and recommendation. Its core test is that changed intent produces changed browser behavior and results.

### Checkpoint 5 - Trust and buying simulator

Checkpoint 5 adds the exact transaction preview, agent and merchant identity, cart hash, amount ceiling, genuine WebAuthn, short-lived single-use mandate, simulated Visa authorization, receipt, audit proof, and visible rejection of tampering, replay, expiry, and duplicate execution. It stays inside DONE Chat.

### Checkpoint 6 - Full demonstration

Checkpoint 6 validates cold start, three- and five-minute paths, iPhone and Mac approval paths, venue-network behavior, truthful cached fallback, and the final presenter script.

## 13. Judging strategy

| Rubric | DONE's visible answer |
|---|---|
| Innovation | One URL becomes an agent-ready merchant, immediately used by a live shopping agent |
| User experience | Grok Bot-like chat, minimal questions, visible progress, one precise approval |
| Technical feasibility | Real web extraction, UCP-aligned merchant capabilities, adaptive Chrome, real WebAuthn, signed mandates, deterministic simulator |
| Scalability | Common catalog model, category packs, public agent interface, single-location and multi-location support direction |
| Trust and safety | Sources, agent identity, purpose/domain binding, cart hash, expiry, single use, biometric approval, audit proof, and explicit simulation |

## 14. Build plan and gates

### Phase 1 - Product reset and visual foundation

- Keep the repository isolated from prior hackathon code, assets, infrastructure, and sponsor language.
- Establish DONE's quiet mobile chat and merchant-studio design system.
- Define the shared run state so phone, laptop, browser, and audit view stay synchronized.

**Gate:** the blank product already looks intentional on phone and laptop, and no obsolete story appears.

### Phase 2 - Merchant Studio and agent-ready publishing

- Build URL ingestion for public catalog pages and one strong commerce-platform pattern.
- Normalize products with provenance and timestamps.
- Build review, warning, preview, and publish states.
- Publish an independent agent-ready merchant layer on our domain with discovery, catalog, cart, and simulated checkout.

**Gate:** a fresh merchant URL creates a usable, sourced catalog and public agent view without code edits.

### Phase 3 - Adaptive shopping agent and visible Chrome

- Connect the conversation to a real planning/tool loop.
- Run a visible headed Chrome session on the demo Mac.
- Implement discovery, extraction, evidence storage, and finalist verification.
- Stream safe progress and evidence to the phone and laptop UI.

**Gate:** changing the request or live web results changes where the browser goes and what it returns.

### Phase 4 - Comparison and decision

- Parse shopper constraints and ask only necessary questions.
- Enforce hard requirements deterministically.
- Rank eligible candidates and explain current trade-offs with source links.

**Gate:** invalid candidates are rejected, evidence changes can change the winner, and no recommendation text is prewritten.

### Phase 5 - Trust and simulated Visa payment

- Add demo agent keys and signed, domain/action-bound requests inspired by Visa TAP.
- Add canonical cart hashing, amount ceilings, expiry, nonce, replay protection, and idempotency.
- Add real WebAuthn/passkey verification.
- Mint a single-use simulated payment token only after approval.
- Complete payment and receipt inside the chat.

**Gate:** tampering, expiry, replay, duplicate execution, and changed totals fail visibly; a valid approval succeeds once.

### Phase 6 - Demo hardening and submission

- Rehearse the exact three- and five-minute paths repeatedly.
- Test the presentation Mac, iPhone, network, passkeys, Chrome, and public URLs from cold start.
- Add an honestly labelled cached-evidence fallback for network failure without disguising it as live execution.
- Update README, architecture, run instructions, demo video, and disclosure of pre-existing versus LifeHack work.

**Gate:** the live core works repeatedly, every claim can be inspected, and the fallback is truthful.

## 15. Non-negotiable truth boundaries

- Do not claim merchant partnership, endorsement, or an official merchant website.
- Do not claim Visa approval, certification, keys, real authorization, settlement, or card issuance.
- Do not call a payment real when it is simulated.
- Do not fake Face ID, browser activity, product results, timestamps, or a protocol verification.
- Do not hard-code candidates, prices, availability, winner, comparison, or receipt.
- Do not collect real card credentials or expose browser cookies, private sessions, addresses, or authentication data.
- Do not bypass login, CAPTCHA, access controls, or bot protection.
- Do not submit the old DONE prototype as newly built LifeHack work; disclose the rebuild honestly.

## 16. Deliberately flexible implementation choices

The following are not product decisions and may change when implementation evidence suggests a better option:

- the final public merchant used for the import;
- application framework, database, hosting, and event transport;
- language model and search provider;
- browser-control library;
- exact ranking weights;
- exact UCP version and transport implemented;
- precise visual styling within the stated quality bar;
- whether the iPhone or Mac is the primary input device on judging day; and
- extra category packs implemented after electronics works.

Choose whichever option makes the experience more real, reliable, inspectable, and polished without violating the decisions above.

## 17. Definition of done

The hackathon product is ready when a judge can personally verify all of the following:

1. A real public merchant URL becomes a sourced agent-ready layer on our domain.
2. The human view and agent view describe the same current catalog.
3. A natural shopper request starts an adaptive run rather than a fixed animation.
4. Visible Chrome visits the public pages used in the decision.
5. The comparison and recommendation derive from current evidence.
6. The shopper sees the complete transaction before approval.
7. A genuine passkey interaction verifies the user.
8. The mandate is narrow, short-lived, single-use, and invalidated by material change.
9. Payment completes inside the conversation and is unmistakably simulated.
10. The receipt and audit view prove what happened without exposing secrets.
11. The full loop fits comfortably within three minutes.

## 18. Final story

> A merchant or hackathon demonstrator pastes a real store URL into DONE. DONE reads the public catalog and produces an independent, clearly labelled agent-ready commerce layer on our domain. A shopper then asks DONE for the right headphones. A real browser agent searches the live web, compares current products, and explains the best option. Before anything is bought, DONE shows the exact merchant, evidence, cart, total, and authority. The shopper approves with genuine Face ID or a passkey. A short-lived, single-use mandate allows only that purchase, and a simulated Visa authorization completes inside the chat. The entire journey is visible, sourced, and auditable.

That is the product we are building.
