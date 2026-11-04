import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireCjs = createRequire(import.meta.url);
const runner = requireCjs("../../../scripts/lib/deploy-runner.cjs") as {
  ensureKvNamespace: (input: {
    deps: any;
    kvTitle?: string;
    explicitId?: string;
    log?: (message: string) => void;
  }) => Promise<{ id: string; created: boolean }>;
  runDeploy: (input: {
    deps: any;
    env?: Record<string, string>;
    dryRun?: boolean;
    kvTitle?: string;
    log?: (message: string) => void;
  }) => Promise<{ namespaceId: string; created: boolean; secretsUploaded: boolean }>;
};

const KV_ID = "0123456789abcdef0123456789abcdef";
const OTHER_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SECRET = "s".repeat(32);
const CONFIG_WITH_PLACEHOLDER = `{ "kv_namespaces": [{ "binding": "SUBBOOST_KV", "id": "REPLACE_WITH_KV_NAMESPACE_ID" }] }`;
const LIST_OUTPUT = JSON.stringify([{ id: OTHER_ID, title: "OTHER" }]);

function makeDeps(overrides: Record<string, unknown> = {}) {
  const written: string[] = [];
  return {
    written,
    deps: {
      configPath: ".wrangler.deploy.jsonc",
      listNamespaces: vi.fn(async () => LIST_OUTPUT),
      createNamespace: vi.fn(async () => {}),
      readConfig: vi.fn(() => CONFIG_WITH_PLACEHOLDER),
      writeConfig: vi.fn((text: string) => written.push(text)),
      removeConfig: vi.fn(() => {}),
      uploadSecrets: vi.fn(async () => {}),
      deploy: vi.fn(async () => {}),
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ensureKvNamespace", () => {
  it("uses the explicit id without touching Cloudflare", async () => {
    const { deps } = makeDeps();
    const result = await runner.ensureKvNamespace({ deps, explicitId: KV_ID, log: () => {} });
    expect(result).toEqual({ id: KV_ID, created: false });
    expect(deps.listNamespaces).not.toHaveBeenCalled();
    expect(deps.createNamespace).not.toHaveBeenCalled();
  });

  it("reuses an existing namespace with the configured title", async () => {
    const { deps } = makeDeps({
      listNamespaces: vi.fn(async () => JSON.stringify([{ id: KV_ID, title: "SUBBOOST_KV" }])),
    });
    const result = await runner.ensureKvNamespace({ deps, kvTitle: "SUBBOOST_KV", log: () => {} });
    expect(result).toEqual({ id: KV_ID, created: false });
    expect(deps.createNamespace).not.toHaveBeenCalled();
  });

  it("creates the namespace when the title is missing, then reads back its id", async () => {
    const listNamespaces = vi
      .fn()
      .mockResolvedValueOnce(LIST_OUTPUT)
      .mockResolvedValueOnce(JSON.stringify([{ id: KV_ID, title: "SUBBOOST_KV" }]));
    const { deps } = makeDeps({ listNamespaces });
    const result = await runner.ensureKvNamespace({ deps, kvTitle: "SUBBOOST_KV", log: () => {} });
    expect(result).toEqual({ id: KV_ID, created: true });
    expect(deps.createNamespace).toHaveBeenCalledWith("SUBBOOST_KV");
  });

  it("fails when the created namespace cannot be read back", async () => {
    const { deps } = makeDeps();
    await expect(
      runner.ensureKvNamespace({ deps, kvTitle: "SUBBOOST_KV", log: () => {} })
    ).rejects.toThrow(/读不到它的 id/);
  });

  it("fails when wrangler returns unparsable output", async () => {
    const { deps } = makeDeps({ listNamespaces: vi.fn(async () => "not json") });
    await expect(
      runner.ensureKvNamespace({ deps, kvTitle: "SUBBOOST_KV", log: () => {} })
    ).rejects.toThrow(/无法解析 KV namespace 列表输出/);
  });
});

describe("runDeploy", () => {
  it("injects the id, uploads secrets and deploys, then removes the generated config", async () => {
    const { deps, written } = makeDeps({
      listNamespaces: vi.fn(async () => JSON.stringify([{ id: KV_ID, title: "SUBBOOST_KV" }])),
    });
    const result = await runner.runDeploy({
      deps,
      env: { ADMIN_TOKEN: SECRET, ENCRYPTION_KEY: "k".repeat(32) },
      kvTitle: "SUBBOOST_KV",
    });

    expect(result).toEqual({ namespaceId: KV_ID, created: false, secretsUploaded: true });
    expect(written[0]).toContain(KV_ID);
    expect(written[0]).not.toContain("REPLACE_WITH_KV_NAMESPACE_ID");
    expect(deps.uploadSecrets).toHaveBeenCalledTimes(1);
    expect(JSON.parse(deps.uploadSecrets.mock.calls[0][0])).toEqual({
      ADMIN_TOKEN: SECRET,
      ENCRYPTION_KEY: "k".repeat(32),
    });
    expect(deps.deploy).toHaveBeenCalledWith(".wrangler.deploy.jsonc", { dryRun: false });
    expect(deps.removeConfig).toHaveBeenCalledTimes(1);
  });

  it("still removes the generated config when deploy fails", async () => {
    const { deps } = makeDeps({
      listNamespaces: vi.fn(async () => JSON.stringify([{ id: KV_ID, title: "SUBBOOST_KV" }])),
      deploy: vi.fn(async () => {
        throw new Error("部署失败。");
      }),
    });
    await expect(
      runner.runDeploy({
        deps,
        env: { ADMIN_TOKEN: SECRET, ENCRYPTION_KEY: "k".repeat(32) },
        kvTitle: "SUBBOOST_KV",
      })
    ).rejects.toThrow(/部署失败/);
    expect(deps.removeConfig).toHaveBeenCalledTimes(1);
  });

  it("rejects missing secrets before touching any resource", async () => {
    const { deps } = makeDeps();
    await expect(runner.runDeploy({ deps, env: {}, kvTitle: "SUBBOOST_KV" })).rejects.toThrow(
      /密钥校验未通过/
    );
    expect(deps.listNamespaces).not.toHaveBeenCalled();
    expect(deps.createNamespace).not.toHaveBeenCalled();
  });

  it("skips secret upload when SUBBOOST_SKIP_SECRETS=1", async () => {
    const { deps } = makeDeps({
      listNamespaces: vi.fn(async () => JSON.stringify([{ id: KV_ID, title: "SUBBOOST_KV" }])),
    });
    const result = await runner.runDeploy({
      deps,
      env: { SUBBOOST_SKIP_SECRETS: "1" },
      kvTitle: "SUBBOOST_KV",
    });
    expect(result.secretsUploaded).toBe(false);
    expect(deps.uploadSecrets).not.toHaveBeenCalled();
    expect(deps.deploy).toHaveBeenCalledTimes(1);
  });

  it("skips secret upload and passes --dry-run through on dry runs", async () => {
    const { deps } = makeDeps({
      listNamespaces: vi.fn(async () => JSON.stringify([{ id: KV_ID, title: "SUBBOOST_KV" }])),
    });
    await runner.runDeploy({ deps, env: {}, dryRun: true, kvTitle: "SUBBOOST_KV" });
    expect(deps.uploadSecrets).not.toHaveBeenCalled();
    expect(deps.deploy).toHaveBeenCalledWith(".wrangler.deploy.jsonc", { dryRun: true });
  });

  it("propagates config problems from readConfig", async () => {
    const { deps } = makeDeps({
      listNamespaces: vi.fn(async () => JSON.stringify([{ id: KV_ID, title: "SUBBOOST_KV" }])),
      readConfig: vi.fn(() => `{ "name": "no-placeholder" }`),
    });
    await expect(
      runner.runDeploy({ deps, env: { SUBBOOST_SKIP_SECRETS: "1" }, kvTitle: "SUBBOOST_KV" })
    ).rejects.toThrow(/占位符/);
    expect(deps.deploy).not.toHaveBeenCalled();
  });

  it("tolerates a failing cleanup without masking the deploy result", async () => {
    const { deps } = makeDeps({
      listNamespaces: vi.fn(async () => JSON.stringify([{ id: KV_ID, title: "SUBBOOST_KV" }])),
      removeConfig: vi.fn(() => {
        throw new Error("文件被占用");
      }),
    });
    const result = await runner.runDeploy({
      deps,
      env: { SUBBOOST_SKIP_SECRETS: "1" },
      kvTitle: "SUBBOOST_KV",
    });
    expect(result.namespaceId).toBe(KV_ID);
  });
});
