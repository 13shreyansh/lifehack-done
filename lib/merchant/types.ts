export type ImportStageId =
  | "validate"
  | "connect"
  | "discover"
  | "extract"
  | "normalize"
  | "complete";

export type ImportErrorCode =
  | "invalid_url"
  | "private_network"
  | "blocked_by_robots"
  | "site_unreachable"
  | "site_blocked"
  | "timeout"
  | "unsupported_content"
  | "no_products"
  | "server_error";

export type ImportProgressEvent =
  | {
      type: "progress";
      stage: ImportStageId;
      label: string;
      detail: string;
      completed: number;
      total: number;
    }
  | { type: "complete"; result: MerchantImportResult }
  | {
      type: "error";
      code: ImportErrorCode;
      message: string;
      detail?: string;
      recoverable: boolean;
    };

export type ProductEvidence = {
  field: "title" | "description" | "image" | "price" | "availability" | "variants";
  sourceUrl: string;
  sourceType: "json-ld" | "open-graph" | "shopify-json" | "html-meta";
};

export type ImportedPrice = {
  amount: number;
  currency: string;
  display: string;
};

export type ImportedProduct = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  price: ImportedPrice | null;
  availability: "in_stock" | "out_of_stock" | "preorder" | "backorder" | "unknown";
  variantCount: number | null;
  category: string | null;
  evidence: ProductEvidence[];
  warnings: string[];
};

export type ImportDiagnostics = {
  acquisitionMode: "live-no-store";
  methods: string[];
  homepageStatus: number;
  robotsUrl: string;
  robotsStatus: number | null;
  sitemapUrls: string[];
  pagesInspected: number;
  structuredProductsFound: number;
  durationMs: number;
};

export type MerchantImportResult = {
  importId: string;
  inputUrl: string;
  canonicalUrl: string;
  domain: string;
  merchantName: string;
  description: string | null;
  detectedPlatform: "Shopify" | "WooCommerce" | "Wix" | "Squarespace" | "Custom / unknown";
  retrievedAt: string;
  products: ImportedProduct[];
  warnings: string[];
  diagnostics: ImportDiagnostics;
};
