import { describe, expect, it } from "vitest";
import { buildRefreshBoard } from "./refresh-board";
import type { StatusRecord } from "./types";

const NAMES = {
  source: (id: string) => ({ s1: "机场 A", s2: "机场 B" })[id as "s1" | "s2"],
  subscription: (id: string) => ({ sub1: "默认订阅" })[id as "sub1"],
};

function status(partial: Partial<StatusRecord>): StatusRecord {
  return {
    lastRunAt: "2026-10-12T00:00:00.000Z",
    lastTrigger: "manual",
    durationMs: 16,
    sources: [],
    subscriptions: [],
    ...partial,
  };
}

describe("buildRefreshBoard", () => {
  it("returns null without a status record", () => {
    expect(buildRefreshBoard(null, NAMES)).toBeNull();
  });

  it("reports an all-success run with the aggregated node count", () => {
    const board = buildRefreshBoard(
      status({
        sources: [
          { sourceId: "s1", ok: true, nodeCount: 2 },
          { sourceId: "s2", ok: true, nodeCount: 1 },
        ],
        subscriptions: [{ subscriptionId: "sub1", ok: true, nodeCount: 3 }],
      }),
      NAMES
    );

    expect(board?.tone).toBe("ok");
    expect(board?.headline).toContain("全部成功");
    expect(board?.totalNodes).toBe(3);
    expect(board?.failedCount).toBe(0);
    expect(board?.detail).toContain("1 个订阅");
  });

  it("computes each source share from source nodes only", () => {
    const board = buildRefreshBoard(
      status({
        sources: [
          { sourceId: "s1", ok: true, nodeCount: 3 },
          { sourceId: "s2", ok: true, nodeCount: 1 },
        ],
        // 订阅的 4 个节点是源的聚合结果，不能再计入分母
        subscriptions: [{ subscriptionId: "sub1", ok: true, nodeCount: 4 }],
      }),
      NAMES
    );

    expect(board?.sources.map((item) => item.share)).toEqual([75, 25]);
    expect(board?.totalNodes).toBe(4);
  });

  it("marks a partial failure and names the failing entries", () => {
    const board = buildRefreshBoard(
      status({
        sources: [
          { sourceId: "s1", ok: true, nodeCount: 2 },
          { sourceId: "s2", ok: false, nodeCount: 0, error: "上游返回 502" },
        ],
        subscriptions: [{ subscriptionId: "sub1", ok: true, nodeCount: 2 }],
      }),
      NAMES
    );

    expect(board?.tone).toBe("warn");
    expect(board?.headline).toContain("部分失败");
    expect(board?.failedCount).toBe(1);
    expect(board?.detail).toContain("机场 B");
    expect(board?.sources[1].error).toBe("上游返回 502");
  });

  it("marks a fully failed run as an error", () => {
    const board = buildRefreshBoard(
      status({ sources: [{ sourceId: "s1", ok: false, error: "timeout" }] }),
      NAMES
    );

    expect(board?.tone).toBe("error");
    expect(board?.headline).toContain("全部失败");
    expect(board?.okCount).toBe(0);
  });

  it("falls back to the raw id when a name is gone", () => {
    const board = buildRefreshBoard(
      status({ sources: [{ sourceId: "deleted-source", ok: true, nodeCount: 1 }] }),
      NAMES
    );

    expect(board?.sources[0].name).toBe("deleted-source");
  });

  it("treats a missing node count as zero instead of NaN", () => {
    const board = buildRefreshBoard(
      status({ sources: [{ sourceId: "s1", ok: true }] }),
      NAMES
    );

    expect(board?.sources[0].nodeCount).toBe(0);
    expect(board?.sources[0].share).toBe(0);
    expect(board?.totalNodes).toBe(0);
  });

  it("reports an idle run when nothing was refreshed", () => {
    const board = buildRefreshBoard(status({}), NAMES);

    expect(board?.tone).toBe("idle");
    expect(board?.headline).toContain("没有需要刷新");
  });
});
