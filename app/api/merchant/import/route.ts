import { importMerchantWebsite, MerchantImportError } from "@/lib/merchant/importer";
import type { ImportProgressEvent } from "@/lib/merchant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorEvent(error: unknown): Extract<ImportProgressEvent, { type: "error" }> {
  if (error instanceof MerchantImportError) {
    return {
      type: "error",
      code: error.code,
      message: error.message,
      detail: error.detail,
      recoverable: error.recoverable,
    };
  }
  return {
    type: "error",
    code: "server_error",
    message: "The importer hit an unexpected error.",
    detail: error instanceof Error ? error.message : "Unknown server error",
    recoverable: true,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const url = body && typeof body === "object" && "url" in body ? String((body as { url: unknown }).url ?? "") : "";
  if (!url.trim()) return Response.json({ error: "A merchant URL is required." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ImportProgressEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      void importMerchantWebsite(url, send)
        .then((result) => send({ type: "complete", result }))
        .catch((error) => send(errorEvent(error)))
        .finally(() => controller.close());
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

