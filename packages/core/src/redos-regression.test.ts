import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { sanitizeMihomoProxyNode } from "./mihomo/proxy-sanitizer";
import { parseAnyTLS } from "./parser/protocols/anytls";
import { parseHysteria2 } from "./parser/protocols/hysteria2";
import { parseSimpleProxy } from "./parser/protocols/simple-proxy";
import { parseVLESS } from "./parser/protocols/vless";
import { parseVMess } from "./parser/protocols/vmess";
import { splitLeadingEmoji } from "./proxy-group-name";
import { ensureCustomRuleId } from "./rules/custom-rule-utils";

const PRIVATE_KEY = ["-----BEGIN OPENSSH ", "PRIVATE ", "KEY-----\nabc\n-----END OPENSSH ", "PRIVATE ", "KEY-----"].join("");

function expectFast(label: string, action: () => void): void {
  const started = performance.now();
  action();
  const elapsed = performance.now() - started;
  expect(elapsed, label).toBeLessThan(250);
}

function ignoreExpectedParserError(action: () => void): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
  }
}

describe("ReDoS regression coverage", () => {
  it("keeps malformed simple proxy suffix parsing linear", () => {
    expectFast("brace suffix", () => {
      ignoreExpectedParserError(() => parseSimpleProxy("{{|".repeat(10_000), "http"));
    });
    expectFast("bracket suffix", () => {
      ignoreExpectedParserError(() => parseSimpleProxy("[\\".repeat(12_000), "http"));
    });
  });

  it("keeps URI protocol normalizers linear for long malformed authorities", () => {
    expectFast("AnyTLS encoded-userinfo detector", () => {
      ignoreExpectedParserError(() => parseAnyTLS(`anytls://${"@".repeat(25_000)}a`));
    });
    expectFast("VLESS Shadowrocket detector", () => {
      ignoreExpectedParserError(() => parseVLESS(`vless://${"@".repeat(25_000)}a`));
    });
    expectFast("Hysteria2 authority trim", () => {
      ignoreExpectedParserError(() => parseHysteria2(`hysteria2://secret@hy2.example.com:443${"/".repeat(25_000)}x`));
    });
    expectFast("VMess standard variant detector", () => {
      ignoreExpectedParserError(() => parseVMess(`vmess://a:!-0@${"a:0?".repeat(25_000)}`));
    });
    expectFast("VMess Kitsunebi variant detector", () => {
      ignoreExpectedParserError(() => parseVMess(`vmess1://${"@:".repeat(25_000)}`));
    });
  });

  it("keeps shared sanitizers and naming helpers linear", () => {
    expectFast("SSH host key sanitizer", () => {
      const node = sanitizeMihomoProxyNode({
        name: "SSH",
        type: "ssh",
        server: "ssh.example.com",
        port: 22,
        "private-key": PRIVATE_KEY,
        "host-key": [`ssh-rsa +${" ".repeat(25_000)}`],
      });
      expect(node).toHaveProperty("host-key");
    });

    expectFast("custom rule slug", () => {
      const rule = ensureCustomRuleId(
        { type: "DOMAIN", value: `${"-".repeat(50_000)}example.com`, target: "Proxy" },
        0
      );
      expect(rule.id).toContain("example");
    });

    expectFast("emoji prefix splitter", () => {
      expect(splitLeadingEmoji(`! ${" ".repeat(50_000)}Node`)).toEqual({
        emoji: "!",
        label: "Node",
        hasEmojiPrefix: true,
      });
    });
  });
});
