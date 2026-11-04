export function splitWsPathEarlyData(rawPath: string): { path: string; earlyData?: number } {
  const value = (rawPath || "/").trim() || "/";
  const queryIndex = value.indexOf("?");
  if (queryIndex === -1) return { path: value };

  const basePath = value.slice(0, queryIndex) || "/";
  const query = value.slice(queryIndex + 1);
  const kept: string[] = [];
  let earlyData: number | undefined;

  for (const segment of query.split("&")) {
    if (!segment) continue;

    const eqIndex = segment.indexOf("=");
    const key = eqIndex === -1 ? segment : segment.slice(0, eqIndex);
    const rawValue = eqIndex === -1 ? "" : segment.slice(eqIndex + 1);

    if (key === "ed" && earlyData === undefined && /^\d+$/.test(rawValue)) {
      const parsed = Number.parseInt(rawValue, 10);
      if (Number.isSafeInteger(parsed) && parsed > 0) {
        earlyData = parsed;
        continue;
      }
    }

    kept.push(segment);
  }

  if (earlyData === undefined) return { path: value };

  const path = kept.length > 0 ? `${basePath}?${kept.join("&")}` : basePath;
  return { path: path || "/", earlyData };
}
