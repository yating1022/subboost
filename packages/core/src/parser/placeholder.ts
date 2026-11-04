import type { ParsedNode } from "@subboost/core/types/node";

export const CLIENT_UPDATE_PLACEHOLDER_ERROR = "检测到客户端更新提示占位节点，已自动忽略";

type PlaceholderNodeLike = Pick<ParsedNode, "name" | "server" | "port"> | null | undefined;

export function isClientUpdatePlaceholderNode(node: PlaceholderNodeLike): boolean {
  if (!node) return false;

  const name = typeof node.name === "string" ? node.name.trim() : "";
  const serverRaw =
    typeof node.server === "string" ? node.server.trim().toLowerCase().replace(/\.$/, "") : "";
  const port = typeof node.port === "number" ? node.port : Number(node.port);

  const isLoopback =
    serverRaw === "127.0.0.1" ||
    serverRaw === "localhost" ||
    serverRaw === "0.0.0.0" ||
    serverRaw === "::1" ||
    serverRaw === "[::1]";
  const isDummyPort = Number.isFinite(port) && port <= 1;
  const hasUpdateHint = /v2rayn|clash|版本|太旧|过旧|更新|upgrade|update/i.test(name);

  return Boolean(isLoopback && isDummyPort && hasUpdateHint);
}

export function looksLikeClientUpdatePlaceholderNodes(nodes: ParsedNode[]): boolean {
  return Array.isArray(nodes) && nodes.length === 1 && isClientUpdatePlaceholderNode(nodes[0]);
}

export function filterClientUpdatePlaceholderNodes<T extends ParsedNode>(nodes: T[]): {
  nodes: T[];
  filteredCount: number;
} {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { nodes: [], filteredCount: 0 };
  }

  const filteredNodes = nodes.filter((node) => !isClientUpdatePlaceholderNode(node));
  return {
    nodes: filteredNodes,
    filteredCount: nodes.length - filteredNodes.length,
  };
}

export function hasClientUpdatePlaceholderError(errors: string[]): boolean {
  return Array.isArray(errors) && errors.some((error) => error === CLIENT_UPDATE_PLACEHOLDER_ERROR);
}
