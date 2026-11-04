import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireCjs = createRequire(import.meta.url);
const deployConfig = requireCjs("../../../scripts/lib/deploy-config.cjs") as {
  KV_ID_PLACEHOLDER: string;
  MIN_SECRET_LENGTH: number;
  readRequiredSecrets: (env?: Record<string, string>) => {
    values: Record<string, string>;
    problems: string[];
  };
  injectKvNamespaceId: (configText: string, namespaceId: string) => string;
  assertKvNamespaceInjected: (configText: string, namespaceId: string) => string;
  pickNamespaceId: (namespaces: unknown, title?: string) => string | null;
  parseNamespaceList: (jsonText: string) => unknown[] | null;
  buildSecretPayload: (values?: Record<string, string>) => string;
};

const VALID_ID = "0123456789abcdef0123456789abcdef";
const CONFIG = `{\n  "kv_namespaces": [{ "binding": "SUBBOOST_KV", "id": "${deployConfig.KV_ID_PLACEHOLDER}" }]\n}`;
const VALID_SECRET = "a".repeat(32);

describe("readRequiredSecrets", () => {
  it("accepts trimmed values that meet the length floor", () => {
    const { values, problems } = deployConfig.readRequiredSecrets({
      ADMIN_TOKEN: `  ${VALID_SECRET}  `,
      ENCRYPTION_KEY: "b".repeat(40),
    });
    expect(problems).toEqual([]);
    expect(values.ADMIN_TOKEN).toBe(VALID_SECRET);
    expect(values.ENCRYPTION_KEY).toBe("b".repeat(40));
  });

  it("reports missing, short and placeholder values together", () => {
    const { values, problems } = deployConfig.readRequiredSecrets({
      ADMIN_TOKEN: "short",
      ENCRYPTION_KEY: "replace-with-at-least-32-random-chars-xxxxxxxx",
    });
    expect(values).toEqual({});
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("ADMIN_TOKEN");
    expect(problems[0]).toContain("长度不足");
    expect(problems[1]).toContain("示例占位值");
  });

  it("flags every missing variable when the environment is empty", () => {
    const { problems } = deployConfig.readRequiredSecrets({});
    expect(problems).toHaveLength(2);
    expect(problems.every((item) => item.startsWith("缺少环境变量"))).toBe(true);
  });
});

describe("injectKvNamespaceId", () => {
  it("replaces the placeholder with the real id", () => {
    const injected = deployConfig.injectKvNamespaceId(CONFIG, VALID_ID);
    expect(injected).toContain(VALID_ID);
    expect(injected).not.toContain(deployConfig.KV_ID_PLACEHOLDER);
  });

  it("rejects malformed ids", () => {
    expect(() => deployConfig.injectKvNamespaceId(CONFIG, "not-an-id")).toThrow(/格式不正确/);
    expect(() => deployConfig.injectKvNamespaceId(CONFIG, "")).toThrow(/格式不正确/);
  });

  it("rejects configs without the placeholder", () => {
    expect(() => deployConfig.injectKvNamespaceId(`{ "name": "x" }`, VALID_ID)).toThrow(/占位符/);
    expect(() => deployConfig.injectKvNamespaceId("", VALID_ID)).toThrow(/为空/);
  });
});

describe("assertKvNamespaceInjected", () => {
  it("passes when the id is present and the placeholder is gone", () => {
    const injected = deployConfig.injectKvNamespaceId(CONFIG, VALID_ID);
    expect(deployConfig.assertKvNamespaceInjected(injected, VALID_ID)).toBe(injected);
  });

  it("fails when the placeholder survives", () => {
    expect(() => deployConfig.assertKvNamespaceInjected(CONFIG, VALID_ID)).toThrow(/残留/);
  });

  it("fails when the id is missing from the result", () => {
    expect(() => deployConfig.assertKvNamespaceInjected(`{ "name": "x" }`, VALID_ID)).toThrow(
      /未包含/
    );
  });
});

describe("pickNamespaceId", () => {
  it("returns the id matching the configured title", () => {
    const namespaces = [
      { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", title: "OTHER" },
      { id: VALID_ID, title: "SUBBOOST_KV" },
    ];
    expect(deployConfig.pickNamespaceId(namespaces)).toBe(VALID_ID);
    expect(deployConfig.pickNamespaceId(namespaces, "OTHER")).toBe("a".repeat(32));
  });

  it("returns null when nothing matches or the input is not a list", () => {
    expect(deployConfig.pickNamespaceId([], "SUBBOOST_KV")).toBeNull();
    expect(deployConfig.pickNamespaceId(null)).toBeNull();
    expect(deployConfig.pickNamespaceId([{ title: "SUBBOOST_KV" }])).toBeNull();
  });
});

describe("parseNamespaceList", () => {
  it("parses wrangler's JSON array output", () => {
    const parsed = deployConfig.parseNamespaceList(`[{"id":"${VALID_ID}","title":"SUBBOOST_KV"}]`);
    expect(Array.isArray(parsed)).toBe(true);
    expect((parsed as Array<{ id: string }>)[0].id).toBe(VALID_ID);
  });

  it("returns null for non-JSON or non-array payloads", () => {
    expect(deployConfig.parseNamespaceList("not json")).toBeNull();
    expect(deployConfig.parseNamespaceList(`{"id":"${VALID_ID}"}`)).toBeNull();
  });
});

describe("buildSecretPayload", () => {
  it("serializes only the non-empty required secrets", () => {
    const payload = JSON.parse(
      deployConfig.buildSecretPayload({ ADMIN_TOKEN: VALID_SECRET, ENCRYPTION_KEY: "", EXTRA: "x" })
    ) as Record<string, string>;
    expect(payload).toEqual({ ADMIN_TOKEN: VALID_SECRET });
  });

  it("produces a JSON object even when nothing is provided", () => {
    expect(deployConfig.buildSecretPayload()).toBe("{}");
  });
});
