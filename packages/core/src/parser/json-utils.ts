import { safeParseJsonObject } from "../json";

export function parseJsonObject(text: string): Record<string, unknown> | null {
  return safeParseJsonObject(text);
}

export function parseJsonStringMap(text: string): Record<string, string> | undefined {
  const parsed = parseJsonObject(text);
  if (!parsed) return undefined;

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    if (typeof value === "string") out[normalizedKey] = value;
    else if (typeof value === "number" || typeof value === "boolean") out[normalizedKey] = String(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
