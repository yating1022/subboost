import { describe, expect, it } from "vitest";
import {
  CLIENT_UPDATE_PLACEHOLDER_ERROR,
  filterClientUpdatePlaceholderNodes,
  hasClientUpdatePlaceholderError,
  isClientUpdatePlaceholderNode,
  looksLikeClientUpdatePlaceholderNodes,
} from "./placeholder";
import {
  normalizePortsSpec,
  normalizePortsSpecValue,
  parsePortNumber,
  pickStablePortFromPorts,
} from "./port-spec";
import {
  canonicalizeParsedNode,
  pickAliasValue,
} from "./canonical-fields";
import { splitWsPathEarlyData } from "./ws-early-data";
import type { ParsedNode } from "@subboost/core/types/node";

function node(partial: Partial<ParsedNode>): ParsedNode {
  return {
    name: "node",
    type: "direct",
    server: "example.com",
    port: 443,
    ...partial,
  } as ParsedNode;
}

describe("client update placeholder helpers", () => {
  it("detects and filters loopback update placeholder nodes", () => {
    const placeholder = node({ name: "请更新 v2rayN 客户端", server: "localhost.", port: "1" as never });
    const real = node({ name: "real", server: "example.com", port: 443 });

    expect(isClientUpdatePlaceholderNode(null)).toBe(false);
    expect(isClientUpdatePlaceholderNode(placeholder)).toBe(true);
    expect(isClientUpdatePlaceholderNode(node({ name: "请更新客户端", server: "[::1]", port: 0 }))).toBe(true);
    expect(isClientUpdatePlaceholderNode(node({ name: "普通节点", server: "127.0.0.1", port: 0 }))).toBe(false);
    expect(isClientUpdatePlaceholderNode(node({ name: "upgrade required", server: "example.com", port: 0 }))).toBe(false);
    expect(isClientUpdatePlaceholderNode(node({ name: "update", server: "0.0.0.0", port: 2 }))).toBe(false);

    expect(looksLikeClientUpdatePlaceholderNodes([placeholder])).toBe(true);
    expect(looksLikeClientUpdatePlaceholderNodes([placeholder, real])).toBe(false);
    expect(looksLikeClientUpdatePlaceholderNodes("bad" as never)).toBe(false);
    expect(filterClientUpdatePlaceholderNodes([placeholder, real])).toEqual({ nodes: [real], filteredCount: 1 });
    expect(filterClientUpdatePlaceholderNodes(undefined as never)).toEqual({ nodes: [], filteredCount: 0 });
    expect(hasClientUpdatePlaceholderError([CLIENT_UPDATE_PLACEHOLDER_ERROR])).toBe(true);
    expect(hasClientUpdatePlaceholderError(["other"])).toBe(false);
    expect(hasClientUpdatePlaceholderError(null as never)).toBe(false);
  });
});

describe("WebSocket early data parser", () => {
  it("splits positive ed query values while preserving other query parts", () => {
    expect(splitWsPathEarlyData("")).toEqual({ path: "/" });
    expect(splitWsPathEarlyData("/ws")).toEqual({ path: "/ws" });
    expect(splitWsPathEarlyData("/ws?ed=2048&host=example.com")).toEqual({
      path: "/ws?host=example.com",
      earlyData: 2048,
    });
    expect(splitWsPathEarlyData("?ed=10")).toEqual({ path: "/", earlyData: 10 });
    expect(splitWsPathEarlyData("/ws?ed=0&x=1")).toEqual({ path: "/ws?ed=0&x=1" });
    expect(splitWsPathEarlyData("/ws?ed=bad&ed=1&flag")).toEqual({
      path: "/ws?ed=bad&flag",
      earlyData: 1,
    });
    expect(splitWsPathEarlyData("/ws?ed=9007199254740992&x=1")).toEqual({
      path: "/ws?ed=9007199254740992&x=1",
    });
    expect(splitWsPathEarlyData("/ws?flag&ed=8&&next=2")).toEqual({
      path: "/ws?flag&next=2",
      earlyData: 8,
    });
  });
});

describe("port spec helpers", () => {
  it("normalizes, parses, and picks stable ports", () => {
    expect(normalizePortsSpec(" 80; 443 / 8443 ")).toBe("80,443,8443");
    expect(normalizePortsSpecValue(8080)).toBe("8080");
    expect(normalizePortsSpecValue(8.5)).toBeUndefined();
    expect(normalizePortsSpecValue("   ")).toBeUndefined();
    expect(normalizePortsSpecValue({})).toBeUndefined();

    expect(parsePortNumber(" 443 ")).toBe(443);
    expect(parsePortNumber(65535)).toBe(65535);
    expect(parsePortNumber(0)).toBeUndefined();
    expect(parsePortNumber("443.5")).toBeUndefined();
    expect(parsePortNumber("65536")).toBeUndefined();

    expect(pickStablePortFromPorts("400-500,8443")).toBe(443);
    expect(pickStablePortFromPorts("8000-8002,9999")).toBe(8000);
    expect(pickStablePortFromPorts("8080,9000")).toBe(8080);
    expect(pickStablePortFromPorts("bad,0,70000,9000-8000")).toBe(443);
  });
});

describe("canonical field aliases", () => {
  it("picks the first non-empty alias value", () => {
    expect(pickAliasValue({ a: " ", nested: { value: "ok" } }, [["a"], ["nested", "value"]])).toBe("ok");
    expect(pickAliasValue({ a: null }, [["a"]])).toBeUndefined();
  });

  it("canonicalizes protocol aliases without changing unsupported types", () => {
    expect(canonicalizeParsedNode(null as never)).toBeNull();

    expect(
      canonicalizeParsedNode({
        type: "vless",
        publicKey: "pub",
        shortid: "sid",
        fp: "chrome",
        packetEncoding: "xudp",
        serviceName: "svc",
        allow_insecure: true,
      } as never)
    ).toMatchObject({
      type: "vless",
      "reality-opts": { "public-key": "pub", "short-id": "sid" },
      "client-fingerprint": "chrome",
      "packet-encoding": "xudp",
      "grpc-opts": { "grpc-service-name": "svc" },
      "skip-cert-verify": true,
    });

    expect(
      canonicalizeParsedNode({
        type: "vless",
        "reality-opts": "bad",
        pbk: "pub",
        sid: "sid",
        "tls-verification": "off",
      } as never)
    ).toMatchObject({
      "reality-opts": { "public-key": "pub", "short-id": "sid" },
      "skip-cert-verify": true,
    });

    expect(canonicalizeParsedNode({ type: "trojan", packetEncoding: "xudp" } as never)).toEqual({
      type: "trojan",
      packetEncoding: "xudp",
    });
    expect(canonicalizeParsedNode({ type: "vmess", "skip-cert-verify": false, insecure: true } as never)).toEqual({
      type: "vmess",
      "skip-cert-verify": false,
      insecure: true,
    });
    expect(canonicalizeParsedNode({ type: "vmess", "tls-verification": "yes" } as never)).toEqual({
      type: "vmess",
      "skip-cert-verify": false,
    });
    expect(canonicalizeParsedNode({ type: "wireguard", privateKey: "priv", peerPublicKey: "pub", psk: "psk" } as never))
      .toMatchObject({
        "private-key": "priv",
        "public-key": "pub",
        "pre-shared-key": "psk",
      });
  });
});
