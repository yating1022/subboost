export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const URL_SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;

export type ParsedNeutralUrl = {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  searchParams: URLSearchParams;
};

/**
 * 轻量解析分享链接：
 * - 不依赖浏览器对整条 URL 的 WHATWG 解析，以避免旧版 Chromium 在超长查询串上
 *   出现 userinfo/host/port 解析异常。
 * - 仅对 query 部分继续使用 URLSearchParams；authority/path/hash 都由我们手动拆分。
 */
export function parseUrlWithNeutralScheme(value: string): ParsedNeutralUrl {
  const schemeMatch = URL_SCHEME_RE.exec(value);
  if (!schemeMatch) {
    throw new TypeError("Invalid URL");
  }

  const protocol = `${schemeMatch[1].toLowerCase()}:`;
  let rest = value.slice(schemeMatch[0].length);

  let hash = "";
  const hashIndex = rest.indexOf("#");
  if (hashIndex !== -1) {
    hash = rest.slice(hashIndex);
    rest = rest.slice(0, hashIndex);
  }

  let search = "";
  const queryIndex = rest.indexOf("?");
  if (queryIndex !== -1) {
    search = rest.slice(queryIndex);
    rest = rest.slice(0, queryIndex);
  }

  let pathname = "";
  let authority = rest;
  const pathIndex = rest.indexOf("/");
  if (pathIndex !== -1) {
    authority = rest.slice(0, pathIndex);
    pathname = rest.slice(pathIndex);
  }

  let userInfo = "";
  let hostPort = authority;
  const atIndex = authority.lastIndexOf("@");
  if (atIndex !== -1) {
    userInfo = authority.slice(0, atIndex);
    hostPort = authority.slice(atIndex + 1);
  }

  let username = "";
  let password = "";
  if (userInfo) {
    const userInfoColonIndex = userInfo.indexOf(":");
    if (userInfoColonIndex === -1) {
      username = userInfo;
    } else {
      username = userInfo.slice(0, userInfoColonIndex);
      password = userInfo.slice(userInfoColonIndex + 1);
    }
  }

  let hostname = "";
  let port = "";
  if (hostPort.startsWith("[")) {
    const ipv6End = hostPort.indexOf("]");
    if (ipv6End === -1) {
      throw new TypeError("Invalid URL");
    }
    hostname = hostPort.slice(1, ipv6End);
    const afterIpv6 = hostPort.slice(ipv6End + 1);
    if (afterIpv6.startsWith(":")) {
      port = afterIpv6.slice(1);
    } else if (afterIpv6.length > 0) {
      throw new TypeError("Invalid URL");
    }
  } else {
    const lastColonIndex = hostPort.lastIndexOf(":");
    const hasSingleColon = lastColonIndex !== -1 && hostPort.indexOf(":") === lastColonIndex;
    if (hasSingleColon) {
      hostname = hostPort.slice(0, lastColonIndex);
      port = hostPort.slice(lastColonIndex + 1);
    } else {
      hostname = hostPort;
    }
  }

  return {
    protocol,
    username,
    password,
    hostname,
    port,
    pathname,
    search,
    hash,
    searchParams: new URLSearchParams(search.startsWith("?") ? search.slice(1) : search),
  };
}

/**
 * 一些订阅生成器会用 `application/x-www-form-urlencoded` 语义编码节点名称：
 * - 空格会被编码为 `+`（而不是 `%20`）
 *
 * 这会导致仅使用 decodeURIComponent() 解码时，名称里的空格变成 `+`。
 */
export function safeDecodeFormUrlEncoded(value: string): string {
  if (!value) return value;
  const normalized = value.replace(/\+/g, "%20");
  try {
    return decodeURIComponent(normalized);
  } catch {
    return safeDecodeURIComponent(value);
  }
}
