import { describe, expect, it, vi } from "vitest";
import { buildWorkerDeps, handleRequest, handleScheduled } from "./index";
import { createStore } from "./store";
import { MemoryKV } from "./test-utils/memory-kv";
import type { PipelineDeps } from "./pipeline";

const ADMIN_TOKEN = "index-admin-token";
const ENCRYPTION_KEY = "index-test-key-0123456789";

function createEnv(): { env: Env; kv: MemoryKV; store: ReturnType<typeof createStore> } {
  const kv = new MemoryKV();
  const env = {
    SUBBOOST_KV: kv as unknown as KVNamespace,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher,
    ADMIN_TOKEN,
    ENCRYPTION_KEY,
    APP_NAME: "SubBoost Lite",
  } as unknown as Env;
  return { env, kv, store: createStore(env) };
}

describe("handleRequest", () => {
  it("returns 200 for /api/health", async () => {
    const { env } = createEnv();
    const response = await handleRequest(new Request("https://worker.example.com/api/health"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns 500 INTERNAL_ERROR for a non-ApiError failure", async () => {
    const { env, store } = createEnv();
    const pipeline = {
      store: {
        ...store,
        getConfig: async () => {
          throw new Error("boom");
        },
      },
      fetchText: (async () => ({ status: 200, headers: {}, text: "", finalUrl: "" })) as unknown as PipelineDeps["fetchText"],
      now: () => new Date(),
      defaultUserAgent: "mihomo/test",
    } as unknown as PipelineDeps;

    const response = await handleRequest(
      new Request("https://worker.example.com/api/state", {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      }),
      env,
      { pipeline }
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal error", code: "INTERNAL_ERROR" });
  });
});

describe("handleScheduled", () => {
  it("records the cron trigger", async () => {
    const { env, store } = createEnv();
    const fetchText = vi.fn(async () => ({ status: 200, headers: {}, text: "", finalUrl: "" }));
    await handleScheduled(env, {
      pipeline: {
        store,
        fetchText: fetchText as unknown as PipelineDeps["fetchText"],
        now: () => new Date("2026-10-12T00:00:00.000Z"),
        defaultUserAgent: "mihomo/test",
      },
    });
    const status = await store.getStatus();
    expect(status?.lastTrigger).toBe("cron");
  });

  it("swallows refresh failures", async () => {
    const { env, store } = createEnv();
    const pipeline = {
      ...{},
      store: {
        ...store,
        acquireLock: async () => {
          throw new Error("lock failure");
        },
      },
      fetchText: (async () => ({ status: 200, headers: {}, text: "", finalUrl: "" })) as unknown as PipelineDeps["fetchText"],
      now: () => new Date(),
      defaultUserAgent: "mihomo/test",
    } as unknown as PipelineDeps;

    await expect(handleScheduled(env, { pipeline })).resolves.toBeUndefined();
  });
});

describe("buildWorkerDeps", () => {
  it("forwards the source user agent as a User-Agent header", async () => {
    const { env } = createEnv();
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("proxies: []", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const deps = buildWorkerDeps(env);
      expect(deps.pipeline).toBeDefined();
      await deps.pipeline!.fetchText("https://subscription.example.com/sub", {
        userAgent: "mihomo/1.19.24",
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const init = fetchSpy.mock.calls[0][1];
      expect(new Headers(init?.headers).get("user-agent")).toBe("mihomo/1.19.24");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
