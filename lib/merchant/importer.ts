import { createHash, randomUUID } from "node:crypto";
import type {
  ImportErrorCode,
  ImportedPrice,
  ImportedProduct,
  ImportProgressEvent,
  MerchantImportResult,
  ProductEvidence,
} from "./types";
import { normalizeAndValidatePublicUrl, safeFetchText, SafeFetchError, type SafeTextResponse } from "./safe-fetch";

type ProgressCallback = (event: Extract<ImportProgressEvent, { type: "progress" }>) => void;
type JsonRecord = Record<string, unknown>;

const MAX_PRODUCTS = 16;
const MAX_PRODUCT_PAGES = 18;
const PRODUCT_PATH_PATTERN = /\/(products?|shop|store|collections?\/[^/]+\/products?|product-page|p)\//i;

export class MerchantImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
    readonly detail?: string,
    readonly recoverable = true,
  ) {
    super(message);
    this.name = "MerchantImportError";
  }
}

function emit(
  onProgress: ProgressCallback,
  stage: Extract<ImportProgressEvent, { type: "progress" }>["stage"],
  label: string,
  detail: string,
  completed: number,
  total: number,
) {
  onProgress({ type: "progress", stage, label, detail, completed, total });
}

function stripTags(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function absoluteUrl(value: unknown, baseUrl: URL) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(decodeHtmlEntities(value.trim()), baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return stripTags(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = firstString(item);
      if (candidate) return candidate;
    }
  }
  if (value && typeof value === "object") {
    const record = value as JsonRecord;
    return firstString(record.url ?? record.contentUrl ?? record.name);
  }
  return null;
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1].trim());
  }
  return null;
}

function titleFromHtml(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? stripTags(title) : null;
}

function descriptionFromHtml(html: string) {
  return metaContent(html, "og:description")
    ?? metaContent(html, "description")
    ?? metaContent(html, "twitter:description");
}

function jsonLdObjects(html: string) {
  const results: unknown[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = match[1].trim().replace(/^<!--|-->$/g, "").trim();
    if (!raw) continue;
    try {
      results.push(JSON.parse(raw));
    } catch {
      // Malformed structured data is common; the importer continues with other evidence.
    }
  }
  return results;
}

function walkJson(value: unknown, visitor: (record: JsonRecord) => void) {
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visitor);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as JsonRecord;
  visitor(record);
  for (const [key, child] of Object.entries(record)) {
    if (key !== "offers") walkJson(child, visitor);
  }
}

function hasSchemaType(record: JsonRecord, target: string) {
  const type = record["@type"];
  return Array.isArray(type) ? type.some((entry) => String(entry).toLowerCase() === target.toLowerCase()) : String(type).toLowerCase() === target.toLowerCase();
}

function normalizeAvailability(value: unknown): ImportedProduct["availability"] {
  const normalized = firstString(value)?.toLowerCase().replace(/[\s_-]/g, "") ?? "";
  if (normalized.includes("outofstock") || normalized.includes("soldout") || normalized === "unavailable") return "out_of_stock";
  if (normalized.includes("preorder")) return "preorder";
  if (normalized.includes("backorder")) return "backorder";
  if (normalized.includes("instock") || normalized === "available") return "in_stock";
  return "unknown";
}

function parseAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}\b)/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function makePrice(amountValue: unknown, currencyValue: unknown): ImportedPrice | null {
  const amount = parseAmount(amountValue);
  if (amount === null) return null;
  const currency = typeof currencyValue === "string" && /^[A-Za-z]{3}$/.test(currencyValue.trim()) ? currencyValue.trim().toUpperCase() : "SGD";
  let display: string;
  try {
    display = new Intl.NumberFormat("en-SG", { style: "currency", currency, currencyDisplay: "code" }).format(amount);
  } catch {
    display = `${currency} ${amount.toFixed(2)}`;
  }
  return { amount, currency, display };
}

function collectOffers(record: JsonRecord) {
  const offers = record.offers;
  if (Array.isArray(offers)) return offers.filter((offer): offer is JsonRecord => Boolean(offer && typeof offer === "object"));
  if (offers && typeof offers === "object") return [offers as JsonRecord];
  return [];
}

