import { validatePublicHttpUrl } from "./ssrf";

export class FetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchBlockedError";
  }
}

export class TooManyRedirectsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TooManyRedirectsError";
  }
}

export class ResponseTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResponseTooLargeError";
  }
}

export type SafeFetchDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export type SafeFetchOptions = {
  userAgent: string;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  maxRetries?: number;
};

export type SafeFetchResult = {
  status: number;
  headers: Record<string, string>;
  text: string;
  finalUrl: string;
};

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([500, 502, 503, 504, 429]);

const ACCEPT_HEADER = "text/plain, application/yaml, application/x-yaml, */*;q=0.8";

function isAbortError(err: unknown): boolean {
  return Boolean(err) && typeof err === "object" && (err as { name?: string }).name === "AbortError";
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel("response too large").catch(() => undefined);
      throw new ResponseTooLargeError("响应超过大小上限");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function performRequest(
  url: string,
  options: Required<Pick<SafeFetchOptions, "userAgent" | "timeoutMs" | "maxRedirects" | "maxBytes">>,
  deps: SafeFetchDeps
): Promise<SafeFetchResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  let currentUrl = url;
  let redirects = 0;

  while (true) {
    const validation = validatePublicHttpUrl(currentUrl);
    if (!validation.ok) throw new FetchBlockedError(validation.reason);

    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": options.userAgent,
          Accept: ACCEPT_HEADER,
        },
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw err;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) {
        return {
          status: response.status,
          headers: headersToRecord(response.headers),
          text: "",
          finalUrl: currentUrl,
        };
      }
      if (redirects >= options.maxRedirects) {
        throw new TooManyRedirectsError("重定向次数超过上限");
      }
      redirects += 1;
      let nextUrl: URL;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new FetchBlockedError("重定向地址无法解析");
      }
      const nextValidation = validatePublicHttpUrl(nextUrl.toString());
      if (!nextValidation.ok) throw new FetchBlockedError(nextValidation.reason);
      currentUrl = nextUrl.toString();
      continue;
    }

    const text = await readBodyWithLimit(response, options.maxBytes);
    return {
      status: response.status,
      headers: headersToRecord(response.headers),
      text,
      finalUrl: currentUrl,
    };
  }
}

export async function fetchText(
  url: string,
  options: SafeFetchOptions,
  deps: SafeFetchDeps = {}
): Promise<SafeFetchResult> {
  const resolved: Required<SafeFetchOptions> = {
    userAgent: options.userAgent,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRedirects: options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
  };
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let attempt = 0;
  while (true) {
    try {
      const result = await performRequest(url, resolved, deps);
      if (RETRYABLE_STATUS.has(result.status) && attempt < resolved.maxRetries) {
        attempt += 1;
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      return result;
    } catch (err) {
      if (
        err instanceof FetchBlockedError ||
        err instanceof TooManyRedirectsError ||
        err instanceof ResponseTooLargeError ||
        isAbortError(err)
      ) {
        throw err;
      }
      if (attempt >= resolved.maxRetries) throw err;
      attempt += 1;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
}

