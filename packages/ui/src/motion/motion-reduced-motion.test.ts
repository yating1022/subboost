// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `useReducedMotion()` 读的是 motion-dom 的模块级单例（prefersReducedMotion.current），
 * 在首次调用时才用 matchMedia 初始化一次。vitest 默认把 node_modules 外部化，
 * `vi.resetModules()` 清不掉那份状态，`vi.stubGlobal("matchMedia")` 也就赶不上。
 *
 * 所以这个文件只做一件事：把 hook 本身 mock 成 true，
 * 单独验证 GrowBar 在「用户要求减少动态效果」时的分支。
 */

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => true };
});

afterEach(() => {
  cleanup();
});

describe("GrowBar with reduced motion", () => {
  it("lands on the target immediately instead of animating", async () => {
    const { GrowBar } = await import("./grow-bar");
    const { container } = render(React.createElement(GrowBar, { percent: 80, count: 4 }));

    // 不推进请求帧：减少动态效果时不该有增长过程，effect 里直接写入终值
    await act(async () => {});

    const label = container.querySelector('span[aria-hidden="true"] > span');
    expect(label?.textContent).toBe("4");
  });

  it("still applies the final fill width", async () => {
    const { GrowBar } = await import("./grow-bar");
    const { container } = render(React.createElement(GrowBar, { percent: 55, count: 3 }));

    await act(async () => {});

    const fill = container.querySelector(".origin-left") as HTMLElement;
    const raw = fill.style.transform || getComputedStyle(fill).transform;
    // 终值必须一次到位：65% 之类的中间值都不算通过
    expect(raw).toContain("0.55");
  });
});
