import { describe, expect, it } from "vitest";
import { parseJsonObject, parseJsonStringMap } from "./json-utils";

describe("parseJsonObject", () => {
  it("returns object JSON and rejects malformed or non-object JSON", () => {
    expect(parseJsonObject("{\"Server\":[]}")).toEqual({ Server: [] });
    expect(parseJsonObject("not-json")).toBeNull();
    expect(parseJsonObject("[1,2,3]")).toBeNull();
  });
});

describe("parseJsonStringMap", () => {
  it("keeps string values and coerces numeric or boolean header values", () => {
    expect(parseJsonStringMap("{\"Host\":\"example.com\",\"X-Count\":3,\"X-On\":true,\"Nested\":{\"x\":1}}")).toEqual({
      Host: "example.com",
      "X-Count": "3",
      "X-On": "true",
    });
  });

  it("returns undefined for invalid or empty string-map JSON", () => {
    expect(parseJsonStringMap("not-json")).toBeUndefined();
    expect(parseJsonStringMap("{\"Nested\":{\"x\":1}}")).toBeUndefined();
  });
});
