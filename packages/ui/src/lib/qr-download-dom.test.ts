// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadQrPng } from "./qr-download";

/**
 * downloadQrPng 的真实逻辑全在「有 DOM 时怎么走」这一侧：
 * 建画布、补白边、转 blob、造 <a> 触发下载、回收 URL。
 *
 * qr-download.test.ts 跑在 node 下，只能覆盖「没有 canvas / 没有 document」的
 * 早退分支。这里用 jsdom 把成功路径与各个异常出口都走一遍。
 */

type FakeCanvas = {
  width: number;
  height: number;
  getContext: (type: string) => unknown;
  toBlob?: (cb: (blob: Blob | null) => void, type: string) => void;
};

function makeContext() {
  return {
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
}

function makeSource(width = 200, height = 200): HTMLCanvasElement {
  return {
    width,
    height,
    getContext: () => makeContext(),
    toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob(["png"], { type: "image/png" })),
  } as unknown as HTMLCanvasElement;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downloadQrPng in a DOM", () => {
  it("pads the canvas, converts to a blob and triggers a download", async () => {
    const created: FakeCanvas[] = [];
    const clicks: string[] = [];

    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag === "canvas") {
        const canvas: FakeCanvas = {
          width: 0,
          height: 0,
          getContext: () => makeContext(),
          toBlob: (cb) => cb(new Blob(["png"], { type: "image/png" })),
        };
        created.push(canvas);
        return canvas as unknown as HTMLElement;
      }
      const anchor = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
      vi.spyOn(anchor, "click").mockImplementation(() => {
        clicks.push(anchor.download);
      });
      return anchor;
    }) as typeof document.createElement);

    const createObjectURL = vi.fn(() => "blob:qr");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const ok = await downloadQrPng(makeSource(200, 200), "sub-qr.png", { padding: 10 });

    expect(ok).toBe(true);
    // 补白边：200 + 10*2 = 220
    expect(created[0]?.width).toBe(220);
    expect(created[0]?.height).toBe(220);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicks).toEqual(["sub-qr.png"]);
  });

  it("uses the default padding and white background when options are omitted", async () => {
    const contexts: Array<{ fillStyle: string; fillRect: unknown }> = [];

    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => {
            const context = makeContext();
            contexts.push(context);
            return context;
          },
          toBlob: (cb: (blob: Blob | null) => void) => cb(new Blob(["png"])),
        } as unknown as HTMLElement;
      }
      const anchor = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
      vi.spyOn(anchor, "click").mockImplementation(() => {});
      return anchor;
    }) as typeof document.createElement);

    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:qr", revokeObjectURL: () => {} });

    const ok = await downloadQrPng(makeSource(100, 100), "x-qr.png");

    expect(ok).toBe(true);
    // 默认背景必须是白色：深色主题下透明底会让二维码扫不出来
    expect(contexts[0]?.fillStyle).toBe("#ffffff");
    expect(contexts[0]?.fillRect).toHaveBeenCalledWith(0, 0, 148, 148);
  });

  it("fails when the 2d context is unavailable", async () => {
    vi.spyOn(document, "createElement").mockImplementation((() => ({
      width: 0,
      height: 0,
      getContext: () => null,
    })) as unknown as typeof document.createElement);

    await expect(downloadQrPng(makeSource(), "x-qr.png")).resolves.toBe(false);
  });

  it("fails when toBlob yields nothing", async () => {
    vi.spyOn(document, "createElement").mockImplementation((() => ({
      width: 0,
      height: 0,
      getContext: () => makeContext(),
      toBlob: (cb: (blob: Blob | null) => void) => cb(null),
    })) as unknown as typeof document.createElement);

    await expect(downloadQrPng(makeSource(), "x-qr.png")).resolves.toBe(false);
  });

  it("fails when the canvas has no toBlob implementation", async () => {
    vi.spyOn(document, "createElement").mockImplementation((() => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => makeContext(),
      };
      // 显式删掉，模拟老浏览器
      delete (canvas as { toBlob?: unknown }).toBlob;
      return canvas;
    }) as unknown as typeof document.createElement);

    await expect(downloadQrPng(makeSource(), "x-qr.png")).resolves.toBe(false);
  });

  it("fails when there is no document at all", async () => {
    vi.stubGlobal("document", undefined);

    await expect(downloadQrPng(makeSource(), "x-qr.png")).resolves.toBe(false);
  });

  it("swallows unexpected errors and reports failure", async () => {
    vi.spyOn(document, "createElement").mockImplementation((() => {
      throw new Error("boom");
    }) as unknown as typeof document.createElement);

    await expect(downloadQrPng(makeSource(), "x-qr.png")).resolves.toBe(false);
  });
});
