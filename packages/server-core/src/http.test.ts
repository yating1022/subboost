import { describe, expect, it } from "vitest";

import { buildApiErrorBody } from "./http";

describe("server-core http helpers", () => {
  it("builds stable API error bodies", () => {
    expect(buildApiErrorBody("Invalid request", "BAD_REQUEST")).toEqual({
      error: "Invalid request",
      code: "BAD_REQUEST",
    });
  });
});
