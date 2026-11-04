import type { StatusRecord } from "../lib/types";

/**
 * 刷新状态的派生模型：把 StatusRecord 收敛成"一眼可读的结论 + 可排布的条目"。
 *
 * 抽成纯函数而不是写在组件里，是因为结论文案的分支（全成功 / 部分失败 /
 * 全部失败 / 未启用）和占比计算都需要能单独断言，不必渲染 DOM。
 */

export type RefreshTone = "ok" | "warn" | "error" | "idle";

/** 参与展示的一条结果：源或订阅，已经拍平成同一形状 */
export type RefreshEntry = {
  id: string;
  name: string;
  kind: "source" | "subscription";
  ok: boolean;
  /** 缺失时按 0 处理，避免占比计算里出现 NaN */
  nodeCount: number;
  error?: string;
  /** 该条占本轮源节点总数的百分比（0–100，已取整） */
  share: number;
};

export type RefreshBoard = {
  tone: RefreshTone;
  /** 一句话结论，直接放在看板顶部 */
  headline: string;
  /** 结论的补充说明，解释原因或下一步 */
  detail: string;
  /** 本轮参与刷新的对象总数（源 + 订阅），用于汇总条分母 */
  total: number;
  totalNodes: number;
  okCount: number;
  failedCount: number;
  sources: RefreshEntry[];
  subscriptions: RefreshEntry[];
};

function ratio(nodeCount: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((nodeCount / total) * 100);
}

function decorate(
  items: { id: string; name: string; ok: boolean; nodeCount?: number; error?: string }[],
  kind: RefreshEntry["kind"]
): RefreshEntry[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    kind,
    ok: item.ok,
    nodeCount: item.nodeCount ?? 0,
    ...(item.error ? { error: item.error } : {}),
    // 占比需要全量节点总数，等两侧都收齐后统一回填
    share: 0,
  }));
}

/**
 * 由状态记录构建看板。
 *
 * `nameOf` 把 id 映射成展示名；映射不到时回退到 id 本身，
 * 因为源被删除后旧状态里仍会留下它的 id，此时不该显示空白。
 */
export function buildRefreshBoard(
  status: StatusRecord | null,
  nameOf: {
    source: (id: string) => string | undefined;
    subscription: (id: string) => string | undefined;
  }
): RefreshBoard | null {
  if (!status) return null;

  const sources = decorate(
    status.sources.map((item) => ({
      id: item.sourceId,
      name: nameOf.source(item.sourceId) ?? item.sourceId,
      ok: item.ok,
      ...(item.nodeCount === undefined ? {} : { nodeCount: item.nodeCount }),
      ...(item.error ? { error: item.error } : {}),
    })),
    "source"
  );
  const subscriptions = decorate(
    status.subscriptions.map((item) => ({
      id: item.subscriptionId,
      name: nameOf.subscription(item.subscriptionId) ?? item.subscriptionId,
      ok: item.ok,
      ...(item.nodeCount === undefined ? {} : { nodeCount: item.nodeCount }),
      ...(item.error ? { error: item.error } : {}),
    })),
    "subscription"
  );

  const all = [...sources, ...subscriptions];
  // 占比只按源节点算：订阅的节点是源的聚合结果，混在一起会把同一批节点算两次
  const totalNodes = sources.reduce((sum, item) => sum + item.nodeCount, 0);
  const okCount = all.filter((item) => item.ok).length;
  const failedCount = all.length - okCount;

  const withShare = (items: RefreshEntry[]): RefreshEntry[] =>
    items.map((item) => ({ ...item, share: ratio(item.nodeCount, totalNodes) }));

  const failedEntries = all.filter((item) => !item.ok);

  let tone: RefreshTone;
  let headline: string;
  let detail: string;

  if (all.length === 0) {
    tone = "idle";
    headline = "本轮没有需要刷新的对象";
    detail = "启用一个源后，刷新才会抓取节点。";
  } else if (failedCount === 0) {
    tone = "ok";
    headline = `全部成功 · ${sources.length} 个源聚合 ${totalNodes} 个节点`;
    detail = `${subscriptions.length} 个订阅已重新生成，无需处理。`;
  } else if (okCount === 0) {
    tone = "error";
    headline = `全部失败 · ${failedCount} 个对象未能刷新`;
    detail = "检查上游地址是否可访问，以及网络是否被拦截。";
  } else {
    tone = "warn";
    headline = `部分失败 · ${failedCount} / ${all.length} 个对象失败`;
    detail = `失败项：${failedEntries.map((item) => item.name).join("、")}`;
  }

  return {
    tone,
    headline,
    detail,
    total: all.length,
    totalNodes,
    okCount,
    failedCount,
    sources: withShare(sources),
    subscriptions: withShare(subscriptions),
  };
}
