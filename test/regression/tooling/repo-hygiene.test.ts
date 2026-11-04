import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requireCjs = createRequire(import.meta.url);
const hygiene = requireCjs("../../../scripts/check-repo-hygiene.cjs") as {
  scanTextForSecrets: (content: string) => Array<{ rule: string; hint: string; value: string }>;
  extractKvNamespaceIds: (configText: string) => string[];
  findConcreteKvNamespaceId: (configText: string) => string | null;
  isSkippedFile: (relativePath: string) => boolean;
};

// 构造的测试值，故意模仿真实随机串的形态（不含任何真实密钥或资源 id）
const FAKE_RANDOM = "Qz7!mWp4#Rt9&vBx2$Ln6";
const CONCRETE_ID = "00112233445566778899aabbccddeeff";

describe("scanTextForSecrets", () => {
  it("detects an unquoted env-style secret", () => {
    const hits = hygiene.scanTextForSecrets(`ENCRYPTION_KEY=${FAKE_RANDOM}`);
    expect(hits).toHaveLength(1);
    expect(hits[0].value).toBe(FAKE_RANDOM);
  });

  it("detects a JSON-style secret", () => {
    const hits = hygiene.scanTextForSecrets(`{ "ADMIN_TOKEN": "${FAKE_RANDOM}" }`);
    expect(hits).toHaveLength(1);
    expect(hits[0].value).toBe(FAKE_RANDOM);
  });

  it("detects a TS-style secret assignment", () => {
    const hits = hygiene.scanTextForSecrets(`const ADMIN_TOKEN = "${FAKE_RANDOM}";`);
    expect(hits).toHaveLength(1);
  });

  it("ignores placeholders, test fixtures and doc command snippets", () => {
    const harmless = [
      `ADMIN_TOKEN=replace-with-at-least-32-random-chars`,
      `ENCRYPTION_KEY="index-test-key-0123456789abcdef"`,
      `ENCRYPTION_KEY=Qz7!mWp4#Rt9&vBx2$Ln6-${"x".repeat(4)}-fixture`,
      `ADMIN_TOKEN="$(node -e "console.log(require('node:crypto').randomBytes(32))")"`,
      `ADMIN_TOKEN=<32 位以上随机串>`,
    ];
    for (const content of harmless) {
      expect(hygiene.scanTextForSecrets(content)).toEqual([]);
    }
  });

  it("detects GitHub, AWS, OpenAI style tokens and private keys", () => {
    expect(hygiene.scanTextForSecrets(`token ghp_${"a".repeat(30)}`)).toHaveLength(1);
    expect(hygiene.scanTextForSecrets(`key AKIA${"B".repeat(16)}`)).toHaveLength(1);
    expect(hygiene.scanTextForSecrets(`sk-${"c".repeat(24)}`)).toHaveLength(1);
    expect(
      hygiene.scanTextForSecrets("-----BEGIN RSA PRIVATE KEY-----")
    ).toHaveLength(1);
  });

  it("returns nothing for ordinary configuration text", () => {
    expect(hygiene.scanTextForSecrets(`"vars": { "APP_NAME": "SubBoost Lite" }`)).toEqual([]);
  });
});

describe("extractKvNamespaceIds", () => {
  it("reads the id and ignores comment lines", () => {
    const config = [
      `{`,
      `  // "id": "${CONCRETE_ID}" 只是注释示例`,
      `  "kv_namespaces": [{ "binding": "SUBBOOST_KV", "id": "REPLACE_WITH_KV_NAMESPACE_ID" }]`,
      `}`,
    ].join("\n");
    expect(hygiene.extractKvNamespaceIds(config)).toEqual(["REPLACE_WITH_KV_NAMESPACE_ID"]);
  });
});

describe("findConcreteKvNamespaceId", () => {
  it("returns null while the config keeps the placeholder", () => {
    expect(
      hygiene.findConcreteKvNamespaceId(`{ "id": "REPLACE_WITH_KV_NAMESPACE_ID" }`)
    ).toBeNull();
  });

  it("returns the real id once it leaks into the config", () => {
    expect(hygiene.findConcreteKvNamespaceId(`{ "id": "${CONCRETE_ID}" }`)).toBe(CONCRETE_ID);
  });
});

describe("isSkippedFile", () => {
  it("skips tests, lockfile and binary-ish paths", () => {
    expect(hygiene.isSkippedFile("worker/src/store.test.ts")).toBe(true);
    expect(hygiene.isSkippedFile("package-lock.json")).toBe(true);
    expect(hygiene.isSkippedFile("docs/assets/logo.png")).toBe(true);
  });

  it("keeps scanning real source and docs", () => {
    expect(hygiene.isSkippedFile("wrangler.jsonc")).toBe(false);
    expect(hygiene.isSkippedFile("worker/src/store.ts")).toBe(false);
    expect(hygiene.isSkippedFile("worker/README.md")).toBe(false);
    expect(hygiene.isSkippedFile(".dev.vars.example")).toBe(false);
  });
});
