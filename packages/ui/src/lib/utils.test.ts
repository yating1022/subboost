import { describe, expect, it } from "vitest";
import { readApiErrorMessage } from "./utils";

describe("readApiErrorMessage", () => {
  it("returns trimmed API error messages from JSON object bodies", async () => {
    const response = new Response(JSON.stringify({ error: "  保存失败  " }), { status: 400 });

    await expect(readApiErrorMessage(response, "操作失败")).resolves.toBe("保存失败");
  });

  it("falls back for malformed, non-object, or empty error bodies", async () => {
    await expect(readApiErrorMessage(new Response("not-json", { status: 502 }), "操作失败")).resolves.toBe(
      "操作失败 (HTTP 502)"
    );
    await expect(readApiErrorMessage(new Response(JSON.stringify(["bad"]), { status: 400 }), "操作失败")).resolves.toBe(
      "操作失败 (HTTP 400)"
    );
    await expect(readApiErrorMessage(new Response(JSON.stringify({ error: "   " }), { status: 409 }), "操作失败"))
      .resolves.toBe("操作失败 (HTTP 409)");
  });
});
