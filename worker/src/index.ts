import { ApiError } from "./errors";
import { error as apiErrorResponse } from "./http";
import { refreshAll, type PipelineDeps } from "./pipeline";
import { route, type RouterDeps } from "./router";
import { fetchText } from "./safe-fetch";
import { resolveDefaultUserAgent } from "./sources";
import { createStore } from "./store";

export type WorkerDeps = RouterDeps & {
  fetchText?: PipelineDeps["fetchText"];
};

export function buildWorkerDeps(env: Env, overrides: WorkerDeps = {}): RouterDeps {
  if (overrides.pipeline) return overrides;

  const pipeline: PipelineDeps = {
    store: createStore(env),
    fetchText: overrides.fetchText ?? fetchText,
    now: overrides.now ?? (() => new Date()),
    defaultUserAgent: resolveDefaultUserAgent(env),
  };

  return { pipeline, now: overrides.now };
}

export async function handleRequest(
  request: Request,
  env: Env,
  deps: WorkerDeps = {}
): Promise<Response> {
  return route(request, env, buildWorkerDeps(env, deps));
}

export async function handleScheduled(
  env: Env,
  deps: WorkerDeps = {}
): Promise<void> {
  const resolved = buildWorkerDeps(env, deps);
  if (!resolved.pipeline) return;
  try {
    await refreshAll(resolved.pipeline, { trigger: "cron" });
  } catch (err) {
    // 定时任务失败只记录日志，不向平台抛错
    console.error("scheduled refresh failed", err instanceof Error ? err.name : "Error");
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      if (err instanceof ApiError) {
        return apiErrorResponse(err);
      }
      console.error("worker fetch failed", err instanceof Error ? err.name : "Error");
      return new Response(JSON.stringify({ error: "Internal error", code: "INTERNAL_ERROR" }), {
        status: 500,
        headers: { "content-type": "application/json;charset=utf-8", "cache-control": "no-store" },
      });
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await handleScheduled(env);
  },
};

export default worker;


