import { beforeEach, describe, expect, it } from "vitest";
import { buildDefaultUserConfig } from "@subboost/core/config/defaults";
import { createStore, snapshotKey, tokenIndexKey } from "./store";
import { MemoryKV } from "./test-utils/memory-kv";
import { KEY_SOURCES, TTL_CACHE, TTL_LOCK, TTL_SNAPSHOT } from "./types";

const ENCRYPTION_KEY = "unit-test-encryption-key-0123456789";

function createEnv(): { env: Env; kv: MemoryKV } {
  const kv = new MemoryKV();
  const env = { SUBBOOST_KV: kv as unknown as KVNamespace, ENCRYPTION_KEY } as unknown as Env;
  return { env, kv };
}

describe("createStore sources", () => {
  let kv: MemoryKV;
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    const created = createEnv();
    kv = created.kv;
    store = createStore(created.env);
  });

  it("encrypts payload at rest and decrypts on read", async () => {
    const [saved] = await store.saveSources([
      { name: "remote", kind: "remote", url: "https://example.com/sub?token=abc" },
    ]);
    expect(saved.url).toBe("https://example.com/sub?token=abc");

    const raw = JSON.parse(kv.raw(KEY_SOURCES) as string) as Array<{ payloadEnc: string }>;
    expect(raw).toHaveLength(1);
    expect(raw[0].payloadEnc.startsWith("v1:")).toBe(true);
    expect(raw[0].payloadEnc).not.toContain("example.com");

    const listed = await store.listSources();
    expect(listed[0].url).toBe("https://example.com/sub?token=abc");
  });

  it("stores manual text encrypted and returns manualText", async () => {
    const [saved] = await store.saveSources([
      { name: "manual", kind: "manual", manualText: "ss://abc" },
    ]);
    expect(saved.manualText).toBe("ss://abc");
    expect(saved.url).toBeUndefined();
    const listed = await store.listSources();
    expect(listed[0].manualText).toBe("ss://abc");
  });

  it("deletes snapshots for removed sources and keeps snapshots of retained sources", async () => {
    const [first, second] = await store.saveSources([
      { name: "a", kind: "manual", manualText: "ss://a" },
      { name: "b", kind: "manual", manualText: "ss://b" },
    ]);
    for (const source of [first, second]) {
      await store.putSnapshot({
        sourceId: source.id,
        nodes: [],
        nodeCount: 0,
        fetchedAt: new Date().toISOString(),
        parseErrors: [],
      });
    }
    expect(kv.has(snapshotKey(first.id))).toBe(true);
    expect(kv.has(snapshotKey(second.id))).toBe(true);

    await store.saveSources([{ id: first.id, name: "a", kind: "manual", manualText: "ss://a" }]);
    const remaining = await store.listStoredSources();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(first.id);
    // 被移除源的快照删除，保留源的快照仍在
    expect(kv.has(snapshotKey(second.id))).toBe(false);
    expect(kv.has(snapshotKey(first.id))).toBe(true);
  });

  it("keeps ids stable when inputs carry an id", async () => {
    const [first] = await store.saveSources([{ name: "a", kind: "manual", manualText: "ss://a" }]);
    const [updated] = await store.saveSources([
      { id: first.id, name: "a2", kind: "manual", manualText: "ss://a2" },
    ]);
    expect(updated.id).toBe(first.id);
    expect(updated.createdAt).toBe(first.createdAt);
  });

  it("throws CONFIGURATION_ERROR when ENCRYPTION_KEY is missing", async () => {
    const kvOnly = new MemoryKV();
    const storeWithoutKey = createStore({ SUBBOOST_KV: kvOnly as unknown as KVNamespace } as unknown as Env);
    await expect(storeWithoutKey.listSources()).rejects.toMatchObject({
      status: 503,
      code: "CONFIGURATION_ERROR",
    });
  });
});

