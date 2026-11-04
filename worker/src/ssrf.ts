export type UrlValidation = { ok: true; url: URL } | { ok: false; reason: string };

const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal"];
const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

// IPv4 拦截网段（CIDR）
const BLOCKED_IPV4_RANGES: Array<[number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10.0.0.0/8
  [0x64400000, 10], // 100.64.0.0/10
  [0x7f000000, 8], // 127.0.0.0/8
  [0xa9fe0000, 16], // 169.254.0.0/16
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0000000, 24], // 192.0.0.0/24
  [0xc0000200, 24], // 192.0.2.0/24
  [0xc0586300, 24], // 192.88.99.0/24
  [0xc0a80000, 16], // 192.168.0.0/16
  [0xc6120000, 15], // 198.18.0.0/15
  [0xc6336400, 24], // 198.51.100.0/24
  [0xcb007100, 24], // 203.0.113.0/24
  [0xe0000000, 4], // 224.0.0.0/4
  [0xf0000000, 4], // 240.0.0.0/4
].map(([base, prefix]) => [base, prefix] as [number, number]);

// IPv6 拦截网段（已展开为 8 组 16 位整数）
const BLOCKED_IPV6_RANGES: Array<[number[], number]> = [
  [[0, 0, 0, 0, 0, 0, 0, 0], 128], // ::
  [[0, 0, 0, 0, 0, 0, 0, 1], 128], // ::1
  [[0xfc00, 0, 0, 0, 0, 0, 0, 0], 7], // fc00::/7
  [[0xfe80, 0, 0, 0, 0, 0, 0, 0], 10], // fe80::/10
  [[0xfec0, 0, 0, 0, 0, 0, 0, 0], 10], // fec0::/10
  [[0xff00, 0, 0, 0, 0, 0, 0, 0], 8], // ff00::/8
  [[0, 0, 0, 0, 0, 0xffff, 0, 0], 96], // ::ffff:0:0/96
  [[0x0064, 0xff9b, 0, 0, 0, 0, 0, 0], 96], // 64:ff9b::/96
  [[0x2002, 0, 0, 0, 0, 0, 0, 0], 16], // 2002::/16
];

function normalizeHostname(hostname: string): string {
  let value = hostname.trim().toLowerCase();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  while (value.endsWith(".")) value = value.slice(0, -1);
  return value;
}

function parseIPv4(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    result = (result << 8) | octet;
  }
  return result >>> 0;
}

function ipv4InRange(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) >>> 0 === (base & mask) >>> 0;
}

function isBlockedIPv4(value: number): boolean {
  return BLOCKED_IPV4_RANGES.some(([base, prefix]) => ipv4InRange(value, base, prefix));
}

// 解析 IPv4 数字字面量（如 http://2130706433/）
function parseNumericIPv4Literal(hostname: string): number | null {
  if (/^0x[0-9a-f]+$/.test(hostname)) {
    const value = Number.parseInt(hostname.slice(2), 16);
    return value >= 0 && value <= 0xffffffff ? value >>> 0 : null;
  }
  if (/^\d+$/.test(hostname)) {
    const value = Number(hostname);
    return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff ? value >>> 0 : null;
  }
  return null;
}

function parseIPv6(value: string): number[] | null {
  let input = value.trim().toLowerCase();
  if (input.startsWith("[") && input.endsWith("]")) input = input.slice(1, -1);
  if (input.includes("%")) input = input.slice(0, input.indexOf("%"));

  // 处理 IPv4 结尾（如 ::ffff:10.0.0.1）
  let ipv4Tail: number[] = [];
  const lastColon = input.lastIndexOf(":");
  const tail = lastColon >= 0 ? input.slice(lastColon + 1) : input;
  if (tail.includes(".")) {
    const ipv4 = parseIPv4(tail);
    if (ipv4 === null) return null;
    ipv4Tail = [(ipv4 >>> 16) & 0xffff, ipv4 & 0xffff];
    input = input.slice(0, lastColon + 1) + "0:0";
  }

  const doubleColonIndex = input.indexOf("::");
  if (doubleColonIndex >= 0 && input.indexOf("::", doubleColonIndex + 1) >= 0) return null;

  let head: string[] = [];
  let tailGroups: string[] = [];
  if (doubleColonIndex >= 0) {
    const before = input.slice(0, doubleColonIndex);
    const after = input.slice(doubleColonIndex + 2);
    head = before ? before.split(":") : [];
    tailGroups = after ? after.split(":") : [];
  } else {
    head = input.split(":");
  }

  const groups: number[] = [];
  for (const group of head) {
    if (group === "") return null;
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    groups.push(Number.parseInt(group, 16));
  }

  const tailNumbers: number[] = [];
  for (const group of tailGroups) {
    if (group === "") return null;
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    tailNumbers.push(Number.parseInt(group, 16));
  }

  const totalKnown = groups.length + tailNumbers.length + ipv4Tail.length;
  if (doubleColonIndex >= 0) {
    if (totalKnown > 7) return null;
    const zeros = new Array(8 - totalKnown).fill(0);
    return [...groups, ...zeros, ...tailNumbers, ...ipv4Tail];
  }

  if (totalKnown !== 8) return null;
  return [...groups, ...tailNumbers, ...ipv4Tail];
}

function ipv6InRange(value: number[], base: number[], prefix: number): boolean {
  let bitsLeft = prefix;
  for (let index = 0; index < 8 && bitsLeft > 0; index += 1) {
    const take = Math.min(16, bitsLeft);
    const mask = take === 0 ? 0 : (0xffff << (16 - take)) & 0xffff;
    if ((value[index] & mask) !== (base[index] & mask)) return false;
    bitsLeft -= take;
  }
  return true;
}

function isBlockedIPv6(value: number[]): boolean {
  if (BLOCKED_IPV6_RANGES.some(([base, prefix]) => ipv6InRange(value, base, prefix))) return true;
  // ::ffff:0:0/96 映射地址按 IPv4 规则判断
  if (
    value[0] === 0 &&
    value[1] === 0 &&
    value[2] === 0 &&
    value[3] === 0 &&
    value[4] === 0 &&
    value[5] === 0xffff
  ) {
    const ipv4 = ((value[6] << 16) | value[7]) >>> 0;
    return isBlockedIPv4(ipv4);
  }
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return true;

  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;

  const ipv4 = parseIPv4(normalized);
  if (ipv4 !== null) return isBlockedIPv4(ipv4);

  const numeric = parseNumericIPv4Literal(normalized);
  if (numeric !== null) return isBlockedIPv4(numeric);

  if (normalized.includes(":")) {
    const ipv6 = parseIPv6(normalized);
    if (ipv6 === null) return true;
    return isBlockedIPv6(ipv6);
  }

  return false;
}

export function validatePublicHttpUrl(input: string): UrlValidation {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "URL 无法解析" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "仅允许 http/https 协议" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "URL 不允许包含用户名密码" };
  }
  if (isBlockedHostname(url.hostname)) {
    return { ok: false, reason: "目标地址不允许" };
  }
  return { ok: true, url };
}