function productId(sourceUrl: string, title: string) {
  return createHash("sha256").update(`${sourceUrl}|${title}`).digest("hex").slice(0, 16);
}

function productWarnings(product: Omit<ImportedProduct, "warnings">) {
  const warnings: string[] = [];
  if (!product.price) warnings.push("Price was not exposed in structured data");
  if (product.availability === "unknown") warnings.push("Availability needs merchant review");
  if (!product.imageUrl) warnings.push("No usable product image was found");
  if (!product.description) warnings.push("Description is missing");
  if (!product.variantCount) warnings.push("Variant count could not be verified");
  return warnings;
}

function schemaProduct(record: JsonRecord, pageUrl: URL, html: string): ImportedProduct | null {
  const title = firstString(record.name ?? record.headline);
  if (!title) return null;
  const offers = collectOffers(record);
  const firstOffer = offers[0] ?? {};
  const priceSpecification = firstOffer.priceSpecification && typeof firstOffer.priceSpecification === "object" ? (firstOffer.priceSpecification as JsonRecord) : {};
  const sourceUrl = absoluteUrl(record.url ?? firstOffer.url, pageUrl) ?? pageUrl.toString();
  const imageUrl = absoluteUrl(firstString(record.image), pageUrl);
  const price = makePrice(firstOffer.price ?? firstOffer.lowPrice ?? priceSpecification.price, firstOffer.priceCurrency ?? priceSpecification.priceCurrency);
  const availability = normalizeAvailability(firstOffer.availability ?? record.availability);
  const evidence: ProductEvidence[] = [
    { field: "title", sourceUrl, sourceType: "json-ld" },
  ];
  const schemaDescription = firstString(record.description);
  const description = schemaDescription ?? descriptionFromHtml(html);
  if (description) evidence.push({ field: "description", sourceUrl, sourceType: schemaDescription ? "json-ld" : "html-meta" });
  if (imageUrl) evidence.push({ field: "image", sourceUrl, sourceType: "json-ld" });
  if (price) evidence.push({ field: "price", sourceUrl, sourceType: "json-ld" });
  if (availability !== "unknown") evidence.push({ field: "availability", sourceUrl, sourceType: "json-ld" });
  if (offers.length) evidence.push({ field: "variants", sourceUrl, sourceType: "json-ld" });

  const base = {
    id: productId(sourceUrl, title),
    title,
    description,
    imageUrl,
    sourceUrl,
    price,
    availability,
    variantCount: offers.length || null,
    category: firstString(record.category),
    evidence,
  } satisfies Omit<ImportedProduct, "warnings">;
  return { ...base, warnings: productWarnings(base) };
}

function metaProduct(html: string, pageUrl: URL): ImportedProduct | null {
  const type = metaContent(html, "og:type")?.toLowerCase() ?? "";
  const amount = metaContent(html, "product:price:amount") ?? metaContent(html, "og:price:amount");
  if (!type.includes("product") && !amount && !PRODUCT_PATH_PATTERN.test(pageUrl.pathname)) return null;
  const title = metaContent(html, "og:title") ?? titleFromHtml(html);
  if (!title) return null;
  const sourceUrl = absoluteUrl(metaContent(html, "og:url"), pageUrl) ?? pageUrl.toString();
  const imageUrl = absoluteUrl(metaContent(html, "og:image"), pageUrl);
  const price = makePrice(amount, metaContent(html, "product:price:currency") ?? metaContent(html, "og:price:currency"));
  const availability = normalizeAvailability(metaContent(html, "product:availability"));
  const evidence: ProductEvidence[] = [{ field: "title", sourceUrl, sourceType: "open-graph" }];
  const description = descriptionFromHtml(html);
  if (description) evidence.push({ field: "description", sourceUrl, sourceType: metaContent(html, "og:description") ? "open-graph" : "html-meta" });
  if (imageUrl) evidence.push({ field: "image", sourceUrl, sourceType: "open-graph" });
  if (price) evidence.push({ field: "price", sourceUrl, sourceType: "html-meta" });
  if (availability !== "unknown") evidence.push({ field: "availability", sourceUrl, sourceType: "html-meta" });
  const base = {
    id: productId(sourceUrl, title),
    title,
    description,
    imageUrl,
    sourceUrl,
    price,
    availability,
    variantCount: null,
    category: null,
    evidence,
  } satisfies Omit<ImportedProduct, "warnings">;
  return { ...base, warnings: productWarnings(base) };
}

