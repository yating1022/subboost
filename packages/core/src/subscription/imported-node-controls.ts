import type { ParsedNode } from "../types/node";

const IMPORTED_NODE_CONTROL_FIELDS = new Set<string>(["dialer-proxy", "dialer_proxy"]);

export function stripImportedNodeControlFields(node: ParsedNode): ParsedNode {
  if (!node || typeof node !== "object") return node;

  const record = node as unknown as Record<string, unknown>;
  let changed = false;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (IMPORTED_NODE_CONTROL_FIELDS.has(key)) {
      changed = true;
      continue;
    }
    sanitized[key] = value;
  }

  return changed ? (sanitized as ParsedNode) : node;
}

export function stripImportedNodeControlFieldsFromList(nodes: ParsedNode[]): ParsedNode[] {
  return nodes.map(stripImportedNodeControlFields);
}
