import { describe, expect, it } from "vitest";
import { safeParseJson, safeParseJsonObject, tryParseJson } from "./json";

describe("tryParseJson", () => {
  it("returns a discriminated parse result without swallowing the error", () => {
    expect(tryParseJson<{ ok: boolean }>("{\"ok\":true}")).toEqual({ ok: true, value: { ok: true } });

    const parsed = tryParseJson("nope");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toBeInstanceOf(SyntaxError);
    }
  });
});

describe("safeParseJson", () => {
  it("parses valid JSON and returns the fallback for invalid JSON", () => {
    expect(safeParseJson("[1,2,3]", [])).toEqual([1, 2, 3]);
    expect(safeParseJson("nope", [])).toEqual([]);
  });
});

describe("safeParseJsonObject", () => {
  it("returns parsed objects and rejects non-object JSON", () => {
    expect(safeParseJsonObject("{\"ok\":true}")).toEqual({ ok: true });
    expect(safeParseJsonObject("[1,2,3]")).toBeNull();
    expect(safeParseJsonObject("null")).toBeNull();
    expect(safeParseJsonObject("nope")).toBeNull();
  });
});