export function extractProductsFromHtml(html: string, pageUrlValue: string) {
  const pageUrl = new URL(pageUrlValue);
  const products: ImportedProduct[] = [];
  for (const root of jsonLdObjects(html)) {
    walkJson(root, (record) => {
      if (hasSchemaType(record, "Product") || hasSchemaType(record, "ProductGroup")) {
        const product = schemaProduct(record, pageUrl, html);
        if (product) products.push(product);
      }
    });
  }
  if (products.length === 0) {
    const fallback = metaProduct(html, pageUrl);
    if (fallback) products.push(fallback);
  }
  return products;
}

function extractShopifyProducts(payload: string, baseUrl: URL) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as JsonRecord).products)) return [];
  const products: ImportedProduct[] = [];
  for (const rawProduct of (parsed as { products: JsonRecord[] }).products.slice(0, MAX_PRODUCTS)) {
    const title = firstString(rawProduct.title);
    const handle = firstString(rawProduct.handle);
    if (!title || !handle) continue;
    const variants = Array.isArray(rawProduct.variants) ? rawProduct.variants.filter((item): item is JsonRecord => Boolean(item && typeof item === "object")) : [];
    const images = Array.isArray(rawProduct.images) ? rawProduct.images : [];
    const firstVariant = variants[0] ?? {};
    const sourceUrl = new URL(`/products/${encodeURIComponent(handle)}`, baseUrl).toString();
    const price = makePrice(firstVariant.price, "SGD");
    const availableValues = variants.map((variant) => variant.available).filter((value) => typeof value === "boolean");
    const availability: ImportedProduct["availability"] = availableValues.some(Boolean) ? "in_stock" : availableValues.length ? "out_of_stock" : "unknown";
    const firstImage = images[0] && typeof images[0] === "object" ? (images[0] as JsonRecord).src : rawProduct.image;
    const imageUrl = absoluteUrl(firstString(firstImage), baseUrl);
    const description = firstString(rawProduct.body_html);
    const evidence: ProductEvidence[] = [
      { field: "title", sourceUrl, sourceType: "shopify-json" },
      { field: "variants", sourceUrl, sourceType: "shopify-json" },
    ];
    if (price) evidence.push({ field: "price", sourceUrl, sourceType: "shopify-json" });
    if (imageUrl) evidence.push({ field: "image", sourceUrl, sourceType: "shopify-json" });
    if (availability !== "unknown") evidence.push({ field: "availability", sourceUrl, sourceType: "shopify-json" });
    if (description) evidence.push({ field: "description", sourceUrl, sourceType: "shopify-json" });
    const base = {
      id: productId(sourceUrl, title),
      title,
      description,
      imageUrl,
      sourceUrl,
      price,
      availability,
      variantCount: variants.length || null,
      category: firstString(rawProduct.product_type),
      evidence,
    } satisfies Omit<ImportedProduct, "warnings">;
    products.push({ ...base, warnings: productWarnings(base) });
  }
  return products;
}

function detectPlatform(html: string): MerchantImportResult["detectedPlatform"] {
  const normalized = html.toLowerCase();
  if (normalized.includes("cdn.shopify.com") || normalized.includes("shopify.theme") || /myshopify\.com/i.test(html)) return "Shopify";
  if (normalized.includes("woocommerce") || normalized.includes("wp-content/plugins/woocommerce")) return "WooCommerce";
  if (normalized.includes("wixstatic.com") || normalized.includes("wix.com/website/builder")) return "Wix";
  if (normalized.includes("static1.squarespace.com") || normalized.includes("squarespace.com")) return "Squarespace";
  return "Custom / unknown";
}

