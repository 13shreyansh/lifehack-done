"use client";

import Image, { type ImageLoaderProps } from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type {
  ImportedProduct,
  ImportErrorCode,
  ImportProgressEvent,
  ImportStageId,
  MerchantImportResult,
} from "@/lib/merchant/types";

type DraftProduct = ImportedProduct & {
  included: boolean;
  edited: boolean;
  reviewed: boolean;
};

type MerchantDraft = Omit<MerchantImportResult, "products"> & {
  products: DraftProduct[];
};

type ImportFailure = {
  code: ImportErrorCode | "request_error" | "cancelled";
  message: string;
  detail?: string;
  recoverable: boolean;
};

// Version the client-side draft schema so an older open build cannot overwrite
// a current review session with an incompatible product shape.
const DRAFT_STORAGE_KEY = "done:merchant-studio:draft:v3";
const DRAFT_STORAGE_EVENT = "done:merchant-draft-changed";
const DEMO_MERCHANT = "https://www.treoo.com/";
const SHOPIFY_MERCHANT = "https://www.stereo.com.sg/";

const STAGES: Array<{ id: ImportStageId; title: string; caption: string }> = [
  { id: "validate", title: "Address", caption: "Public URL and network safety" },
  { id: "connect", title: "Storefront", caption: "Homepage and access response" },
  { id: "discover", title: "Catalogue map", caption: "Platform, sitemaps and routes" },
  { id: "extract", title: "Product evidence", caption: "Structured facts and source pages" },
  { id: "normalize", title: "Merchant draft", caption: "Prices, stock and provenance" },
];

const STAGE_ORDER = new Map(STAGES.map((stage, index) => [stage.id, index]));

function passthroughImageLoader({ src }: ImageLoaderProps) {
  return src;
}

