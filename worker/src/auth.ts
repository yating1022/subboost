import { timingSafeEqual } from "./crypto";
import { ApiError } from "./errors";

export async function requireAdmin(request: Request, env: Env): Promise<void> {
  const expected = env.ADMIN_TOKEN?.trim();
  if (!expected) {
    throw new ApiError(503, "CONFIGURATION_ERROR", "ADMIN_TOKEN 未配置");
  }

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/i.exec(header.trim());
  const provided = match?.[1]?.trim();
  if (!provided) {
    throw new ApiError(401, "UNAUTHORIZED", "Unauthorized");
  }

  const equal = await timingSafeEqual(provided, expected);
  if (!equal) {
    throw new ApiError(401, "UNAUTHORIZED", "Unauthorized");
  }
}
