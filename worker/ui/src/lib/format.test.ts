import { describe, expect, it } from "vitest";
import { formatCount, formatDateTime, formatDuration, formatPercent, formatRelativeTime } from "./format";

const NOW = new Date("2026-10-12T12:00:00.000Z").getTime();

describe("formatRelativeTime", () => {
  it("handles missing and invalid values", () => {
    expect(formatRelativeTime(null, NOW)).toBe("从未");
    expect(formatRelativeTime("not-a-date", NOW)).toBe("not-a-date");
  });

  it("scales from seconds to days", () => {
    expect(formatRelativeTime("2026-10-12T11:59:55.000Z", NOW)).toBe("刚刚");
    expect(formatRelativeTime("2026-10-12T11:59:30.000Z", NOW)).toBe("30 秒前");
    expect(formatRelativeTime("2026-10-12T11:30:00.000Z", NOW)).toBe("30 分钟前");
    expect(formatRelativeTime("2026-10-12T06:00:00.000Z", NOW)).toBe("6 小时前");
    expect(formatRelativeTime("2026-10-09T12:00:00.000Z", NOW)).toBe("3 天前");
  });
});

describe("formatDuration", () => {
  it("formats milliseconds, seconds and minutes", () => {
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(840)).toBe("840 ms");
    expect(formatDuration(1500)).toBe("1.5 s");
    expect(formatDuration(95_000)).toBe("1 分 35 秒");
  });
});

describe("formatPercent and formatCount", () => {
  it("computes a rounded percentage and guards zero totals", () => {
    expect(formatPercent(1, 4)).toBe("25%");
    expect(formatPercent(0, 0)).toBe("0%");
    expect(formatPercent(Number.NaN, 10)).toBe("0%");
  });

  it("formats counts with thousands separators", () => {
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(Number.NaN)).toBe("0");
  });
});

describe("formatDateTime", () => {
  it("returns a placeholder for empty values and echoes unparsable input", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("nope")).toBe("nope");
    expect(formatDateTime("2026-10-12T00:00:00.000Z")).toContain("2026");
  });
});