function extractMerchantName(html: string, url: URL) {
  for (const root of jsonLdObjects(html)) {
    let found: string | null = null;
    walkJson(root, (record) => {
      if (!found && (hasSchemaType(record, "Organization") || hasSchemaType(record, "WebSite"))) found = firstString(record.name);
    });
    if (found) return found;
  }
  const title = metaContent(html, "og:site_name") ?? titleFromHtml(html);
  if (title) return title.split(/\s[|–—-]\s/)[0].trim();
  return url.hostname.replace(/^www\./, "").split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type RobotsRule = {
  directive: "allow" | "disallow";
  pattern: string;
};

export function parseRobots(text: string) {
  const sitemapUrls = [...text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((match) => decodeHtmlEntities(match[1].trim()));
  const lines = text.split(/\r?\n/);
  let currentAgents: string[] = [];
  let groupHasRules = false;
  const rules: RobotsRule[] = [];
  for (const line of lines) {
    const clean = line.replace(/#.*$/, "").trim();
    const userAgent = clean.match(/^user-agent:\s*(.+)$/i)?.[1]?.trim();
    if (userAgent) {
      if (groupHasRules) {
        currentAgents = [];
        groupHasRules = false;
      }
      currentAgents.push(userAgent.toLowerCase());
      continue;
    }
    const match = clean.match(/^(allow|disallow):\s*(.*)$/i);
    if (!match) continue;
    groupHasRules = true;
    const pattern = match[2].trim();
    if (!currentAgents.includes("*") || !pattern) continue;
    rules.push({ directive: match[1].toLowerCase() as RobotsRule["directive"], pattern });
  }
  return { sitemapUrls, rules };
}

function robotsPatternMatches(target: string, pattern: string) {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const expression = body
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}${anchored ? "$" : ""}`).test(target);
}

export function robotsAllows(url: URL, rules: RobotsRule[]) {
  const target = `${url.pathname}${url.search}`;
  const matching = rules
    .filter((rule) => robotsPatternMatches(target, rule.pattern))
    .sort((left, right) => {
      const specificity = (value: RobotsRule) => value.pattern.replace(/[*$]/g, "").length;
      return specificity(right) - specificity(left) || (left.directive === "allow" ? -1 : 1);
    });
  return matching[0]?.directive !== "disallow";
}

function extractLocs(xml: string, baseUrl: URL) {
  return [...xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)]
    .map((match) => absoluteUrl(stripTags(match[1]), baseUrl))
    .filter((value): value is string => Boolean(value));
}

function extractProductLinks(html: string, baseUrl: URL) {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
    const url = absoluteUrl(match[1], baseUrl);
    if (url && new URL(url).hostname === baseUrl.hostname && PRODUCT_PATH_PATTERN.test(new URL(url).pathname)) links.add(url);
  }
  return [...links];
}

function dedupeProducts(products: ImportedProduct[]) {
  const result = new Map<string, ImportedProduct>();
  for (const product of products) {
    const key = `${new URL(product.sourceUrl).pathname.replace(/\/$/, "").toLowerCase()}|${product.title.toLowerCase()}`;
    const existing = result.get(key);
    if (!existing || product.evidence.length > existing.evidence.length) result.set(key, product);
  }
  return [...result.values()].slice(0, MAX_PRODUCTS);
}

async function enrichMissingDescriptions(products: ImportedProduct[]) {
  let pagesRead = 0;
  const missing = products.filter((product) => !product.description?.trim()).slice(0, MAX_PRODUCTS);
  for (let index = 0; index < missing.length; index += 4) {
    const batch = missing.slice(index, index + 4);
    const responses = await Promise.all(batch.map((product) => optionalFetch(new URL(product.sourceUrl))));
    for (let responseIndex = 0; responseIndex < responses.length; responseIndex += 1) {
      const response = responses[responseIndex];
      if (!response) continue;
      pagesRead += 1;
      const description = descriptionFromHtml(response.text);
      if (!description) continue;
      const product = batch[responseIndex];
      product.description = description;
      product.warnings = product.warnings.filter((warning) => warning !== "Description is missing");
      if (!product.evidence.some((evidence) => evidence.field === "description")) {
        product.evidence.push({ field: "description", sourceUrl: product.sourceUrl, sourceType: "html-meta" });
      }
    }
  }
  return pagesRead;
}

function mapSafeFetchError(error: SafeFetchError) {
  if (error.kind === "invalid_url") return new MerchantImportError("invalid_url", error.message);
  if (error.kind === "private_network") return new MerchantImportError("private_network", error.message, "DONE blocks private and local addresses to prevent server-side request forgery.", false);
  if (error.kind === "timeout") return new MerchantImportError("timeout", error.message, "Try again or use a product/category URL from the same merchant.");
  if (error.kind === "blocked") return new MerchantImportError("site_blocked", error.message, `The merchant returned ${error.status ?? "a blocked response"}. DONE does not bypass access controls.`);
  if (error.kind === "unsupported_content") return new MerchantImportError("unsupported_content", error.message);
  return new MerchantImportError("site_unreachable", error.message, error.status ? `HTTP ${error.status}` : undefined);
}

async function optionalFetch(url: URL, options?: Parameters<typeof safeFetchText>[1]) {
  try {
    return await safeFetchText(url, options);
  } catch {
    return null;
  }
}

async function discoverSitemaps(baseUrl: URL, candidates: string[]) {
  const sitemapSources: SafeTextResponse[] = [];
  const queue = [...new Set([...candidates, new URL("/sitemap.xml", baseUrl).toString()])].slice(0, 3);
  for (const value of queue) {
    const candidate = await optionalFetch(new URL(value, baseUrl), { maxBytes: 3_000_000, accept: "application/xml,text/xml,text/plain;q=0.9,*/*;q=0.5" });
    if (candidate) sitemapSources.push(candidate);
  }

  const nested = sitemapSources
    .flatMap((source) => extractLocs(source.text, source.url))
    .filter((url) => /sitemap/i.test(url) && /(product|shop|store)/i.test(url))
    .slice(0, 3);
  for (const value of nested) {
    const candidate = await optionalFetch(new URL(value), { maxBytes: 3_000_000, accept: "application/xml,text/xml,text/plain;q=0.9,*/*;q=0.5" });
    if (candidate) sitemapSources.push(candidate);
  }
  return sitemapSources;
}

export async function importMerchantWebsite(rawUrl: string, onProgress: ProgressCallback): Promise<MerchantImportResult> {
  const startedAt = Date.now();
  emit(onProgress, "validate", "Checking address", "Validating a public merchant URL", 0, 5);

  let inputUrl: URL;
  try {
    inputUrl = await normalizeAndValidatePublicUrl(rawUrl);
  } catch (error) {
    if (error instanceof SafeFetchError) throw mapSafeFetchError(error);
    throw error;
  }

  emit(onProgress, "connect", "Opening storefront", `Connecting to ${inputUrl.hostname}`, 1, 5);
  let homepage: SafeTextResponse;
  try {
    homepage = await safeFetchText(inputUrl);
  } catch (error) {
    if (error instanceof SafeFetchError) throw mapSafeFetchError(error);
    throw error;
  }

  const baseUrl = new URL(homepage.url.origin);
  const robotsUrl = new URL("/robots.txt", baseUrl);
  const robotsResponse = await optionalFetch(robotsUrl, { maxBytes: 400_000, accept: "text/plain,*/*;q=0.5" });
  const robots = robotsResponse ? parseRobots(robotsResponse.text) : { sitemapUrls: [], rules: [] };
  if (!robotsAllows(homepage.url, robots.rules)) {
    throw new MerchantImportError("blocked_by_robots", "This merchant does not permit the importer to read the requested path.", "DONE respects the public robots policy and does not bypass it.", false);
  }

  const platform = detectPlatform(homepage.text);
  emit(onProgress, "discover", "Mapping the catalogue", `${platform} detected · checking public sitemaps and product routes`, 2, 5);
  const sitemapSources = await discoverSitemaps(baseUrl, robots.sitemapUrls);
  const discoveredUrls = new Set<string>(extractProductLinks(homepage.text, homepage.url));
  for (const sitemap of sitemapSources) {
    for (const loc of extractLocs(sitemap.text, sitemap.url)) {
      const url = new URL(loc);
      if (url.hostname === baseUrl.hostname && PRODUCT_PATH_PATTERN.test(url.pathname) && robotsAllows(url, robots.rules)) discoveredUrls.add(url.toString());
    }
  }

  const products: ImportedProduct[] = extractProductsFromHtml(homepage.text, homepage.url.toString());
  let pagesInspected = 1;
  let usedShopifyCatalogue = false;

  if (platform === "Shopify") {
    const shopifyResponse = await optionalFetch(new URL("/products.json?limit=16", baseUrl), { maxBytes: 3_000_000, accept: "application/json,*/*;q=0.5" });
    if (shopifyResponse) {
      products.push(...extractShopifyProducts(shopifyResponse.text, baseUrl));
      pagesInspected += 1;
      usedShopifyCatalogue = true;
    }
  }

  pagesInspected += await enrichMissingDescriptions(products);

  const productUrls = [...discoveredUrls].slice(0, MAX_PRODUCT_PAGES);
  emit(onProgress, "extract", "Reading product evidence", `${productUrls.length || "Available"} public product pages queued`, 3, 5);
  for (let index = 0; index < productUrls.length && products.length < MAX_PRODUCTS; index += 4) {
    const batch = productUrls.slice(index, index + 4);
    const responses = await Promise.all(batch.map((url) => optionalFetch(new URL(url))));
    for (const response of responses) {
      if (!response) continue;
      pagesInspected += 1;
      products.push(...extractProductsFromHtml(response.text, response.url.toString()));
    }
    emit(onProgress, "extract", "Reading product evidence", `${Math.min(index + batch.length, productUrls.length)} of ${productUrls.length} pages inspected`, 3, 5);
  }

  emit(onProgress, "normalize", "Preparing merchant draft", "Normalizing prices, availability, variants, and provenance", 4, 5);
  const normalizedProducts = dedupeProducts(products);
  if (normalizedProducts.length === 0) {
    throw new MerchantImportError(
      "no_products",
      "DONE connected to the site but could not find public product records.",
      "Try a collection or product URL. Sites that render all catalog data behind login or private APIs cannot be imported without an integration.",
    );
  }

  const warnings: string[] = [];
  const needsPrice = normalizedProducts.filter((product) => !product.price).length;
  const needsAvailability = normalizedProducts.filter((product) => product.availability === "unknown").length;
  if (needsPrice) warnings.push(`${needsPrice} ${needsPrice === 1 ? "product needs" : "products need"} price review`);
  if (needsAvailability) warnings.push(`${needsAvailability} ${needsAvailability === 1 ? "product needs" : "products need"} availability review`);
  if (normalizedProducts.length >= MAX_PRODUCTS) warnings.push(`Preview limited to the first ${MAX_PRODUCTS} structured products`);

  const result: MerchantImportResult = {
    importId: randomUUID(),
    inputUrl: rawUrl,
    canonicalUrl: homepage.url.toString(),
    domain: homepage.url.hostname,
    merchantName: extractMerchantName(homepage.text, homepage.url),
    description: metaContent(homepage.text, "og:description") ?? metaContent(homepage.text, "description"),
    detectedPlatform: platform,
    retrievedAt: new Date().toISOString(),
    products: normalizedProducts,
    warnings,
    diagnostics: {
      acquisitionMode: "live-no-store",
      methods: [
        "Live storefront",
        robotsResponse ? "Robots policy" : null,
        sitemapSources.length ? "Sitemap discovery" : null,
        usedShopifyCatalogue ? "Shopify public catalogue" : null,
        productUrls.length ? "Public product pages" : null,
        "Structured data and page metadata",
      ].filter((method): method is string => Boolean(method)),
      homepageStatus: homepage.status,
      robotsUrl: robotsUrl.toString(),
      robotsStatus: robotsResponse?.status ?? null,
      sitemapUrls: sitemapSources.map((source) => source.url.toString()),
      pagesInspected,
      structuredProductsFound: normalizedProducts.length,
      durationMs: Date.now() - startedAt,
    },
  };

  emit(onProgress, "complete", "Draft ready", `${normalizedProducts.length} structured products are ready for review`, 5, 5);
  return result;
}
