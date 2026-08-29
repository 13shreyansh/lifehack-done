import assert from "node:assert/strict";
import test from "node:test";
import { extractProductsFromHtml, parseRobots, robotsAllows } from "../lib/merchant/importer";
import { normalizeAndValidatePublicUrl, SafeFetchError, safeFetchText } from "../lib/merchant/safe-fetch";

test("extracts a complete schema.org product with provenance", () => {
  const html = `<!doctype html>
    <html><head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Atlas ANC 4",
          "description": "Over-ear travel headphones",
          "image": "/media/atlas.jpg",
          "category": "Headphones",
          "url": "/products/atlas-anc-4",
          "offers": [
            {"@type":"Offer","price":"399.90","priceCurrency":"SGD","availability":"https://schema.org/InStock"},
            {"@type":"Offer","price":"399.90","priceCurrency":"SGD","availability":"https://schema.org/OutOfStock"}
          ]
        }
      </script>
    </head></html>`;

  const products = extractProductsFromHtml(html, "https://merchant.example/products/atlas-anc-4");
  assert.equal(products.length, 1);
  assert.equal(products[0].title, "Atlas ANC 4");
  assert.equal(products[0].price?.amount, 399.9);
  assert.equal(products[0].price?.currency, "SGD");
  assert.equal(products[0].availability, "in_stock");
  assert.equal(products[0].variantCount, 2);
  assert.equal(products[0].sourceUrl, "https://merchant.example/products/atlas-anc-4");
  assert.ok(products[0].evidence.some((evidence) => evidence.field === "price" && evidence.sourceType === "json-ld"));
});

test("uses Open Graph product metadata when JSON-LD is absent", () => {
  const html = `<!doctype html><html><head>
    <meta property="og:type" content="product">
    <meta property="og:title" content="Quiet Flight Pro">
    <meta property="og:description" content="Comfort-first ANC headphones">
    <meta property="og:image" content="https://merchant.example/quiet.jpg">
    <meta property="product:price:amount" content="249.00">
    <meta property="product:price:currency" content="SGD">
    <meta property="product:availability" content="in stock">
  </head></html>`;

  const products = extractProductsFromHtml(html, "https://merchant.example/products/quiet-flight-pro");
  assert.equal(products.length, 1);
  assert.equal(products[0].title, "Quiet Flight Pro");
  assert.equal(products[0].price?.display, "SGD\u00a0249.00");
  assert.equal(products[0].availability, "in_stock");
  assert.ok(products[0].warnings.includes("Variant count could not be verified"));
});

test("uses page description metadata when product JSON-LD leaves description empty", () => {
  const html = `<!doctype html><html><head>
    <meta name="description" content="Full product description from the merchant page">
    <script type="application/ld+json">
      {"@type":"Product","name":"Studio One","url":"/products/studio-one","description":"","offers":{"price":"99","priceCurrency":"SGD"}}
    </script>
  </head></html>`;

  const [product] = extractProductsFromHtml(html, "https://merchant.example/products/studio-one");
  assert.equal(product.description, "Full product description from the merchant page");
  assert.ok(product.evidence.some((evidence) => evidence.field === "description" && evidence.sourceType === "html-meta"));
  assert.ok(!product.warnings.includes("Description is missing"));
});

test("applies robots wildcards and longest-match allow rules correctly", () => {
  const robots = parseRobots(`
    User-agent: *
    Allow: /
    Disallow: /cart/
    Disallow: /*?*ls=*&ls=*
    Sitemap: https://merchant.example/sitemap.xml
  `);

  assert.equal(robotsAllows(new URL("https://merchant.example/"), robots.rules), true);
  assert.equal(robotsAllows(new URL("https://merchant.example/products/headphones"), robots.rules), true);
  assert.equal(robotsAllows(new URL("https://merchant.example/cart/items"), robots.rules), false);
  assert.equal(robotsAllows(new URL("https://merchant.example/?sort=price&ls=a&ls=b"), robots.rules), false);
  assert.deepEqual(robots.sitemapUrls, ["https://merchant.example/sitemap.xml"]);
});

test("rejects local and credential-bearing URLs before fetching", async () => {
  await assert.rejects(
    () => normalizeAndValidatePublicUrl("http://127.0.0.1:3000/private"),
    (error: unknown) => error instanceof SafeFetchError && error.kind === "private_network",
  );
  await assert.rejects(
    () => normalizeAndValidatePublicUrl("https://user:secret@example.com"),
    (error: unknown) => error instanceof SafeFetchError && error.kind === "invalid_url",
  );
});

test("classifies an aborted public-site request as a timeout", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => safeFetchText(new URL("https://93.184.216.34/"), { timeoutMs: 1 }),
      (error: unknown) => error instanceof SafeFetchError && error.kind === "timeout",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
