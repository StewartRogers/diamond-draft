import { describe, it, expect } from "vitest";
import { readJson } from "@/lib/server/http";

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/x", { method: "POST", body, headers });
}

describe("readJson", () => {
  it("parses a valid JSON body", async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 });
  });

  it("returns 400 for malformed JSON", async () => {
    const res = await readJson(post("{not json"));
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
  });

  it("returns 413 when the streamed body exceeds the limit", async () => {
    const res = await readJson(post(JSON.stringify({ s: "x".repeat(200) })), 100);
    expect((res as Response).status).toBe(413);
  });

  it("returns 413 when Content-Length declares an oversized body", async () => {
    const res = await readJson(post("{}", { "content-length": "999999999" }), 100);
    expect((res as Response).status).toBe(413);
  });

  it("returns 400 when there is no body", async () => {
    const res = await readJson(new Request("http://localhost/api/x", { method: "POST" }));
    expect((res as Response).status).toBe(400);
  });
});
