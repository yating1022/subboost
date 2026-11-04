import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(join(__dirname, "globals.css"), "utf8");

/** 动画工具类：--animate-<name>: <keyframes 名> ... */
const ANIMATE_TOKENS = /--animate-([\w-]+):\s*([\w-]+)\s/gu;
/** @keyframes 定义 */
const KEYFRAME_BLOCKS = /@keyframes\s+([\w-]+)\s*\{/gu;

const tokenKeyframes = new Map(
  [...globalsCss.matchAll(ANIMATE_TOKENS)].map((match) => [match[1], match[2]])
);
const keyframeNames = new Set([...globalsCss.matchAll(KEYFRAME_BLOCKS)].map((match) => match[1]));

/** 覆盖层 / 弹窗 / 下拉 / Toast 的进出场：Radix Presence 靠退出动画决定何时卸载 */
const OVERLAY_MOTION = {
  "overlay-in": "overlayIn",
  "overlay-out": "overlayOut",
  "modal-in": "modalIn",
  "modal-out": "modalOut",
  "menu-in": "menuIn",
  "menu-out": "menuOut",
  "toast-in": "toastIn",
  "toast-out": "toastOut",
  "toast-progress": "toastProgress",
  "icon-pop": "iconPop",
} as const;

/** 这些关键帧绝不能再动 transform：会覆盖元素自身的 translate-* 定位 */
const NO_TRANSFORM_KEYFRAMES = ["pageIn", "modalIn", "modalOut", "menuIn", "menuOut", "popIn"];

/** 承载文字、进场过程中不许用 scale 的关键帧（缩放会让字形逐帧重采样而发虚） */
const SCALE_FREE_KEYFRAMES = [
  "pageIn",
  "modalIn",
  "modalOut",
  "menuIn",
  "menuOut",
  "popIn",
  "rise",
  "fadeInUp",
  "settleIn",
];

function keyframeBody(name: string): string {
  const start = globalsCss.indexOf(`@keyframes ${name}`);
  if (start < 0) return "";
  // 从声明的 { 起做一次大括号配平，避免正则截断嵌套规则
  let depth = 0;
  let i = globalsCss.indexOf("{", start);
  const from = i;
  for (; i < globalsCss.length; i += 1) {
    if (globalsCss[i] === "{") depth += 1;
    else if (globalsCss[i] === "}") {
      depth -= 1;
      if (depth === 0) return globalsCss.slice(from, i + 1);
    }
  }
  return "";
}

describe("motion tokens", () => {
  it("parses the stylesheet instead of silently matching nothing", () => {
    // 正则若与写法漂移，下面几条会变成空跑的假绿
    expect(tokenKeyframes.size).toBeGreaterThan(10);
    expect(keyframeNames.size).toBeGreaterThan(10);
  });

  it("points every motion token at its keyframes", () => {
    for (const [token, keyframes] of Object.entries(OVERLAY_MOTION)) {
      expect(tokenKeyframes.get(token)).toBe(keyframes);
    }
  });

  it("defines keyframes for every motion token", () => {
    const missing = Object.values(OVERLAY_MOTION).filter((name) => !keyframeNames.has(name));
    expect(missing).toEqual([]);
  });

  it("keeps entering/exiting pairs that Radix Presence can detect", () => {
    // 缺一个退出动画 → Radix 立即卸载 → 用户看到的仍是硬切
    for (const token of Object.keys(OVERLAY_MOTION)) {
      expect(tokenKeyframes.has(token)).toBe(true);
    }
    expect(tokenKeyframes.get("modal-out")).toBe("modalOut");
    expect(tokenKeyframes.get("menu-out")).toBe("menuOut");
    expect(tokenKeyframes.get("toast-out")).toBe("toastOut");
  });
});

describe("text rasterization", () => {
  it("never animates transform in page/dialog/menu keyframes", () => {
    // transform: scale()/translateY() 会触发逐帧重新栅格化：
    // 文字在动画期间发虚、结束后突变清晰，观感像"动画跑过头又被拉回"。
    // 这些关键帧必须只用独立的 opacity / translate / scale 属性。
    for (const name of NO_TRANSFORM_KEYFRAMES) {
      const body = keyframeBody(name);
      expect(body, `@keyframes ${name} 未找到`).not.toBe("");
      expect(body, `@keyframes ${name} 不得使用 transform`).not.toMatch(/(^|[^-\w])transform\s*:/u);
    }
  });

  it("keeps every text-bearing keyframe free of scale", () => {
    // 实测：scale: 0.96 让文字锐度从 25.535 掉到 23.372（-8.5%），
    // translate 则完全不变（25.535 → 25.535）。缩放期间浏览器要把已栅格化的
    // 文字位图逐帧重采样，字形边缘被插值糊掉，回到 scale:1 才重新变清晰。
    // 所以凡是承载文字的进场关键帧一律不许出现 scale。
    for (const name of SCALE_FREE_KEYFRAMES) {
      const body = keyframeBody(name);
      expect(body, `@keyframes ${name} 未找到`).not.toBe("");
      expect(body, `@keyframes ${name} 不得使用 scale`).not.toMatch(/(^|[^-\w])scale\s*:/u);
    }
  });

  it("still allows scale on the tiny icon keyframe", () => {
    // 16px 的图标没有可读文字，缩放不会造成"文字发虚"，
    // 而弹一下的反馈需要缩放来表达。这条断言防止为了统一而误删它。
    expect(keyframeBody("iconPop")).toMatch(/scale\s*:/u);
  });
});

describe("no overshoot", () => {
  /**
   * 带过冲的缓动（cubic-bezier 的 y 值 > 1）会让元素越过目标值再弹回来，
   * 观感就是"动画结束后被强制归位"。进场类动效一律用 y ≤ 1 的曲线，
   * 保证最后一帧精确落在终值上。
   */
  it("keeps entering animation easings from overshooting", () => {
    const tokens = [...globalsCss.matchAll(/--animate-([\w-]+):\s*[\w-]+\s+[\d.]+m?s\s+cubic-bezier\(([^)]+)\)/gu)];
    expect(tokens.length).toBeGreaterThan(0);
    for (const [, token, values] of tokens) {
      const points = values.split(",").map((value) => Number.parseFloat(value.trim()));
      // cubic-bezier(x1, y1, x2, y2)：y1 / y2 决定是否越过终值
      const [, y1, , y2] = points;
      expect(y1, `--animate-${token} 的 y1 不得 > 1（会过冲）`).toBeLessThanOrEqual(1);
      expect(y2, `--animate-${token} 的 y2 不得 > 1（会过冲）`).toBeLessThanOrEqual(1);
    }
  });
});

