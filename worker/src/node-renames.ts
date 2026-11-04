import { buildNodeContentKey } from "@subboost/core/node-identity";
import type { ParsedNode } from "@subboost/core/types/node";
import {
  MAX_NODE_NAME_LENGTH,
  MAX_NODE_RENAMES,
  MAX_PREVIEW_NODES,
  type NodeRenames,
  type NodeSummary,
} from "./types";
const FNV_PRIME = 0x01000193;
// 两个不同的 FNV offset basis，拼成 64 位强度，避免依赖 BigInt（target 是 ES2017）
const FNV_SEED_A = 0x811c9dc5;
const FNV_SEED_B = 0x2545f491;
const RENAME_KEY_PATTERN = /^[0-9a-f]{16}$/;

function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/**
 * 节点内容指纹的短哈希（16 位十六进制）。
 * 用同步实现而不是 WebCrypto，方便在纯函数与测试里直接复用。
 */
export function hashNodeKey(input: string): string {
  const high = fnv1a32(input, FNV_SEED_A).toString(16).padStart(8, "0");
  const low = fnv1a32(input, FNV_SEED_B).toString(16).padStart(8, "0");
  return `${high}${low}`;
}

export function isRenameKey(value: unknown): value is string {
  return typeof value === "string" && RENAME_KEY_PATTERN.test(value);
}

/**
 * 节点重命名映射的 key：节点内容指纹（忽略名称）。
 * 名称改了 key 不变，因此重命名可以反复覆盖；
 * 服务器/端口/凭据等身份字段变化后 key 改变，旧映射自动失效。
 */
export function nodeRenameKey(node: ParsedNode): string {
  return hashNodeKey(buildNodeContentKey(node));
}

export function applyNodeRenames(node: ParsedNode, renames?: NodeRenames): ParsedNode {
  if (!renames) return node;
  const next = renames[nodeRenameKey(node)];
  if (!next || next === node.name) return node;
  return { ...(node as unknown as Record<string, unknown>), name: next } as unknown as ParsedNode;
}

function nodeType(node: ParsedNode): string {
  return typeof node.type === "string" ? node.type : "unknown";
}

function nodeServer(node: ParsedNode): string | undefined {
  return typeof node.server === "string" && node.server.trim() ? node.server : undefined;
}

function nodePort(node: ParsedNode): number | undefined {
  return typeof node.port === "number" && Number.isFinite(node.port) ? node.port : undefined;
}

function nodeOriginName(node: ParsedNode): string {
  return typeof node.name === "string" ? node.name : "";
}

export function toNodeSummary(node: ParsedNode, renames?: NodeRenames): NodeSummary {
  const key = nodeRenameKey(node);
  const originName = nodeOriginName(node);
  const renamed = renames?.[key];
  return {
    key,
    name: renamed ?? originName,
    originName,
    type: nodeType(node),
    ...(nodeServer(node) ? { server: nodeServer(node) } : {}),
    ...(nodePort(node) !== undefined ? { port: nodePort(node) } : {}),
    renamed: Boolean(renamed && renamed !== originName),
  };
}

export function collectNodeSummaries(
  nodes: ParsedNode[],
  renames?: NodeRenames,
  limit = MAX_PREVIEW_NODES
): NodeSummary[] {
  return nodes.slice(0, limit).map((node) => toNodeSummary(node, renames));
}

export function countRenamedNodes(nodes: ParsedNode[], renames?: NodeRenames): number {
  if (!renames) return 0;
  let count = 0;
  for (const node of nodes) {
    const next = renames[nodeRenameKey(node)];
    if (next && next !== nodeOriginName(node)) count += 1;
  }
  return count;
}

/**
 * 校验并清理客户端提交的重命名表：丢弃非法 key、空名称、超长名称与超出上限的条目。
 * 返回 undefined 表示没有任何有效条目。
 */
export function sanitizeNodeRenames(input: unknown): NodeRenames | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const out: NodeRenames = {};
  let count = 0;
  for (const [rawKey, rawName] of Object.entries(input as Record<string, unknown>)) {
    if (count >= MAX_NODE_RENAMES) break;
    const key = rawKey.trim();
    if (!isRenameKey(key)) continue;
    if (typeof rawName !== "string") continue;
    const name = rawName.trim();
    if (!name || name.length > MAX_NODE_NAME_LENGTH) continue;
    out[key] = name;
    count += 1;
  }
  return count > 0 ? out : undefined;
}

/** 协议分布（按节点数降序，同数量按协议名字典序）。 */
export function protocolBreakdown(nodes: ParsedNode[]): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const type = nodeType(node);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}
