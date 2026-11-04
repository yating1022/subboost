"use client";

import * as React from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { cn } from "@subboost/ui/lib/utils";
import { GROW_BAR_SPRING } from "@subboost/ui/motion/tokens";

export type GrowBarProps = {
  /** 目标占比 0–100 */
  percent: number;
  /** 与条形同步增长的数值，例如节点数 */
  count: number;
  /** 进度条填充色（渐变或纯色） */
  fillClassName?: string;
  /** 轨道高度 */
  heightClassName?: string;
  className?: string;
};

/**
 * 物理弹簧驱动的进度条：填充与数字标签由**同一个** MotionValue 驱动，
 * 标签骑在填充末端上方随手感滑动。
 *
 * 三个东西必须同源，否则收尾会错开（数字到了、条还没满）：
 * - 条形填充：`progress` / 100
 * - 标签位置：同一个 `progress`
 * - 数字文本：订阅同一个 `progress`
 *
 * 示例代码里条宽和标签各跑一个 spring，参数相同但仍是两条独立动画：
 * 目标值变化时两者的起始值与速度可能不同步，收尾差一帧就会看到数字离开条末端。
 * 这里只保留一条动画，位置与宽度都是它的纯函数，天然不可能错位。
 *
 * 另外刻意用 `scaleX` 而不是动画 `width`：width 每帧都要重算布局，
 * scaleX 只走合成线程，动画期间不掉帧。
 */
export function GrowBar({
  percent,
  count,
  fillClassName,
  heightClassName = "h-1",
  className,
}: GrowBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const reduceMotion = useReducedMotion();

  // 目标占比做成 MotionValue：数据变化时 spring 从当前值继续推进，不会跳回起点
  const target = useMotionValue(clamped);
  const progress = useMotionValue(0);

  React.useEffect(() => {
    target.set(clamped);

    // 尊重「减少动态效果」：直接落到终点，不做增长过程
    if (reduceMotion) {
      progress.set(clamped);
      return;
    }

    const controls = animate(progress, clamped, GROW_BAR_SPRING);
    return () => controls.stop();
  }, [clamped, progress, target, reduceMotion]);

  const scaleX = useTransform(progress, (value) => value / 100);
  // max(1rem, …) 防止占比为 0 时标签跑到条形左端之外
  const left = useTransform(progress, (value) => `max(1rem, ${value}%)`);

  /*
   * 数字直接写 DOM 文本，不经过 React state。
   * 用 setState 时文本要等 React 提交，会比条形慢一帧，观感是"条到位了数字才跳上去"。
   * MotionValue 也不能直接当 children：它只绑定到 style / 属性，不会逐帧更新文本。
   */
  const valueRef = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const write = (value: number) => {
      const node = valueRef.current;
      if (!node) return;
      // 数字按同一进度换算，与条末端严格同步；除零时保持 0
      const ratio = clamped > 0 ? Math.min(1, Math.max(0, value / clamped)) : 0;
      node.textContent = String(Math.round(ratio * count));
    };
    write(progress.get());
    return progress.on("change", write);
  }, [progress, count, clamped]);

  return (
    <div className={cn("relative", className)}>
      {/*
        数字贴住填充末端：left 跟随进度，再用 -translate-x-full 让标签右缘对齐条末端。
        绝对定位不占布局高度，条形本身仍贴着行底。
      */}
      <motion.span
        aria-hidden="true"
        style={{ left }}
        className="pointer-events-none absolute -top-5 -translate-x-full whitespace-nowrap text-sm font-medium leading-none tabular-nums text-fg-70"
      >
        <span ref={valueRef}>0</span>
      </motion.span>

      <div className={cn("w-full overflow-hidden rounded-full bg-ink/10", heightClassName)}>
        <motion.div
          className={cn("h-full origin-left rounded-full", fillClassName)}
          style={{ scaleX }}
        />
      </div>

      {/* 视觉数字随动画变化，读屏需要稳定的最终值 */}
      <span className="sr-only">{count}</span>
    </div>
  );
}
