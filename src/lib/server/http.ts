import "server-only";

export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024; // 1 MB
export const AUTH_MAX_BODY_BYTES = 16 * 1024; // 16 KB
export const BACKUP_MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Reads and parses a JSON request body, enforcing a byte limit while streaming
 * so an oversized payload is never fully buffered. Returns a 413/400 Response
 * on failure, which route handlers should return directly.
 */
export async function readJson<T>(
  request: Request,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<T | Response> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return Response.json({ error: "Request body too large" }, { status: 413 });
  }
  if (!request.body) {
    return Response.json({ error: "Request body required" }, { status: 400 });
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return Response.json({ error: "Request body too large" }, { status: 413 });
    }
    chunks.push(value);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