function Icon({ name, size = 18 }: { name: "arrow" | "check" | "chevron" | "close" | "edit" | "external" | "globe" | "link" | "search" | "shield" | "spark" | "warning"; size?: number }) {
  const paths: Record<typeof name, React.ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    external: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></>,
    spark: <><path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2Z" /><path d="m19 15-.7 2.3L16 18l2.3.7L19 21l.7-2.3L22 18l-2.3-.7Z" /></>,
    warning: <><path d="m12 3 10 18H2Z" /><path d="M12 9v5" /><path d="M12 17.5v.01" /></>,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function availabilityLabel(availability: ImportedProduct["availability"]) {
  if (availability === "in_stock") return "In stock";
  if (availability === "out_of_stock") return "Out of stock";
  if (availability === "preorder") return "Pre-order";
  if (availability === "backorder") return "Backorder";
  return "Needs review";
}

function normalizeDraft(result: MerchantImportResult): MerchantDraft {
  return {
    ...result,
    products: result.products.map((product) => ({ ...product, included: true, edited: false, reviewed: false })),
  };
}

function storeDraft(draft: MerchantDraft) {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  window.dispatchEvent(new Event(DRAFT_STORAGE_EVENT));
}

function removeStoredDraft() {
  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  window.dispatchEvent(new Event(DRAFT_STORAGE_EVENT));
}

function useStoredDraft() {
  const rawDraft = useSyncExternalStore(
    (notify) => {
      window.addEventListener("storage", notify);
      window.addEventListener(DRAFT_STORAGE_EVENT, notify);
      return () => {
        window.removeEventListener("storage", notify);
        window.removeEventListener(DRAFT_STORAGE_EVENT, notify);
      };
    },
    () => window.localStorage.getItem(DRAFT_STORAGE_KEY),
    () => null,
  );

  useEffect(() => {
    window.dispatchEvent(new Event(DRAFT_STORAGE_EVENT));
  }, []);

  return useMemo(() => {
    if (!rawDraft) return null;
    try {
      const parsed = JSON.parse(rawDraft) as MerchantDraft;
      return parsed && Array.isArray(parsed.products) && typeof parsed.merchantName === "string" ? parsed : null;
    } catch {
      return null;
    }
  }, [rawDraft]);
}

function reviewedWarnings(product: DraftProduct) {
  const warnings: string[] = [];
  if (!product.price) warnings.push("Price was not exposed in structured data");
  if (product.availability === "unknown") warnings.push("Availability needs merchant review");
  if (!product.imageUrl) warnings.push("No usable product image was found");
  if (!product.description?.trim()) warnings.push("Description is missing");
  if (!product.variantCount) warnings.push("Variant count could not be verified");
  return warnings;
}

function ProductImage({ product }: { product: DraftProduct }) {
  const [failed, setFailed] = useState(false);
  if (!product.imageUrl || failed) {
    return (
      <div className="product-image product-image-fallback" aria-hidden="true">
        <span>{product.title.slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }
  return (
    <div className="product-image">
      <Image
        loader={passthroughImageLoader}
        unoptimized
        src={product.imageUrl}
        alt=""
        width={96}
        height={96}
        sizes="96px"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function EmptyStudio({ url, setUrl, onImport }: { url: string; setUrl: (value: string) => void; onImport: () => void }) {
  return (
    <main className="merchant-empty">
      <section className="empty-hero" aria-labelledby="merchant-heading">
        <div className="hero-copy">
          <div className="hero-kicker"><span>01</span> Merchant access</div>
          <h1 id="merchant-heading">Make your store<br /><em>legible to agents.</em></h1>
          <p>Paste a public storefront. DONE finds the catalogue, preserves every source, and prepares a merchant-owned draft—without an API project.</p>
        </div>

        <form className="import-command" onSubmit={(event) => { event.preventDefault(); onImport(); }}>
          <label htmlFor="merchant-url">Merchant website</label>
          <div className="command-row">
            <span className="command-icon"><Icon name="globe" size={20} /></span>
            <input
              id="merchant-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://your-store.com"
            />
            <button type="submit" disabled={!url.trim()}>
              Build merchant draft <Icon name="arrow" size={17} />
            </button>
          </div>
          <div className="command-foot">
            <div className="demo-sources" aria-label="Real merchant examples">
              <button type="button" className="demo-source" onClick={() => setUrl(DEMO_MERCHANT)}>
                <span>T</span> TREOO <Icon name="chevron" size={14} />
              </button>
              <button type="button" className="demo-source" onClick={() => setUrl(SHOPIFY_MERCHANT)}>
                <span>S</span> Stereo <Icon name="chevron" size={14} />
              </button>
            </div>
            <span>Live preview · up to 16 products · no cache · no order</span>
          </div>
        </form>
      </section>

      <section className="read-contract" aria-label="What DONE imports">
        <div className="contract-lead">
          <span className="contract-number">01 / 03</span>
          <h2>One URL.<br />A reviewable catalogue.</h2>
        </div>
        <div className="contract-item">
          <Icon name="search" />
          <h3>Discover</h3>
          <p>Sitemaps, public product routes, structured data, and known commerce formats.</p>
        </div>
        <div className="contract-item">
          <Icon name="link" />
          <h3>Preserve</h3>
          <p>Every material field keeps its source page and retrieval time.</p>
        </div>
        <div className="contract-item">
          <Icon name="shield" />
          <h3>Review</h3>
          <p>Nothing publishes silently. Missing facts stay visible instead of being invented.</p>
        </div>
      </section>
    </main>
  );
}

function ImportingStudio({ url, progress, onCancel }: { url: string; progress: Extract<ImportProgressEvent, { type: "progress" }>[]; onCancel: () => void }) {
  const latest = progress.at(-1);
  const activeIndex = latest ? (STAGE_ORDER.get(latest.stage) ?? 0) : 0;
  const progressRatio = (latest?.completed ?? 0) / (latest?.total ?? 5);
  const displayDomain = (() => { try { return new URL(url.match(/^https?:\/\//i) ? url : `https://${url}`).hostname; } catch { return url; } })();
  return (
    <main className="importing-view">
      <section className="importing-copy">
        <div className="hero-kicker"><span>LIVE</span> Merchant import</div>
        <h1>Reading the store,<br /><em>not guessing it.</em></h1>
        <p className="importing-domain"><Icon name="globe" size={16} /> {displayDomain}</p>
        <button className="quiet-button" type="button" onClick={onCancel}>Stop import</button>
      </section>
      <section className="stage-card" aria-live="polite">
        <div className="stage-card-head">
          <span>Import trail</span>
          <strong>{Math.round(progressRatio * 100)}%</strong>
        </div>
        <div className="stage-progress"><i style={{ transform: `scaleX(${progressRatio})` }} /></div>
        <ol>
          {STAGES.map((stage, index) => {
            const complete = index < activeIndex || latest?.stage === "complete";
            const active = index === activeIndex && latest?.stage !== "complete";
            const matching = [...progress].reverse().find((item) => item.stage === stage.id);
            return (
              <li key={stage.id} className={complete ? "complete" : active ? "active" : "pending"}>
                <span className="stage-marker">{complete ? <Icon name="check" size={14} /> : String(index + 1).padStart(2, "0")}</span>
                <div><strong>{matching?.label ?? stage.title}</strong><p>{matching?.detail ?? stage.caption}</p></div>
                {active ? <span className="stage-pulse" /> : null}
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}

function ErrorStudio({ failure, url, setUrl, onRetry, onReset }: { failure: ImportFailure; url: string; setUrl: (value: string) => void; onRetry: () => void; onReset: () => void }) {
  return (
    <main className="error-view">
      <section className="error-card">
        <div className="error-symbol"><Icon name={failure.code === "blocked_by_robots" || failure.code === "private_network" ? "shield" : "warning"} size={30} /></div>
        <div className="hero-kicker"><span>IMPORT PAUSED</span> {failure.code.replaceAll("_", " ")}</div>
        <h1>{failure.message}</h1>
        {failure.detail ? <p>{failure.detail}</p> : null}
        <label htmlFor="retry-url">Merchant website</label>
        <div className="retry-row">
          <input id="retry-url" value={url} onChange={(event) => setUrl(event.target.value)} />
          <button type="button" onClick={onRetry} disabled={!url.trim()}>Try again <Icon name="arrow" size={16} /></button>
        </div>
        <button type="button" className="text-button" onClick={onReset}>Start with another store</button>
      </section>
      <aside className="truth-note">
        <Icon name="shield" />
        <div><strong>A useful failure is part of the product.</strong><p>DONE does not bypass login, bot protection, robots policy, or private networks. Use a public product or collection URL when a homepage exposes no catalogue.</p></div>
      </aside>
    </main>
  );
}

function ProductEditor({ product, onSave, onClose }: { product: DraftProduct; onSave: (product: DraftProduct) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(product);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1) ?? first;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const updatePrice = (value: string) => {
    if (!value.trim()) {
      setDraft((current) => ({ ...current, price: null, edited: true }));
      return;
    }
    const amount = Number(value);
    const currency = draft.price?.currency ?? "SGD";
    setDraft((current) => ({
      ...current,
      price: Number.isFinite(amount) ? { amount, currency, display: new Intl.NumberFormat("en-SG", { style: "currency", currency, currencyDisplay: "code" }).format(amount) } : null,
      edited: true,
    }));
  };

  return (
    <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="product-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <header>
          <div><span>Merchant draft</span><h2 id="editor-title">Review product</h2></div>
          <button ref={closeButtonRef} type="button" aria-label="Close editor" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="editor-source">
          <ProductImage product={product} />
          <div><span>Imported from</span><a href={product.sourceUrl} target="_blank" rel="noreferrer">{new URL(product.sourceUrl).hostname}<Icon name="external" size={13} /></a></div>
        </div>
        <div className="editor-fields">
          <label>Product title<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value, edited: true }))} /></label>
          <div className="field-grid">
            <label>Price<input inputMode="decimal" value={draft.price?.amount ?? ""} onChange={(event) => updatePrice(event.target.value)} /></label>
            <label>Availability<select value={draft.availability} onChange={(event) => setDraft((current) => ({ ...current, availability: event.target.value as DraftProduct["availability"], edited: true }))}>
              <option value="in_stock">In stock</option><option value="out_of_stock">Out of stock</option><option value="preorder">Pre-order</option><option value="backorder">Backorder</option><option value="unknown">Needs review</option>
            </select></label>
          </div>
          <label>Category<input value={draft.category ?? ""} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value || null, edited: true }))} placeholder="Headphones" /></label>
          <label>Description<textarea rows={6} value={draft.description ?? ""} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value || null, edited: true }))} /></label>
        </div>
        <div className="editor-note"><Icon name="link" size={16} /><p>Edits change this DONE draft only. The original evidence remains attached and visible.</p></div>
        <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" onClick={() => {
          const warnings = reviewedWarnings(draft);
          onSave({ ...draft, warnings, reviewed: warnings.length === 0 });
        }}>Save and approve</button></footer>
      </section>
    </div>
  );
}

function ResultsStudio({ draft, setDraft, onNewImport }: { draft: MerchantDraft; setDraft: (draft: MerchantDraft) => void; onNewImport: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "approved" | "attention" | "excluded">("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  const includedCount = draft.products.filter((product) => product.included).length;
  const approvedCount = draft.products.filter((product) => product.included && product.reviewed).length;
  const attentionCount = draft.products.filter((product) => product.included && !product.reviewed).length;
  const needsFixCount = draft.products.filter((product) => product.included && product.warnings.length > 0).length;
  const approvableCount = draft.products.filter((product) => product.included && !product.reviewed && product.warnings.length === 0).length;
  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return draft.products.filter((product) => {
      if (needle && !`${product.title} ${product.category ?? ""} ${product.description ?? ""}`.toLowerCase().includes(needle)) return false;
      if (filter === "approved") return product.included && product.reviewed;
      if (filter === "attention") return product.included && !product.reviewed;
      if (filter === "excluded") return !product.included;
      return true;
    });
  }, [draft.products, filter, query]);

  const updateProduct = (productId: string, update: (product: DraftProduct) => DraftProduct) => {
    setDraft({ ...draft, products: draft.products.map((product) => product.id === productId ? update(product) : product) });
  };
  const approveAllComplete = () => {
    setDraft({
      ...draft,
      products: draft.products.map((product) => product.included && product.warnings.length === 0 ? { ...product, reviewed: true } : product),
    });
  };
  const editingProduct = draft.products.find((product) => product.id === editingId) ?? null;

  return (
    <main className="results-view">
      <section className="merchant-summary">
        <div className="merchant-identity">
          <div className="merchant-monogram">{draft.merchantName.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="summary-kicker"><span>Live draft</span> Checkpoint 1 · Merchant review</div>
            <h1>{draft.merchantName}</h1>
            <a href={draft.canonicalUrl} target="_blank" rel="noreferrer">{draft.domain}<Icon name="external" size={13} /></a>
          </div>
        </div>
        <div className="summary-actions">
          <span className="save-state saved"><i />Draft saved locally</span>
          <button type="button" className="secondary-button" onClick={onNewImport}>New import</button>
          <button type="button" className="primary-button" disabled>Publish in Checkpoint 2</button>
        </div>
      </section>

      <section className="metric-strip" aria-label="Import summary">
        <div><span>Included products</span><strong>{includedCount.toString().padStart(2, "0")}</strong><small>of {draft.products.length} detected</small></div>
        <div><span>Approved</span><strong>{approvedCount.toString().padStart(2, "0")}</strong><small>{attentionCount} await a decision</small></div>
        <div><span>Needs fixes</span><strong>{needsFixCount.toString().padStart(2, "0")}</strong><small>exact missing fields shown</small></div>
        <div><span>Live import</span><strong className="time-metric">{(draft.diagnostics.durationMs / 1000).toFixed(1)} sec</strong><small>{draft.diagnostics.pagesInspected} uncached public pages</small></div>
      </section>

      <section className={`approval-command${approvableCount === 0 ? " approval-complete" : ""}`} aria-live="polite">
        <div>
          <span>{approvableCount > 0 ? `${approvableCount} complete ${approvableCount === 1 ? "product" : "products"}` : "Bulk review complete"}</span>
          <strong>{approvableCount > 0 ? "Approve every complete product in one decision." : needsFixCount > 0 ? `${needsFixCount} ${needsFixCount === 1 ? "product still needs" : "products still need"} a human fix.` : "Every included product is approved."}</strong>
          <p>Products with missing facts are never approved by this action.</p>
        </div>
        <button type="button" className="primary-button" onClick={approveAllComplete} disabled={approvableCount === 0}>
          <Icon name="check" size={17} /> Approve all complete products
        </button>
      </section>

      <div className="workspace-grid">
        <section className="catalog-workspace" aria-labelledby="catalog-title">
          <header className="catalog-head">
            <div><span>Imported catalogue</span><h2 id="catalog-title">Review what agents will see.</h2></div>
            <div className="catalog-search"><Icon name="search" size={17} /><label htmlFor="catalog-search" className="sr-only">Search imported products</label><input id="catalog-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" /></div>
          </header>
          <div className="filter-row" role="group" aria-label="Product filters">
            {(["all", "approved", "attention", "excluded"] as const).map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "all" ? `All ${draft.products.length}` : item === "approved" ? `Approved ${approvedCount}` : item === "attention" ? `Needs review ${attentionCount}` : `Excluded ${draft.products.length - includedCount}`}</button>)}
          </div>

          <div className="product-list">
            {filteredProducts.length ? filteredProducts.map((product) => (
              <article key={product.id} className={`product-row${product.included ? "" : " excluded"}`}>
                <label className="include-control" title={product.included ? "Included in draft" : "Excluded from draft"}>
                  <input type="checkbox" checked={product.included} onChange={(event) => updateProduct(product.id, (current) => ({ ...current, included: event.target.checked }))} />
                  <span><Icon name="check" size={13} /></span>
                </label>
                <ProductImage product={product} />
                <div className="product-copy">
                  <div className="product-badges">
                    {product.edited ? <span className="edited-badge">Edited</span> : null}
                    {product.category ? <span>{product.category}</span> : <span>Uncategorised</span>}
                  </div>
                  <h3>{product.title}</h3>
                  <p className="product-description">{product.description ?? "Description missing — open review to add the merchant copy."}</p>
                  <a href={product.sourceUrl} target="_blank" rel="noreferrer"><Icon name="link" size={12} /> Source evidence <Icon name="external" size={11} /></a>
                </div>
                <div className="product-commerce">
                  <strong>{product.price?.display ?? "Price missing"}</strong>
                  <span className={`stock stock-${product.availability}`}>{availabilityLabel(product.availability)}</span>
                  <small>{product.variantCount ? `${product.variantCount} ${product.variantCount === 1 ? "variant" : "variants"}` : "Variants unverified"}</small>
                </div>
                <div className="product-review">
                  {product.reviewed ? <span className="approved-count"><Icon name="check" size={13} /> Approved</span> : product.warnings.length ? <span className="warning-count" title={product.warnings.join(" · ")}><Icon name="warning" size={13} /> {product.warnings[0]}{product.warnings.length > 1 ? ` +${product.warnings.length - 1}` : ""}</span> : <span className="ready-count"><Icon name="check" size={13} /> Ready to approve</span>}
                  <button type="button" onClick={() => setEditingId(product.id)}><Icon name="edit" size={15} /> {product.warnings.length ? "Fix & review" : "Review"}</button>
                </div>
              </article>
            )) : (
              <div className="filtered-empty"><Icon name="search" size={24} /><h3>No products in this view</h3><p>Try another search or filter. The imported draft has not been changed.</p></div>
            )}
          </div>
        </section>

        <aside className="proof-rail">
          <section className="proof-card">
            <div className="proof-icon"><Icon name="spark" /></div>
            <span>Import proof</span>
            <h2>Every fact has somewhere to go back to.</h2>
            <dl>
              <div><dt>Homepage</dt><dd>HTTP {draft.diagnostics.homepageStatus}</dd></div>
              <div><dt>Platform</dt><dd>{draft.detectedPlatform}</dd></div>
              <div><dt>Robots</dt><dd>{draft.diagnostics.robotsStatus ? `HTTP ${draft.diagnostics.robotsStatus}` : "Not exposed"}</dd></div>
              <div><dt>Sitemaps</dt><dd>{draft.diagnostics.sitemapUrls.length}</dd></div>
              <div><dt>Structured products</dt><dd>{draft.diagnostics.structuredProductsFound}</dd></div>
              <div><dt>Cache</dt><dd>None · live fetch</dd></div>
            </dl>
            <ul className="import-methods">
              {draft.diagnostics.methods.map((method) => <li key={method}>{method}</li>)}
            </ul>
            <a href={draft.diagnostics.robotsUrl} target="_blank" rel="noreferrer">Open robots policy <Icon name="external" size={13} /></a>
          </section>

          <section className="disclaimer-card">
            <div><Icon name="shield" size={18} /><strong>Independent demonstration</strong></div>
            <p>This is a LifeHack prototype using publicly accessible product information. It is not {draft.merchantName}&apos;s official website and is not affiliated with, endorsed by, or operated by the merchant.</p>
            <p>Prices and availability may change. Source pages and retrieval times are shown. No real order is placed here.</p>
          </section>

          <section className="next-gate-card">
            <span>Next human gate</span>
            <h3>Original Site + Agent View</h3>
            <p>Human View will open the merchant&apos;s original website. DONE will generate only the agent-ready view after this import is approved.</p>
            <div><i /> Checkpoint 2 intentionally unavailable</div>
          </section>
        </aside>
      </div>

      {editingProduct ? <ProductEditor product={editingProduct} onClose={() => setEditingId(null)} onSave={(updated) => { updateProduct(updated.id, () => updated); setEditingId(null); }} /> : null}
    </main>
  );
}

