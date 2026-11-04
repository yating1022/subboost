import { decodeBase64 } from "../base64";
import { safeDecodeFormUrlEncoded } from "./url-decode";
export const DINGTALK_USER_AGENT = "DingTalk/50636215 CFNetwork/3826.600.41 Darwin/24.6.0";

export function hasDingTalkHost(hosts: string[] | undefined): boolean {
  if (!hosts || hosts.length === 0) return false;
  return hosts.some((h) => /(^|\.)dingtalk\.com$/i.test(h.trim()));
}

export function normalizeHttpMethod(input: unknown): string {
  if (typeof input !== "string") return "GET";
  const method = input.trim();
  if (!method) return "GET";
  const upper = method.toUpperCase();
  // RFC 7230 token（简化）：支持常见自定义方法（如 M-SEARCH）
  if (!/^[A-Z][A-Z0-9-]*$/.test(upper)) return "GET";
  return upper;
}

export function normalizeHeaderKey(key: string): string {
  const k = key.trim();
  const lower = k.toLowerCase();
  if (lower === "host") return "Host";
  if (lower === "user-agent") return "User-Agent";
  if (lower === "connection") return "Connection";
  return k;
}

export function parseHeaderRecord(input: unknown): Record<string, string[]> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const out: Record<string, string[]> = {};

  for (const [kRaw, vRaw] of Object.entries(record)) {
    const key = typeof kRaw === "string" ? normalizeHeaderKey(kRaw) : "";
    if (!key) continue;

    const values = (() => {
      if (Array.isArray(vRaw)) {
        const list = vRaw
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean);
        return list.length > 0 ? list : undefined;
      }
      if (typeof vRaw === "string") {
        const v = vRaw.trim();
        return v ? [v] : undefined;
      }
      if (typeof vRaw === "number" || typeof vRaw === "boolean") {
        return [String(vRaw)];
      }
      return undefined;
    })();

    if (values && values.length > 0) out[key] = values;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function splitList(value: string | undefined): string[] | undefined {
  const raw = (value ?? "").trim();
  if (!raw) return undefined;
  const list = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

export function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseBooleanish(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 0) return false;
    if (value === 1) return true;
    return undefined;
  }
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return undefined;
}

export function looksLikeUriStyleVmess(content: string): boolean {
  return content.includes("@") || content.includes("?");
}

export function looksLikeStandardVmessStyle(content: string): boolean {
  return /^[a-z]+(?:\+[a-z]+)?:[^@\s]+-\d+@[^\s]+:\d+/i.test(content);
}

export function looksLikeShadowrocketStyleVmess(content: string): boolean {
  const queryIndex = content.indexOf("?");
  if (queryIndex <= 0) return false;
  const base = content.slice(0, queryIndex).replace(/\/$/, "");
  if (!base || base.includes("@")) return false;

  try {
    const decoded = decodeBase64(base);
    return /(^[^:]+?):([^:]+?)@(.+):(\d+)$/.test(decoded);
  } catch {
    return false;
  }
}

export function stripOuterQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

export function pickQueryParam(params: URLSearchParams, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return undefined;
}

export function parseObfsHeaderHost(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const decoded = safeDecodeFormUrlEncoded(stripOuterQuotes(raw));
  const hostMatch = decoded.match(/Host:\s*([^,;\s]+)/i);
  return hostMatch?.[1]?.trim() || decoded || undefined;
}

