function appendDirtyPathParams(url: URL, dirtyParams: string) {
  const params = new globalThis.URLSearchParams(dirtyParams);
  params.forEach((value, key) => {
    url.searchParams.append(key, value);
  });
}

/**
 * 尽量修复用户粘贴的“半坏 URL”。
 * 典型场景：
 * - `https://example.com/sub&token=abc`
 * - 分享面板把 query 错挂在 path 里
 */
export function normalizeSubscriptionUrlInput(raw: string): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return "";

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (!url.search && url.pathname.includes("&")) {
    const delimiterIndex = url.pathname.indexOf("&");
    if (delimiterIndex > 0 && delimiterIndex < url.pathname.length - 1) {
      const cleanPath = url.pathname.slice(0, delimiterIndex);
      const dirtyParams = url.pathname.slice(delimiterIndex + 1);
      if (cleanPath && dirtyParams) {
        url.pathname = cleanPath;
        appendDirtyPathParams(url, dirtyParams);
      }
    }
  }

  return url.toString();
}

export function tryNormalizeSubscriptionUrlInput(raw: string): string | null {
  const normalized = normalizeSubscriptionUrlInput(raw);
  if (!normalized) return null;

  try {
    return new URL(normalized).toString();
  } catch {
    return null;
  }
}
