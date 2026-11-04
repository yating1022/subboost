import { describe, expect, it } from "vitest";
import { isBlockedHostname, validatePublicHttpUrl } from "./ssrf";

describe("validatePublicHttpUrl", () => {
  const blockedSamples = [
    "http://localhost/x",
    "http://foo.localhost/x",
    "http://foo.local/x",
    "http://foo.internal/x",
    "http://metadata.google.internal/x",
    "http://0.0.0.0/x",
    "http://10.1.2.3/x",
    "http://100.64.0.1/x",
    "http://127.0.0.1/x",
    "http://169.254.1.1/x",
    "http://172.16.5.5/x",
    "http://192.0.0.5/x",
    "http://192.0.2.5/x",
    "http://192.88.99.1/x",
    "http://192.168.1.1/x",
    "http://198.18.0.1/x",
    "http://198.51.100.5/x",
    "http://203.0.113.5/x",
    "http://224.0.0.1/x",
    "http://240.0.0.1/x",
    "http://[::]/x",
    "http://[::1]/x",
    "http://[fc00::1]/x",
    "http://[fe80::1]/x",
    "http://[fec0::1]/x",
    "http://[ff02::1]/x",
    "http://[::ffff:10.0.0.1]/x",
    "http://[::ffff:127.0.0.1]/x",
    "http://[64:ff9b::1.2.3.4]/x",
    "http://[2002::1]/x",
    "http://2130706433/x",
    "http://user:pass@example.com/",
    "ftp://example.com/",
  ];

  it.each(blockedSamples)("rejects %s", (url) => {
    expect(validatePublicHttpUrl(url).ok).toBe(false);
  });

  it("accepts a public https URL with query", () => {
    const result = validatePublicHttpUrl("https://example.com/sub?token=x");
    expect(result.ok).toBe(true);
  });

  it("accepts a public IPv4 literal", () => {
    expect(validatePublicHttpUrl("http://1.1.1.1/").ok).toBe(true);
  });

  it("accepts a public IPv6 literal", () => {
    expect(validatePublicHttpUrl("http://[2606:4700:4700::1111]/").ok).toBe(true);
  });

  it("rejects a malformed URL", () => {
    expect(validatePublicHttpUrl("not a url").ok).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it("normalizes trailing dots and brackets", () => {
    expect(isBlockedHostname("localhost.")).toBe(true);
    expect(isBlockedHostname("[::1]")).toBe(true);
    expect(isBlockedHostname("EXAMPLE.com")).toBe(false);
  });
});
