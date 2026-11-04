import { describe, expect, it } from "vitest";
import {
  getTotalPages,
  parseClampedIntParam,
  parseOffsetPagination,
  parsePagePagination,
} from "./pagination";

describe("api pagination helpers", () => {
  it("clamps integer params and supports integer-prefix parsing", () => {
    expect(parseClampedIntParam("12px", { fallback: 1, min: 1, max: 20 })).toBe(12);
    expect(parseClampedIntParam("bad", { fallback: 7, min: 1, max: 20 })).toBe(7);
    expect(parseClampedIntParam("-2", { fallback: 7, min: 1, max: 20 })).toBe(1);
    expect(parseClampedIntParam("999", { fallback: 7, min: 1, max: 20 })).toBe(20);
  });

  it("supports strict numeric parsing for existing template pagination semantics", () => {
    expect(parseClampedIntParam("12px", { fallback: 1, min: 1, max: 20, parser: "number" })).toBe(1);
    expect(parseClampedIntParam("12.8", { fallback: 1, min: 1, max: 20, parser: "number" })).toBe(12);
  });

  it("parses page pagination and derives skip", () => {
    const searchParams = new URLSearchParams("page=3&pageSize=200");

    expect(parsePagePagination(searchParams, { defaultSize: 20, maxSize: 100 })).toEqual({
      page: 3,
      pageSize: 100,
      skip: 200,
    });
  });

  it("parses offset pagination", () => {
    const searchParams = new URLSearchParams("take=500&skip=-4");

    expect(parseOffsetPagination(searchParams, { defaultTake: 50, maxTake: 200, maxSkip: 1_000 })).toEqual({
      take: 200,
      skip: 0,
    });
  });

  it("computes total pages with configurable empty minimum", () => {
    expect(getTotalPages(0, 20)).toBe(0);
    expect(getTotalPages(0, 20, { minimum: 1 })).toBe(1);
    expect(getTotalPages(41, 20)).toBe(3);
  });
});