export function MerchantStudio() {
  const [url, setUrl] = useState(DEMO_MERCHANT);
  const [status, setStatus] = useState<"empty" | "importing" | "results" | "error">("empty");
  const [progress, setProgress] = useState<Extract<ImportProgressEvent, { type: "progress" }>[]>([]);
  const [failure, setFailure] = useState<ImportFailure | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const storedDraft = useStoredDraft();
  const visibleStatus = status === "empty" && storedDraft ? "results" : status;

  const startImport = useCallback(async () => {
    if (!url.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFailure(null);
    setProgress([]);
    setStatus("importing");

    try {
      const response = await fetch("/api/merchant/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? `Import request failed with HTTP ${response.status}.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ImportProgressEvent;
          if (event.type === "progress") setProgress((current) => [...current, event]);
          if (event.type === "complete") {
            const nextDraft = normalizeDraft(event.result);
            storeDraft(nextDraft);
            setStatus("results");
          }
          if (event.type === "error") {
            setFailure(event);
            setStatus("error");
          }
        }
        if (done) break;
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setFailure({ code: "cancelled", message: "Import stopped.", detail: "Nothing was changed. You can restart when ready.", recoverable: true });
      } else {
        setFailure({ code: "request_error", message: "Merchant import could not start.", detail: error instanceof Error ? error.message : "Unknown request error", recoverable: true });
      }
      setStatus("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [url]);

  const newImport = () => {
    abortRef.current?.abort();
    removeStoredDraft();
    setFailure(null);
    setProgress([]);
    setStatus("empty");
  };

  return (
    <div className="merchant-app">
      <header className="merchant-nav">
        <Link className="done-wordmark" href="/merchant" aria-label="DONE Merchant Studio">DONE<span>·</span></Link>
        <div className="nav-context"><span>Merchant Studio</span><i />Checkpoint 1</div>
        <div className="nav-status"><span className="status-dot" /> Independent hackathon demo</div>
      </header>

      {visibleStatus === "empty" ? <EmptyStudio url={url} setUrl={setUrl} onImport={() => void startImport()} /> : null}
      {visibleStatus === "importing" ? <ImportingStudio url={url} progress={progress} onCancel={() => abortRef.current?.abort()} /> : null}
      {visibleStatus === "error" && failure ? <ErrorStudio failure={failure} url={url} setUrl={setUrl} onRetry={() => void startImport()} onReset={newImport} /> : null}
      {visibleStatus === "results" && storedDraft ? <ResultsStudio draft={storedDraft} setDraft={storeDraft} onNewImport={newImport} /> : null}

      <footer className="merchant-footer"><span>DONE / PTJM98</span><p>Public commerce facts become a reviewable merchant draft. Missing data stays missing until a human decides.</p><span>LifeHack 2026</span></footer>
    </div>
  );
}
