export function normalizePortsSpec(value: string): string {
  return value
    .trim()
    .replace(/[;/]/g, ",")
    .replace(/\s+/g, "");
}

export function normalizePortsSpecValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    const normalized = normalizePortsSpec(String(value));
    return normalized || undefined;
  }
  if (typeof value !== "string") return undefined;

  const normalized = normalizePortsSpec(value);
  return normalized || undefined;
}

export function parsePortNumber(value: unknown): number | undefined {
  const port =
    typeof value === "number" && Number.isInteger(value)
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number.parseInt(value.trim(), 10)
        : undefined;

  if (port === undefined) return undefined;
  return port >= 1 && port <= 65535 ? port : undefined;
}

export function pickStablePortFromPorts(ports: string): number {
  const normalized = normalizePortsSpec(ports);
  const parts = normalized
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  type Segment = { kind: "port"; port: number } | { kind: "range"; from: number; to: number };
  const segments: Segment[] = [];
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const p = Number.parseInt(part, 10);
      if (Number.isInteger(p) && p >= 1 && p <= 65535) segments.push({ kind: "port", port: p });
      continue;
    }
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const from = Number.parseInt(range[1], 10);
      const to = Number.parseInt(range[2], 10);
      if (
        Number.isInteger(from) &&
        Number.isInteger(to) &&
        from >= 1 &&
        to <= 65535 &&
        from <= to
      ) {
        segments.push({ kind: "range", from, to });
      }
    }
  }

  const includes443 = segments.some((seg) =>
    seg.kind === "port" ? seg.port === 443 : seg.from <= 443 && 443 <= seg.to
  );
  if (includes443) return 443;

  const first = segments[0];
  if (!first) return 443;
  return first.kind === "port" ? first.port : first.from;
}
