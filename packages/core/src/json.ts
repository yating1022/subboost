function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export type JsonParseResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export function tryParseJson<T = unknown>(text: string): JsonParseResult<T> {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (error) {
    return { ok: false, error };
  }
}

export function safeParseJson<T>(text: string, fallback: T): T {
  const parsed = tryParseJson<T>(text);
  return parsed.ok ? parsed.value : fallback;
}

export function safeParseJsonObject(text: string): Record<string, unknown> | null {
  const parsed = safeParseJson<unknown>(text, null);
  return isRecord(parsed) ? parsed : null;
}
