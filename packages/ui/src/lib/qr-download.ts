/** 二维码导出相关的文件名与下载工具，保持纯函数便于测试 */

/** 把订阅名转成安全的下载文件名片段：去掉非法字符与首尾空格 */
export function toSafeFileSlug(name: string, fallback = "subscription"): string {
  const slug = name
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug.length > 0 ? slug.slice(0, 60) : fallback;
}

export function buildQrFileName(name: string): string {
  return `${toSafeFileSlug(name)}-qr.png`;
}

/**
 * 从二维码画布导出 PNG 并触发下载。
 * 四周补白边，保证二维码在深色背景下仍可被扫描。
 */
export async function downloadQrPng(
  source: HTMLCanvasElement | null,
  fileName: string,
  options: { padding?: number; background?: string } = {}
): Promise<boolean> {
  if (!source) return false;
  const padding = options.padding ?? 24;
  const background = options.background ?? "#ffffff";

  let exportCanvas: HTMLCanvasElement;
  try {
    const document = globalThis.document;
    if (!document) return false;
    exportCanvas = document.createElement("canvas");
    exportCanvas.width = source.width + padding * 2;
    exportCanvas.height = source.height + padding * 2;
    const context = exportCanvas.getContext("2d");
    if (!context) return false;
    context.fillStyle = background;
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    context.drawImage(source, padding, padding);

    const blob = await new Promise<Blob | null>((resolve) => {
      if (typeof exportCanvas.toBlob === "function") {
        exportCanvas.toBlob((result) => resolve(result), "image/png");
        return;
      }
      resolve(null);
    });
    if (!blob) return false;

    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      // 交给浏览器读完 blob 后再回收
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return true;
  } catch {
    return false;
  }
}
