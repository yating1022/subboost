import { getMinAutoUpdateIntervalSeconds } from "./auto-update-interval";
import type { SubscriptionUserInfo } from "@subboost/core/subscription/subscription-userinfo";

export type SubscriptionResponseInfo = SubscriptionUserInfo & {
  profileWebPageUrl?: string;
  planName?: string;
};

function toFiniteNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function normalizeHeaderText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\r\n]+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function normalizeProfileWebPageUrl(value: unknown): string | undefined {
  const normalized = normalizeHeaderText(value, 1024);
  if (!normalized) return undefined;

  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function normalizeSubscriptionResponseInfo(raw: unknown): SubscriptionResponseInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const out: SubscriptionResponseInfo = {};

  const upload = toFiniteNonNegativeNumber(record.upload);
  if (upload !== undefined) out.upload = upload;

  const download = toFiniteNonNegativeNumber(record.download);
  if (download !== undefined) out.download = download;

  const total = toFiniteNonNegativeNumber(record.total);
  if (total !== undefined) out.total = total;

  const expire = toFiniteNonNegativeNumber(record.expire);
  if (expire !== undefined && expire > 946684800) out.expire = expire;

  const profileWebPageUrl = normalizeProfileWebPageUrl(
    record.profileWebPageUrl ?? record["profile-web-page-url"]
  );
  if (profileWebPageUrl) out.profileWebPageUrl = profileWebPageUrl;

  const planName = normalizeHeaderText(record.planName ?? record["plan-name"], 200);
  if (planName) out.planName = planName;

  return Object.keys(out).length > 0 ? out : null;
}

export function mergeSubscriptionResponseInfo(
  base?: SubscriptionResponseInfo | null,
  patch?: SubscriptionResponseInfo | null
): SubscriptionResponseInfo {
  return {
    ...(normalizeSubscriptionResponseInfo(base) ?? {}),
    ...(normalizeSubscriptionResponseInfo(patch) ?? {}),
  };
}

export function pickSubscriptionResponseInfoFromHeaders(
  headers?: Record<string, string>
): SubscriptionResponseInfo {
  return (
    normalizeSubscriptionResponseInfo({
      "profile-web-page-url": headers?.["profile-web-page-url"],
      "plan-name": headers?.["plan-name"],
    }) ?? {}
  );
}

export function resolveClientProfileUpdateIntervalSeconds(options: {
  cacheExpirySeconds?: number;
  autoUpdateIntervalSeconds?: number | null;
  isAdmin: boolean;
}): number | null {
  const values: number[] = [getMinAutoUpdateIntervalSeconds(options.isAdmin)];

  if (
    typeof options.cacheExpirySeconds === "number" &&
    Number.isFinite(options.cacheExpirySeconds) &&
    options.cacheExpirySeconds > 0
  ) {
    values.push(Math.floor(options.cacheExpirySeconds));
  }

  if (
    typeof options.autoUpdateIntervalSeconds === "number" &&
    Number.isFinite(options.autoUpdateIntervalSeconds) &&
    options.autoUpdateIntervalSeconds > 0
  ) {
    values.push(Math.floor(options.autoUpdateIntervalSeconds));
  }

  return values.length > 0 ? Math.max(...values) : null;
}