describe("scroll container overflow", () => {
  /**
   * 向下偏移会被滚动容器计入 scrollHeight：动画期间容器凭空多出一条滚动条。
   * 向上偏移只影响上方溢出，不计入可滚动区域，所以滚动容器内的入场必须向上。
   */
  it("keeps the in-scroller entrance moving upward", () => {
    const body = keyframeBody("settleIn");
    expect(body, "@keyframes settleIn 未找到").not.toBe("");
    // from 必须向上（负值），且不能出现向下的正位移
    expect(body).toMatch(/from\s*\{[^}]*translate:\s*0\s*-[\d.]+px/u);
    expect(body).not.toMatch(/translate:\s*0\s+[\d.]+px\s*;/u);
  });

  it("points the settle-in token at that keyframes", () => {
    expect(tokenKeyframes.get("settle-in")).toBe("settleIn");
  });
});
describe("positioning vs. animation property conflicts", () => {
  /**
   * Tailwind v4 的 translate-x/y-* 写的是独立的 translate 属性，
   * 和进出场关键帧里的 translate 是同一个属性，同时使用必然互相覆盖：
   * 动画期间定位被吞掉，元素从错位处飞入、结束再跳回，表现为「动画错位」。
   * 因此凡是自带 translate-* 定位的元素，其动画关键帧不得再写 translate。
   */
  it("does not let dialog positioning share the translate property with keyframes", () => {
    const dialogSource = readFileSync(
      join(__dirname, "../components/ui/dialog.tsx"),
      "utf8"
    );
    // 居中改由 grid 容器承担，内容元素上不应再有 translate-x/y 工具类
    expect(dialogSource).not.toMatch(/translate-[xy]-\[?-?[0-9]/u);
    // 但动画本身仍然要用 translate 做微位移
    expect(keyframeBody("modalIn")).toMatch(/translate\s*:/u);
  });

  it("keeps select offsets on margin so menu keyframes own translate", () => {
    const selectSource = readFileSync(
      join(__dirname, "../components/ui/select.tsx"),
      "utf8"
    );
    // 与触发器的间距用 margin，不能再用 translate-y-*
    expect(selectSource).not.toMatch(/(?:^|["\s])translate-[xy]-1/u);
    expect(selectSource).toMatch(/data-\[side=bottom\]:mt-1/u);
    // 菜单动画依赖 translate 做位移动画
    expect(keyframeBody("menuIn")).toMatch(/translate\s*:/u);
  });
});

describe("reduced motion", () => {
  it("keeps the escape hatch", () => {
    expect(globalsCss).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
