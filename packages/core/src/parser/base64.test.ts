import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeBase64, encodeBase64, parseBase64, safeDecodeBase64 } from "./base64";

const nodeBuffer = Buffer;

describe("base64 helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("decodes standard, URL-safe, whitespace, and URL-encoded Base64", () => {
    expect(decodeBase64("U3ViQm9vc3Q=")).toBe("SubBoost");
    expect(decodeBase64("U3ViQm9vc3Q")).toBe("SubBoost");
    expect(decodeBase64("U3Vi%51m9vc3Q%3D")).toBe("SubBoost");
    expect(decodeBase64("5Lit5paH")).toBe("中文");
    expect(decodeBase64(" U3Vi\nQm9vc3Q= ")).toBe("SubBoost");
  });

  it("returns null for unsupported safe decode and rejects binary-looking parsed text", () => {
    expect(() => parseBase64("AA==")).toThrow("解码结果包含无效字符");

    vi.stubGlobal("Buffer", undefined);
    vi.stubGlobal("atob", undefined);

    expect(safeDecodeBase64("U3ViQm9vc3Q=")).toBeNull();
    expect(() => parseBase64("AA==")).toThrow("无效的 Base64 编码");
  });

  it("uses browser fallbacks when Node Buffer is unavailable", () => {
    vi.stubGlobal("Buffer", undefined);
    vi.stubGlobal("atob", (value: string) => nodeBuffer.from(value, "base64").toString("binary"));
    vi.stubGlobal("btoa", (value: string) => nodeBuffer.from(value, "binary").toString("base64"));

    expect(decodeBase64("U3ViQm9vc3Q=")).toBe("SubBoost");
    expect(encodeBase64("SubBoost")).toBe("U3ViQm9vc3Q=");
  });

  it("falls back to Latin-1 decoding when TextDecoder is unavailable", () => {
    vi.stubGlobal("Buffer", undefined);
    vi.stubGlobal("TextDecoder", undefined);
    vi.stubGlobal("atob", (value: string) => nodeBuffer.from(value, "base64").toString("binary"));

    expect(decodeBase64("U3ViQm9vc3Q=")).toBe("SubBoost");
  });

  it("throws a clear encode error when neither Node nor browser primitives exist", () => {
    vi.stubGlobal("Buffer", undefined);
    vi.stubGlobal("TextEncoder", undefined);
    vi.stubGlobal("btoa", undefined);

    expect(() => encodeBase64("SubBoost")).toThrow("当前环境不支持 Base64 编码");
  });
});
