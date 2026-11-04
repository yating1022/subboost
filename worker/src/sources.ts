import { parseSubscription } from "@subboost/core/parser";
import { parseSubscriptionUserInfo } from "@subboost/core/subscription/subscription-userinfo";
import { normalizeSubscriptionResponseInfo } from "@subboost/core/subscription/subscription-response-info";
import type { SubscriptionResponseInfo } from "@subboost/core/subscription/subscription-response-info";
import { SUBSCRIPTION_IMPORT_USER_AGENTS } from "@subboost/server-core/subscription/user-agents";
import { FetchBlockedError, TooManyRedirectsError, ResponseTooLargeError, type fetchText } from "./safe-fetch";
import { MAX_PARSE_ERRORS, type SnapshotRecord, type SourceDto } from "./types";

export type RefreshSourceResult =
  | { ok: true; snapshot: SnapshotRecord }
  | { ok: false; error: string };

export type RefreshSourceDeps = {
  fetchText: typeof fetchText;
  defaultUserAgent: string;
  now: () => Date;
};

const MAX_ERROR_LENGTH = 200;

// 去掉 URL 的 query 与 userinfo，并截断长度，避免把敏感信息写入状态记录
export function sanitizeErrorMessage(message: string, fallback = "刷新失败"): string {
  const trimmed = message.trim() || fallback;
  const sanitized = trimmed.replace(/https?:\/\/[^\s"'<>]+/g, (raw) => {
    try {
      const url = new URL(raw);
      url.search = "";
      url.hash = "";
      url.username = "";
      url.password = "";
      return url.toString();
    } catch {
      return raw.split("?")[0];
    }
  });
  return sanitized.slice(0, MAX_ERROR_LENGTH);
}

export function resolveDefaultUserAgent(env: Pick<Env, "DEFAULT_USER_AGENT">): string {
  const override = env.DEFAULT_USER_AGENT?.trim();
  if (override) return override;
  return SUBSCRIPTION_IMPORT_USER_AGENTS.find((ua) => ua.startsWith("mihomo/")) ?? "mihomo/1.19.24";
}

function summarizeParseErrors(errors: string[]): string {
  const summary = errors.slice(0, 3).join("；");
  return sanitizeErrorMessage(summary || "未解析到任何节点", "未解析到任何节点");
}

function extractUserInfo(headers: Record<string, string>): SubscriptionResponseInfo | null {
  const raw = headers["subscription-userinfo"];
  if (!raw) return null;
  const parsed = parseSubscriptionUserInfo(raw);
  return normalizeSubscriptionResponseInfo(parsed);
}

export async function refreshSource(
  source: SourceDto,
  deps: RefreshSourceDeps
): Promise<RefreshSourceResult> {
  if (source.kind === "remote") {
    let result: Awaited<ReturnType<typeof fetchText>>;
    try {
      result = await deps.fetchText(source.url ?? "", {
        userAgent: source.userAgent ?? deps.defaultUserAgent,
      });
    } catch (err) {
      if (
        err instanceof FetchBlockedError ||
        err instanceof TooManyRedirectsError ||
        err instanceof ResponseTooLargeError
      ) {
        return { ok: false, error: sanitizeErrorMessage(err.message) };
      }
      const name = err instanceof Error ? err.name : "Error";
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: sanitizeErrorMessage(`${name}: ${message}`) };
    }

    if (result.status < 200 || result.status >= 300) {
      return { ok: false, error: `HTTP ${result.status}` };
    }

    const userInfo = extractUserInfo(result.headers);
    const snapshot = buildSnapshot(source, result.text, deps.now(), userInfo);
    if (!snapshot.ok) return snapshot;
    return snapshot;
  }

  const snapshot = buildSnapshot(source, source.manualText ?? "", deps.now(), null);
  return snapshot;
}

function buildSnapshot(
  source: SourceDto,
  content: string,
  fetchedAt: Date,
  userInfo: SubscriptionResponseInfo | null
): RefreshSourceResult {
  let parsed;
  try {
    parsed = parseSubscription(content);
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    return { ok: false, error: sanitizeErrorMessage(`解析失败: ${name}`) };
  }

  if (parsed.nodes.length === 0) {
    return { ok: false, error: summarizeParseErrors(parsed.errors) };
  }

  return {
    ok: true,
    snapshot: {
      sourceId: source.id,
      nodes: parsed.nodes,
      nodeCount: parsed.nodes.length,
      fetchedAt: fetchedAt.toISOString(),
      ...(userInfo ? { userInfo } : {}),
      parseErrors: parsed.errors.slice(0, MAX_PARSE_ERRORS),
    },
  };
}