describe("createStore subscriptions", () => {
  let kv: MemoryKV;
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    const created = createEnv();
    kv = created.kv;
    store = createStore(created.env);
  });

  it("creates a subscription with a 43-char token and token index", async () => {
    const { dto, token } = await store.createSubscription({ name: "default", sourceIds: [] });
    expect(token).toHaveLength(43);
    expect(dto.link).toBe(`/sub/${token}`);

    const storedRaw = JSON.parse(kv.raw("meta:subs") as string) as Array<{ tokenHash: string; tokenEnc: string }>;
    expect(storedRaw).toHaveLength(1);
    expect(storedRaw[0].tokenEnc.startsWith("v1:")).toBe(true);
    expect(kv.has(tokenIndexKey(storedRaw[0].tokenHash))).toBe(true);

    const found = await store.findSubscriptionByToken(token);
    expect(found?.id).toBe(dto.id);
  });

  it("rotates the token so the old token stops resolving", async () => {
    const { dto, token } = await store.createSubscription({ name: "default", sourceIds: [] });
    const rotated = await store.rotateSubscriptionToken(dto.id, "https://worker.example.com");
    expect(rotated).not.toBeNull();
    expect(rotated?.link.startsWith("https://worker.example.com/sub/")).toBe(true);

    await expect(store.findSubscriptionByToken(token)).resolves.toBeNull();
    const newToken = rotated?.link.split("/sub/")[1] as string;
    await expect(store.findSubscriptionByToken(newToken)).resolves.toMatchObject({ id: dto.id });
  });

  it("deletes subscription, token index and cache", async () => {
    const { dto, token } = await store.createSubscription({ name: "default", sourceIds: [] });
    await store.putCache({
      subscriptionId: dto.id,
      yaml: "proxies: []",
      nodeCount: 0,
      generatedAt: new Date().toISOString(),
      configHash: "hash",
    });
    await expect(store.deleteSubscription(dto.id)).resolves.toBe(true);
    await expect(store.findSubscriptionByToken(token)).resolves.toBeNull();
    await expect(store.getCache(dto.id)).resolves.toBeNull();
  });
});

describe("createStore TTLs and config", () => {
  let kv: MemoryKV;
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    const created = createEnv();
    kv = created.kv;
    store = createStore(created.env);
  });

  it("uses the documented TTLs", async () => {
    await store.putSnapshot({
      sourceId: "s1",
      nodes: [],
      nodeCount: 0,
      fetchedAt: new Date().toISOString(),
      parseErrors: [],
    });
    await store.putCache({
      subscriptionId: "sub1",
      yaml: "proxies: []",
      nodeCount: 0,
      generatedAt: new Date().toISOString(),
      configHash: "h",
    });
    await store.acquireLock("owner");

    expect(kv.expirationTtls.get(snapshotKey("s1"))).toBe(TTL_SNAPSHOT);
    expect(kv.expirationTtls.get("cache:sub1")).toBe(TTL_CACHE);
    expect(kv.expirationTtls.get("meta:refresh-lock")).toBe(TTL_LOCK);
  });

  it("returns the standard default config when unset", async () => {
    const result = await store.getConfig();
    expect(result.isDefault).toBe(true);
    expect(result.config).toEqual(buildDefaultUserConfig("standard"));
  });

  it("round-trips a custom config and resets to default", async () => {
    await store.putConfig({ mixedPort: 1234 });
    const stored = await store.getConfig();
    expect(stored.isDefault).toBe(false);
    expect(stored.config.mixedPort).toBe(1234);
    await store.resetConfig();
    const reset = await store.getConfig();
    expect(reset.isDefault).toBe(true);
  });

  it("acquires and releases the refresh lock", async () => {
    await expect(store.acquireLock("a")).resolves.toBe(true);
    await expect(store.acquireLock("b")).resolves.toBe(false);
    await store.releaseLock("b");
    await expect(store.acquireLock("b")).resolves.toBe(false);
    await store.releaseLock("a");
    await expect(store.acquireLock("b")).resolves.toBe(true);
  });
});

