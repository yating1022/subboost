import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion, runPageTransition } from "./view-transition";

type TransitionStub = {
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  ready: Promise<void>;
  skipTransition: () => void;
};

function stubDocument(options: {
  startViewTransition?: (callback: () => void | Promise<void>) => TransitionStub;
}): void {
  vi.stubGlobal("document", {
    ...("startViewTransition" in options ? { startViewTransition: options.startViewTransition } : {}),
  });
}

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: reduced }),
  });
}

const settledTransition: TransitionStub = {
  finished: Promise.resolve(),
  updateCallbackDone: Promise.resolve(),
  ready: Promise.resolve(),
  skipTransition: () => {},
};

beforeEach(() => {
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("page transition helper", () => {
  /**
   * 回归护栏：View Transitions 的整页快照会阻塞主线程（实测低端设备 25-89ms），
   * 是切页掉帧的主因。即使浏览器支持，也必须完全不调用 startViewTransition。
   */
  it("never uses the View Transitions API even when the browser supports it", () => {
    const startViewTransition = vi.fn(() => settledTransition);
    stubDocument({ startViewTransition });

    runPageTransition(() => {});

    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it("runs the update synchronously in the same call", () => {
    stubDocument({ startViewTransition: () => settledTransition });
    const calls: string[] = [];

    runPageTransition(() => calls.push("update"));

    // flushSync 语义：返回前 update 已经执行完
    expect(calls).toEqual(["update"]);
  });

  it("treats a missing window or matchMedia as no-op safe", () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("window", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("reports reduced motion preference and survives a throwing matchMedia", () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);

    vi.stubGlobal("window", {
      matchMedia: () => {
        throw new Error("boom");
      },
    });
    expect(prefersReducedMotion()).toBe(false);
  });

  it("still runs the update when the user prefers reduced motion", () => {
    stubMatchMedia(true);
    const update = vi.fn();

    runPageTransition(update);

    expect(update).toHaveBeenCalledTimes(1);
  });

  it("does not throw when no View Transitions API exists at all", () => {
    stubDocument({});
    expect(() => runPageTransition(() => {})).not.toThrow();
  });
});
