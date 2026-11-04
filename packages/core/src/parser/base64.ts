/**
 * Base64 解码工具
 */

function safeDecodeURIComponentForBase64(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function normalizeBase64(input: string): string {
  // 一些分享链接会对 Base64 字符串做 URL 编码（如 %3D / %2B / %2F），这里先尝试解码。
  // decodeURIComponent 对普通 Base64（不含 %）不会产生影响。
  let base64 = safeDecodeURIComponentForBase64(input);

  // 去除空白字符
  base64 = base64.replace(/\s/g, "");

  // URL-safe Base64 转换
  base64 = base64.replace(/-/g, "+").replace(/_/g, "/");

  // 添加填充
  const padding = (4 - (base64.length % 4)) % 4;
  base64 += "=".repeat(padding);

  return base64;
}

function base64ToBytes(base64: string): Uint8Array {
  // Node.js 环境优先用 Buffer（正确处理 UTF-8）
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(base64, "base64"));
  }

  // 浏览器环境：atob 得到“二进制字符串”再转 bytes
  if (typeof atob !== "function") {
    throw new Error("当前环境不支持 Base64 解码");
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder === "function") {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  // 兜底：退化为 Latin-1（二进制字符串）。极少数老环境才会走到这里。
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

/**
 * 解码 Base64 字符串（支持标准和 URL-safe 格式）
 */
export function decodeBase64(str: string): string {
  try {
    const base64 = normalizeBase64(str);
    const bytes = base64ToBytes(base64);
    return bytesToUtf8(bytes);
  } catch {
    throw new Error("无效的 Base64 编码");
  }
}

/**
 * 安全解码 Base64（不抛出异常）
 */
export function safeDecodeBase64(str: string): string | null {
  try {
    return decodeBase64(str);
  } catch {
    return null;
  }
}

/**
 * 编码为 Base64
 */
export function encodeBase64(str: string): string {
  // Node.js 环境优先用 Buffer（正确处理 UTF-8）
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf8").toString("base64");
  }

  if (typeof TextEncoder !== "function" || typeof btoa !== "function") {
    throw new Error("当前环境不支持 Base64 编码");
  }

  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * 解析 Base64 编码的订阅内容
 */
export function parseBase64(content: string): string {
  const decoded = decodeBase64(content);
  
  // 验证解码结果是否包含不可打印字符（可能是二进制数据）
  if (/[\x00-\x08\x0E-\x1F]/.test(decoded)) {
    throw new Error("解码结果包含无效字符，可能不是文本内容");
  }

  return decoded;
}

