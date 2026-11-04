import { describe, expect, it, vi } from "vitest";
import { SUBSCRIPTION_IMPORT_USER_AGENTS } from "@subboost/server-core/subscription/user-agents";
import { refreshSource, sanitizeErrorMessage } from "./sources";
import { ResponseTooLargeError, type fetchText } from "./safe-fetch";
import type { SourceDto } from "./types";

const SS = "ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ@example.com:8388#NodeA";
const SS2 = "ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ@example.com:8389#NodeB";
const TROJAN = "trojan://pass@example.com:443?sni=example.com#TJ";
const VMESS = "vmess://eyJ2IjoiMiIsInBzIjoiVk0iLCJhZGQiOiJleGFtcGxlLmNvbSIsInBvcnQiOiI0NDMiLCJpZCI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsImFpZCI6IjAiLCJuZXQiOiJ3cyIsInR5cGUiOiJub25lIiwiaG9zdCI6IiIsInBhdGgiOiIvd3MiLCJ0bHMiOiJ0bHMifQ==";
const CLASH_YAML = `proxies:\n  - name: YAMLNode\n    type: ss\n    server: example.com\n    port: 8388\n    cipher: aes-256-gcm\n    password: secret\n`;

function source(overrides: Partial<SourceDto>): SourceDto {
  return {
    id: "s1",
    name: "src",
    kind: "remote",
    enabled: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  } as SourceDto;
}

function deps(fetchTextImpl: unknown) {
  return {
    fetchText: fetchTextImpl as unknown as typeof fetchText,
    defaultUserAgent: "mihomo/default",
    now: () => new Date("2026-10-12T00:00:00.000Z"),
  };
}

describe("refreshSource remote", () => {
  it("parses a base64 ss list and reads subscription-userinfo", async () => {
    const fetchTextImpl = vi.fn(async () => ({
      status: 200,
      headers: { "subscription-userinfo": "upload=1; download=2; total=3; expire=1900000000" },
      text: Buffer.from(`${SS}\n${SS2}`).toString("base64"),
      finalUrl: "https://example.com/sub",
    }));
    const result = await refreshSource(
      source({ url: "https://example.com/sub" }),
      deps(fetchTextImpl)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.nodeCount).toBe(2);
    expect(result.snapshot.userInfo).toEqual({
      upload: 1,
      download: 2,
      total: 3,
      expire: 1900000000,
    });
    expect(result.snapshot.fetchedAt).toBe("2026-10-12T00:00:00.000Z");
  });

  it("parses Clash YAML proxies", async () => {
    const fetchTextImpl = vi.fn(async () => ({
      status: 200,
      headers: {},
      text: CLASH_YAML,
      finalUrl: "https://example.com/clash",
    }));
    const result = await refreshSource(
      source({ url: "https://example.com/clash" }),
      deps(fetchTextImpl)
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.nodeCount).toBe(1);
    expect(result.snapshot.nodes[0].type).toBe("ss");
  });

  it("fails when the upstream returns an empty body", async () => {
    const fetchTextImpl = vi.fn(async () => ({
      status: 200,
      headers: {},
      text: "",
      finalUrl: "https://example.com/empty",
    }));
    const result = await refreshSource(
      source({ url: "https://example.com/empty" }),
      deps(fetchTextImpl)
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
    expect(result.error.length).toBeLessThanOrEqual(200);
  });

  it("fails on non-2xx status", async () => {
    const fetchTextImpl = vi.fn(async () => ({
      status: 404,
      headers: {},
      text: "not found",
      finalUrl: "https://example.com/x",
    }));
    const result = await refreshSource(
      source({ url: "https://example.com/x" }),
      deps(fetchTextImpl)
    );
    expect(result).toEqual({ ok: false, error: "HTTP 404" });
  });

  it("uses the default mihomo UA when none is set", async () => {
    const fetchTextImpl = vi.fn(async (_url: string, options: { userAgent: string }) => {
      expect(options.userAgent).toBe("mihomo/default");
      return { status: 200, headers: {}, text: CLASH_YAML, finalUrl: "https://example.com/x" };
    });
    await refreshSource(source({ url: "https://example.com/x" }), deps(fetchTextImpl));
    expect(fetchTextImpl).toHaveBeenCalledTimes(1);
  });

  it("uses the per-source UA when provided", async () => {
    const fetchTextImpl = vi.fn(async (_url: string, options: { userAgent: string }) => {
      expect(options.userAgent).toBe("custom-agent/9.9");
      return { status: 200, headers: {}, text: CLASH_YAML, finalUrl: "https://example.com/x" };
    });
    await refreshSource(
      source({ url: "https://example.com/x", userAgent: "custom-agent/9.9" }),
      deps(fetchTextImpl)
    );
  });

  it("sanitizes upstream errors so query and userinfo never leak", async () => {
    const fetchTextImpl = vi.fn(async () => {
      throw new ResponseTooLargeError("响应超过大小上限 https://example.com/sub?token=secret");
    });
    const result = await refreshSource(
      source({ url: "https://example.com/sub?token=secret" }),
      deps(fetchTextImpl)
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).not.toContain("secret");
    expect(result.error).not.toContain("?");
    expect(result.error).not.toContain("@");
    expect(result.error.length).toBeLessThanOrEqual(200);
  });

  it("wraps parser exceptions as sanitized failures", async () => {
    const fetchTextImpl = vi.fn(async () => ({
      status: 200,
      headers: {},
      text: "ss://broken",
      finalUrl: "https://example.com/x",
    }));
    const result = await refreshSource(
      source({ url: "https://example.com/x" }),
      deps(fetchTextImpl)
    );
    expect(result.ok).toBe(false);
  });
});

describe("refreshSource manual", () => {
  it("parses two manual node links", async () => {
    const result = await refreshSource(
      source({ kind: "manual", url: undefined, manualText: `${VMESS}\n${TROJAN}` }),
      deps(vi.fn())
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.nodeCount).toBe(2);
    expect(result.snapshot.userInfo).toBeUndefined();
  });

  it("does not call fetch for manual sources", async () => {
    const fetchTextImpl = vi.fn();
    await refreshSource(
      source({ kind: "manual", manualText: TROJAN }),
      deps(fetchTextImpl)
    );
    expect(fetchTextImpl).not.toHaveBeenCalled();
  });
});

describe("sanitizeErrorMessage", () => {
  it("strips query and userinfo from URLs", () => {
    const message = sanitizeErrorMessage("failed https://user:pass@example.com/sub?token=abc#frag");
    expect(message).not.toContain("user:pass");
    expect(message).not.toContain("token=abc");
    expect(message).not.toContain("#frag");
  });

  it("truncates to 200 characters", () => {
    expect(sanitizeErrorMessage("x".repeat(500)).length).toBe(200);
  });
});

describe("default user agent constant", () => {
  it("contains a mihomo entry", () => {
    expect(SUBSCRIPTION_IMPORT_USER_AGENTS.some((ua) => ua.startsWith("mihomo/"))).toBe(true);
  });
});
