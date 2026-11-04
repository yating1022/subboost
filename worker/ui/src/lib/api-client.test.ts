import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";

describe("createApiClient", () => {
  it("attaches the Bearer token and parses JSON", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer abc");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const client = createApiClient({
      getToken: () => "abc",
      onUnauthorized: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.get<{ ok: boolean }>("/api/state")).resolves.toEqual({ ok: true });
  });

  it("omits the Authorization header when there is no token", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["Authorization"]).toBeUndefined();
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const client = createApiClient({
      getToken: () => null,
      onUnauthorized: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.get("/api/health");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("calls onUnauthorized and throws on 401", async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), { status: 401 })
    );
    const client = createApiClient({
      getToken: () => "bad",
      onUnauthorized,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.get("/api/state")).rejects.toThrow("Unauthorized");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("surfaces the server error message for other failures", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "第 1 个源：目标地址不允许", code: "VALIDATION_ERROR" }), {
          status: 400,
        })
    );
    const client = createApiClient({
      getToken: () => "t",
      onUnauthorized: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      client.send("PUT", "/api/sources", { sources: [] })
    ).rejects.toThrow("第 1 个源：目标地址不允许");
  });

  it("sends a JSON body with content-type for write requests", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PUT");
      expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
      expect(init?.body).toBe(JSON.stringify({ sources: [] }));
      return new Response(JSON.stringify({ sources: [] }), { status: 200 });
    });
    const client = createApiClient({
      getToken: () => "t",
      onUnauthorized: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.send("PUT", "/api/sources", { sources: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns undefined for 204 responses", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const client = createApiClient({
      getToken: () => "t",
      onUnauthorized: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.send("DELETE", "/api/subscriptions/1")).resolves.toBeUndefined();
  });
});
