import { describe, expect, it } from "vitest";
import { looksLikePlatformConfigContent, parsePlatformConfigContent } from "./parse-platform-config";

describe("platform config parser", () => {
  it("detects platform-style config sections", () => {
    expect(looksLikePlatformConfigContent("[Proxy]\nNode = ss, example.com, 8388")).toBe(true);
    expect(looksLikePlatformConfigContent("[server_remote]\nNode = ss, example.com, 8388")).toBe(true);
    expect(looksLikePlatformConfigContent("[WireGuard Office]\nprivate-key = private")).toBe(true);
    expect(looksLikePlatformConfigContent("ss://abc")).toBe(false);
  });

  it("parses proxy sections, referenced WireGuard sections, fallback config lines, and errors", () => {
    const result = parsePlatformConfigContent(`
[General]
skip-proxy = 127.0.0.1

[WireGuard Office]
private-key = private
self-ip = 10.0.0.2/32
dns-server = 1.1.1.1, 8.8.8.8
peer = (public-key = public, endpoint = "wg.example.com:51820", allowed-ips = "0.0.0.0/0, ::/0")

[Proxy]
# comment
; another comment
Direct Policy = direct
Surge VMess = vmess, vmess.example.com, 443, username=11111111-1111-4111-8111-111111111111, vmess-aead=true, ws=true, ws-path=/ws?ed=512, ws-headers=Host:cdn.example.com, tls=true
Office WG = wireguard, section-name=Office
HY = hysteria, hy.example.com, 443, auth=secret, protocol=wechat-video, sni=hy.example.com
Bad AnyTLS = anytls, anytls.example.com, 443, "secret", transport=ws

[Rule]
FINAL,DIRECT
`);

    expect(result.totalParsed).toBe(3);
    expect(result.totalFailed).toBe(1);
    expect(result.errors[0]).toContain("AnyTLS 平台配置不支持");
    expect(result.nodes.map((node) => node.name)).toEqual(["Surge VMess", "Office WG", "HY"]);
    expect(result.nodes[0]).toMatchObject({
      type: "vmess",
      server: "vmess.example.com",
      network: "ws",
      "ws-opts": {
        path: "/ws",
        "max-early-data": 512,
      },
    });
    expect(result.nodes[1]).toMatchObject({
      type: "wireguard",
      server: "wg.example.com",
      port: 51820,
      "private-key": "private",
      "public-key": "public",
      dns: ["1.1.1.1", "8.8.8.8"],
    });
    expect(result.nodes[2]).toMatchObject({
      type: "hysteria",
      server: "hy.example.com",
      port: 443,
      protocol: "wechat-video",
      "auth-str": "secret",
      sni: "hy.example.com",
    });
  });

  it("returns an empty result for non-proxy sections", () => {
    const result = parsePlatformConfigContent(`
[Rule]
FINAL,DIRECT
`);

    expect(result).toEqual({
      nodes: [],
      errors: [],
      totalParsed: 0,
      totalFailed: 0,
    });
  });
});
