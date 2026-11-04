import { describe, expect, it } from "vitest";

import { buildQrFileName, downloadQrPng, toSafeFileSlug } from "./qr-download";

describe("toSafeFileSlug", () => {
  it("keeps readable names and collapses whitespace", () => {
    expect(toSafeFileSlug("默认  订阅")).toBe("默认-订阅");
    expect(toSafeFileSlug("  Default Sub  ")).toBe("Default-Sub");
  });

  it("replaces characters that are invalid in file names", () => {
    expect(toSafeFileSlug('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j");
    expect(toSafeFileSlug("line\nbreak")).toBe("line-break");
  });

  it("falls back when nothing usable is left", () => {
    expect(toSafeFileSlug("   ")).toBe("subscription");
    expect(toSafeFileSlug("///")).toBe("subscription");
    expect(toSafeFileSlug("..", "sub")).toBe("sub");
  });

  it("caps very long names", () => {
    expect(toSafeFileSlug("a".repeat(120))).toHaveLength(60);
  });
});

describe("buildQrFileName", () => {
  it("appends the png suffix", () => {
    expect(buildQrFileName("默认订阅")).toBe("默认订阅-qr.png");
    expect(buildQrFileName("")).toBe("subscription-qr.png");
  });
});

describe("downloadQrPng", () => {
  it("returns false without a canvas so the UI can fall back to copying", async () => {
    await expect(downloadQrPng(null, "x-qr.png")).resolves.toBe(false);
  });
});
