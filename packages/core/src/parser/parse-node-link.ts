import { parseNodeLinkByRegistry, normalizeNodeLinkScheme } from "./link-parsers";
import { canonicalizeParsedNode } from "./canonical-fields";
import type { ParsedNode } from "@subboost/core/types/node";

/**
 * 检测是否为裸代理格式（无协议前缀）
 */
export function isNakedProxyFormat(input: string): boolean {
  if (/^[^:@]+:\d+(?:\[[^\]]*\])?(?:\{[^}]*\})?$/.test(input) && input.includes(":")) return true;
  if (/^[^:@]+:\d+:[^:@]+:.+$/.test(input)) return true;
  if (/^[^:@]+:[^@]+@[^:@]+:\d+(?:\[[^\]]*\])?(?:\{[^}]*\})?$/.test(input)) return true;
  return false;
}

/**
 * 解析单个节点链接
 */
export function parseNodeLink(link: string): ParsedNode | null {
  const trimmedLink = link.trim();
  if (!trimmedLink) return null;

  const normalizedLink = normalizeNodeLinkScheme(trimmedLink);
  const parsed = parseNodeLinkByRegistry(normalizedLink);
  if (parsed) return canonicalizeParsedNode(parsed);

  if (isNakedProxyFormat(normalizedLink)) {
    throw new Error("无法识别的代理格式，请添加协议前缀 (如 socks5://, http://)");
  }

  const schemeMatch = normalizedLink.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  if (schemeMatch) {
    throw new Error(`不支持的协议: ${schemeMatch[1].toLowerCase()}`);
  }

  return null;
}
