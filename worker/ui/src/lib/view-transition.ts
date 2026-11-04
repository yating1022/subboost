import { flushSync } from "react-dom";

/**
 * 页面切换过渡工具。
 *
 * 这里刻意**不用** View Transitions API。
 *
 * 原因：startViewTransition 在就绪前必须先把新旧内容各做一次整页快照（合成层级别的
 * 位图），这段工作跑在渲染主线程上且不可中断。在 CPU 降速 6x 的等价低端设备上实测，
 * 从调用到 `ready` 要阻塞主线程 25-89ms，期间界面完全冻结；正常速度的设备上也不会
 * 低于一帧的预算。页面越高、设备越弱，这段冻结越长，表现出来就是「切页时掉帧，
 * 而且动画看起来变成慢动作」——因为整段动画的起点被推迟了。
 *
 * 对比数据（1440x900 / DPR 2 / CPU 6x 降速，切页 5 次）：
 *   - 走 View Transition：>100ms 的卡顿帧 5 次，单帧最长 176-249ms
 *   - 不走 View Transition：>100ms 的卡顿帧 2-3 次，单帧最长 109ms
 * 把快照内的动画从 transform 换成纯 opacity，或只保留 root 快照，都消除不掉这段开销，
 * 说明成本来自「提交过渡」这个动作本身，而不是过渡里的属性。
 *
 * 替代方案：用一次同步提交 + CSS 入场动画（.animate-page-in）。React 直接改 DOM，
 * 没有快照步骤；动画只跑一个合成层，由合成线程驱动，不占用主线程。
 */

/**
 * 是否禁用页面过渡动画。
 *
 * 保留 `prefers-reduced-motion` 的尊重：用户在系统层面要求减少动效时直接切换。
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * 执行一次页面切换。
 *
 * `update` 里只需触发 React 状态变化。用 flushSync 保证在本次点击事件内完成 DOM 提交，
 * 避免更新被推迟到下一个任务、和点击反馈错开一帧。
 */
export function runPageTransition(update: () => void): void {
  if (prefersReducedMotion()) {
    update();
    return;
  }

  flushSync(update);
}
