/** 管理端统一的时间/数字格式化，纯函数，方便单测。 */

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function formatRelativeTime(value?: string | null, now: number = Date.now()): string {
  if (!value) return "从未";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffSeconds = Math.floor((now - date.getTime()) / 1000);
  if (diffSeconds < 10) return "刚刚";
  if (diffSeconds < 60) return `${diffSeconds} 秒前`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export function formatDuration(ms?: number | null): string {
  if (ms === undefined || ms === null || Number.isNaN(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes} 分 ${seconds} 秒`;
}

export function formatPercent(part: number, total: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

/** 千分位，用于较大的节点数 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("zh-CN");
}
