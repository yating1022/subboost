import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { BODY_LIMITS, error, json, readJsonBody, withSecurityHeaders } from "./http";

function jsonRequest(body: string, contentLength?: number): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (contentLength !== undefined) headers["content-length"] = String(contentLength);
  return new Request("https://example.com/api/x", { method: "PUT", headers, body });
}

describe("json", () => {
  it("sets cache-control no-store and json content-type", async () => {
    const response = json({ ok: true }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("error", () => {
  it("serializes ApiError via buildApiErrorBody", async () => {
    const response = error(new ApiError(401, "UNAUTHORIZED", "Unauthorized"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });
});

describe("withSecurityHeaders", () => {
  it("adds nosniff and referrer-policy", () => {
    const response = withSecurityHeaders(new Response("x"));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("readJsonBody", () => {
  it("throws PAYLOAD_TOO_LARGE when content-length exceeds limit", async () => {
    const request = jsonRequest(JSON.stringify({ a: 1 }), BODY_LIMITS.small + 1);
    await expect(readJsonBody(request, BODY_LIMITS.small)).rejects.toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("throws PAYLOAD_TOO_LARGE when the stream exceeds limit without content-length", async () => {
    const payload = "x".repeat(2048);
    const request = jsonRequest(JSON.stringify({ payload }));
    await expect(readJsonBody(request, 100)).rejects.toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("throws BAD_REQUEST on invalid JSON", async () => {
    const request = jsonRequest("{not json");
    await expect(readJsonBody(request, BODY_LIMITS.small)).rejects.toMatchObject({
      status: 400,
      code: "BAD_REQUEST",
    });
  });

  it("returns {} for an empty body", async () => {
    const request = new Request("https://example.com/api/x", { method: "PUT" });
    await expect(readJsonBody(request, BODY_LIMITS.small)).resolves.toEqual({});
  });

  it("parses a valid JSON object", async () => {
    const request = jsonRequest(JSON.stringify({ a: 1 }));
    await expect(readJsonBody(request, BODY_LIMITS.small)).resolves.toEqual({ a: 1 });
  });
});
