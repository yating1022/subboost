import { describe, expect, it } from "vitest";
import { mustParseNodeLink, netchLink } from "./config-line-parser.test-helpers";

describe("Netch parser", () => {
  it("parses Netch SS and VMess payloads", () => {
    expect(
      mustParseNodeLink(
        netchLink({
          Type: "SS",
          Remark: "Netch SS",
          Hostname: "netch-ss.example.com",
          Port: 8388,
          EncryptMethod: "aes-128-gcm",
          Password: "secret",
          Plugin: "obfs",
          PluginOption: "mode=tls;host=cdn.example.com",
          EnableUDP: true,
        })
      )
    ).toMatchObject({
      name: "Netch SS",
      type: "ss",
      server: "netch-ss.example.com",
      port: 8388,
      cipher: "aes-128-gcm",
      password: "secret",
      plugin: "obfs",
      "plugin-opts": { mode: "tls", host: "cdn.example.com" },
      udp: true,
    });

    expect(
      mustParseNodeLink(
        netchLink({
          Type: "VMess",
          Remark: "Netch VMess",
          Hostname: "netch-vmess.example.com",
          Port: 443,
          UserID: "11111111-1111-4111-8111-111111111111",
          AlterID: 0,
          EncryptMethod: "auto",
          TransferProtocol: "ws",
          Host: "cdn.example.com",
          Path: "/ws",
          TLSSecure: true,
          ServerName: "sni.example.com",
          AllowInsecure: true,
        })
      )
    ).toMatchObject({
      name: "Netch VMess",
      type: "vmess",
      server: "netch-vmess.example.com",
      port: 443,
      uuid: "11111111-1111-4111-8111-111111111111",
      tls: true,
      servername: "sni.example.com",
      "skip-cert-verify": true,
      network: "ws",
      "ws-opts": {
        path: "/ws",
        headers: { Host: "cdn.example.com" },
      },
    });
  });
});

  it("parses and rejects Netch Trojan transport contracts", () => {
    expect(
      mustParseNodeLink(
        netchLink({
          Type: "Trojan",
          Remark: "Netch Trojan",
          Hostname: "netch-trojan.example.com",
          Port: 443,
          Password: "secret",
          TransferProtocol: "httpupgrade",
          Host: "cdn.example.com",
          Path: "/upgrade",
          TLSSecure: true,
          ServerName: "trojan-sni.example.com",
          AllowInsecure: true,
        })
      )
    ).toMatchObject({
      name: "Netch Trojan",
      type: "trojan",
      server: "netch-trojan.example.com",
      port: 443,
      password: "secret",
      sni: "trojan-sni.example.com",
      "skip-cert-verify": true,
      network: "ws",
      "ws-opts": {
        path: "/upgrade",
        headers: { Host: "cdn.example.com" },
        "v2ray-http-upgrade": true,
        "v2ray-http-upgrade-fast-open": true,
      },
    });
    expect(() =>
      mustParseNodeLink(
        netchLink({
          Type: "Trojan",
          Hostname: "netch-trojan.example.com",
          Port: 443,
          Password: "secret",
          TLSSecure: false,
        })
      )
    ).toThrow("Netch Trojan 必须启用 TLS");
  });
