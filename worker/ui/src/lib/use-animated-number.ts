import * as React from "react";

const EASE_OUT_CUBIC = (progress: number) => 1 - Math.pow(1 - progress, 3);

/**
 * 数字变化时做一次缓动过渡，用于仪表板的计数动画。
 * 首帧直接返回目标值（SSR / 首屏不闪烁），只有后续变化才逐帧插值。
 */
export function useAnimatedNumber(value: number, durationMs = 640): number {
  const [display, setDisplay] = React.useState(value);
  const previous = React.useRef(value);
  const frame = React.useRef<number | null>(null);

  React.useEffect(() => {
    const from = previous.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    previous.current = to;

    if (typeof requestAnimationFrame !== "function") {
      setDisplay(to);
      return;
    }

    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const next = from + (to - from) * EASE_OUT_CUBIC(progress);
      setDisplay(progress >= 1 ? to : Math.round(next));
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [value, durationMs]);

  return display;
}
