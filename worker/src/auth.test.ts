import { describe, expect, it } from "vitest";
import { requireAdmin } from "./auth";

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://worker.example.com/api/state", { headers });
}

function env(token?: string): Env {
  return { ADMIN_TOKEN: token } as unknown as Env;
}

describe("requireAdmin", () => {
  it("rejects a request without an Authorization header", async () => {
    await expect(requireAdmin(request(), env("secret-token"))).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
  });

  it("rejects a wrong token", async () => {
    await expect(
      requireAdmin(request({ authorization: "Bearer wrong" }), env("secret-token"))
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });

  it("rejects a malformed header", async () => {
    await expect(
      requireAdmin(request({ authorization: "secret-token" }), env("secret-token"))
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    await expect(
      requireAdmin(request({ authorization: "Basic abc" }), env("secret-token"))
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });

  it("accepts the correct token", async () => {
    await expect(
      requireAdmin(request({ authorization: "Bearer secret-token" }), env("secret-token"))
    ).resolves.toBeUndefined();
  });

  it("fails closed when ADMIN_TOKEN is missing or empty", async () => {
    await expect(requireAdmin(request(), env(undefined))).rejects.toMatchObject({
      status: 503,
      code: "CONFIGURATION_ERROR",
    });
    await expect(requireAdmin(request(), env("   "))).rejects.toMatchObject({
      status: 503,
      code: "CONFIGURATION_ERROR",
    });
  });
});
