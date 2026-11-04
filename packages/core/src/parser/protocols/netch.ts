import { decodeBase64 } from "../base64";
import type { ParsedNode } from "@subboost/core/types/node";
import { parseJsonObject } from "../json-utils";

function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseBoolish(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 0) return false;
    if (value === 1) return true;
    return undefined;
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function parseSemicolonParams(raw: string): Record<string, unknown> | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const out: Record<string, unknown> = {};
  for (const part of value.split(";")) {
    const p = part.trim();
    if (!p) continue;
    const idx = p.indexOf("=");
    if (idx === -1) {
      out[p] = true;
      continue;
    }
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeTransport(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v || v === "none") return "tcp";
  if (v === "websocket") return "ws";
  return v;
}

export function parseNetch(uri: string): ParsedNode {
  if (!uri.startsWith("netch://")) {
    throw new Error("无效的 Netch 链接");
  }

  const payload = uri.slice("netch://".length).trim();
  if (!payload) {
    throw new Error("无效的 Netch 链接");
  }

  const decoded = decodeBase64(payload);
  const json = parseJsonObject(decoded);
  if (!json) {
    throw new Error("无效的 Netch JSON 格式");
  }

  const typeRaw = pickString(json.Type);
  const type = typeRaw.toLowerCase();

  const server = pickString(json.Hostname);
  const port = pickNumber(json.Port);
  const name = pickString(json.Remark) || `${typeRaw || "Netch"}-${server}:${port ?? 0}`;

  if (!server || port === null || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Netch 配置缺少 server/port 或端口无效");
  }

  const udp = parseBoolish(json.EnableUDP);
  const tfo = parseBoolish(json.EnableTFO);
  const skipCertVerify = parseBoolish(json.AllowInsecure);

  const common: Record<string, unknown> = {
    name,
    server,
    port,
    ...(udp !== undefined ? { udp } : {}),
    ...(tfo !== undefined ? { tfo } : {}),
    ...(skipCertVerify ? { "skip-cert-verify": true } : {}),
  };

  if (type === "ss") {
    const cipher = pickString(json.EncryptMethod) || "aes-256-gcm";
    const password = pickString(json.Password);
    if (!password) throw new Error("Netch SS 缺少 password");

    const pluginRaw = pickString(json.Plugin);
    const pluginOptsRaw = pickString(json.PluginOption);
    const plugin = pluginRaw ? pluginRaw : undefined;
    const pluginOpts = pluginOptsRaw ? parseSemicolonParams(pluginOptsRaw) : undefined;

    return {
      ...common,
      type: "ss",
      cipher,
      password,
      ...(plugin ? { plugin } : {}),
      ...(pluginOpts ? { "plugin-opts": pluginOpts } : {}),
    } as unknown as ParsedNode;
  }

  if (type === "ssr") {
    const cipher = pickString(json.EncryptMethod) || "aes-256-cfb";
    const password = pickString(json.Password);
    const protocol = pickString(json.Protocol) || "origin";
    const protocolParam = pickString(json.ProtocolParam) || undefined;
    const obfs = pickString(json.OBFS) || "plain";
    const obfsParam = pickString(json.OBFSParam) || undefined;
    if (!password) throw new Error("Netch SSR 缺少 password");

    return {
      ...common,
      type: "ssr",
      cipher,
      password,
      protocol,
      ...(protocolParam ? { "protocol-param": protocolParam } : {}),
      obfs,
      ...(obfsParam ? { "obfs-param": obfsParam } : {}),
    } as unknown as ParsedNode;
  }

  if (type === "vmess") {
    const uuid = pickString(json.UserID);
    const alterId = pickNumber(json.AlterID) ?? 0;
    const cipher = pickString(json.EncryptMethod) || "auto";
    if (!uuid) throw new Error("Netch VMess 缺少 uuid");

    const net = normalizeTransport(pickString(json.TransferProtocol));
    const fakeType = normalizeTransport(pickString(json.FakeType));
    const host = pickString(json.Host);
    const path = pickString(json.Path) || "/";
    const edge = pickString(json.Edge);
    const tls = parseBoolish(json.TLSSecure) === true;
    const sni = pickString(json.ServerName);

    if (!["tcp", "ws", "grpc", "h2", "http"].includes(net)) {
      throw new Error(`不支持的 Netch VMess 传输层: ${net}`);
    }

    const node: Record<string, unknown> = {
      ...common,
      type: "vmess",
      uuid,
      alterId,
      cipher,
      tls,
      ...(sni ? { servername: sni } : {}),
      ...(tls && skipCertVerify ? { "skip-cert-verify": true } : {}),
    };

    if (net === "ws") {
      node.network = "ws";
      node["ws-opts"] = {
        path,
        headers: host || edge ? { ...(host ? { Host: host } : {}), ...(edge ? { Edge: edge } : {}) } : undefined,
      };
    } else if (net === "grpc") {
      node.network = "grpc";
      node["grpc-opts"] = { "grpc-service-name": path.replace(/^\//, "") };
    } else if (net === "h2") {
      node.network = "h2";
      node["h2-opts"] = { host: host ? [host] : undefined, path };
    } else if (net === "http" || (net === "tcp" && fakeType === "http")) {
      node.network = "http";
      node["http-opts"] = {
        method: "GET",
        path: path.split(",").map((p) => p.trim()).filter(Boolean),
        ...(host ? { headers: { Host: host.split(",").map((h) => h.trim()).filter(Boolean) } } : {}),
      };
    } else {
      node.network = "tcp";
    }

    return node as unknown as ParsedNode;
  }

  if (type === "trojan") {
    const password = pickString(json.Password);
    if (!password) throw new Error("Netch Trojan 缺少 password");

    const net = normalizeTransport(pickString(json.TransferProtocol));
    const host = pickString(json.Host);
    const path = pickString(json.Path) || "/";
    const tls = parseBoolish(json.TLSSecure) !== false;
    const sni = pickString(json.ServerName) || server;

    if (!tls) {
      throw new Error("Netch Trojan 必须启用 TLS");
    }
    if (!["tcp", "ws", "grpc", "httpupgrade"].includes(net)) {
      throw new Error(`不支持的 Netch Trojan 传输层: ${net}`);
    }

    const node: Record<string, unknown> = {
      ...common,
      type: "trojan",
      password,
      sni,
      ...(skipCertVerify ? { "skip-cert-verify": true } : {}),
    };

    if (net === "ws" || net === "httpupgrade") {
      node.network = "ws";
      node["ws-opts"] = {
        path,
        headers: host ? { Host: host } : undefined,
        ...(net === "httpupgrade"
          ? { "v2ray-http-upgrade": true, "v2ray-http-upgrade-fast-open": true }
          : {}),
      };
    } else if (net === "grpc") {
      node.network = "grpc";
      node["grpc-opts"] = { "grpc-service-name": path.replace(/^\//, "") };
    } else {
      node.network = "tcp";
    }

    return node as unknown as ParsedNode;
  }

  if (type === "snell") {
    const psk = pickString(json.Password);
    if (!psk) throw new Error("Netch Snell 缺少 psk/password");

    const obfs = pickString(json.OBFS).toLowerCase();
    const host = pickString(json.Host);
    const version = pickNumber(json.SnellVersion);

    const node: Record<string, unknown> = {
      ...common,
      type: "snell",
      psk,
      ...(version !== null && Number.isInteger(version) ? { version } : {}),
    };

    if (obfs === "http" || obfs === "tls") {
      node["obfs-opts"] = {
        mode: obfs,
        ...(host ? { host } : {}),
      };
    }

    return node as unknown as ParsedNode;
  }

  if (type === "socks5" || type === "socks") {
    const username = pickString(json.Username) || undefined;
    const password = pickString(json.Password) || undefined;
    return {
      ...common,
      type: "socks5",
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
    } as unknown as ParsedNode;
  }

  if (type === "http" || type === "https") {
    const username = pickString(json.Username) || undefined;
    const password = pickString(json.Password) || undefined;
    const tls = type === "https";
    return {
      ...common,
      type: type as "http" | "https",
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      ...(tls ? { tls: true } : {}),
    } as unknown as ParsedNode;
  }

  throw new Error(`不支持的 Netch 类型: ${typeRaw || "(empty)"}`);
}
