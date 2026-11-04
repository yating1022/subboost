#!/usr/bin/env node
/**
 * 一键部署 CLI：自动确保 KV namespace 存在 → 注入 id 到临时配置 → 上传 Secret → 部署 Worker。
 *
 * 本文件只负责装配进程/文件系统/wrangler 依赖，编排逻辑在 scripts/lib/deploy-runner.cjs。
 *
 * 用法：
 *   SUBBOOST_KV_ID=<id> <设置两个密钥环境变量> npm run worker:deploy
 *   省略 SUBBOOST_KV_ID 时按标题 SUBBOOST_KV 查找，找不到则新建。
 *
 * 密钥环境变量共两个：管理端访问 token 与 KV 静态加密密钥，取值需 32 位以上随机串。
 *
 * 可选环境变量：
 *   SUBBOOST_KV_TITLE       KV namespace 标题（默认 SUBBOOST_KV）
 *   SUBBOOST_SKIP_SECRETS   设为 1 时跳过 Secret 上传（密钥已在 Dashboard 配好）
 *   SUBBOOST_KV_ID          直接指定 KV namespace id，跳过查找与创建
 *
 * 参数：
 *   --dry-run               只校验配置与绑定，不上传任何内容
 */
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const { DEFAULT_KV_TITLE } = require("./lib/deploy-config.cjs");
const { runDeploy } = require("./lib/deploy-runner.cjs");

const repoRoot = resolve(__dirname, "..");
const configPath = join(repoRoot, "wrangler.jsonc");
/** 注入真实 id 后生成的临时配置：必须放在仓库根，main/assets 的相对路径才解析正确 */
const generatedConfigPath = join(repoRoot, ".wrangler.deploy.jsonc");
const kvTitle = process.env.SUBBOOST_KV_TITLE?.trim() || DEFAULT_KV_TITLE;

function log(message) {
  console.log(`[deploy] ${message}`);
}

function fail(message) {
  console.error(`[deploy] 错误：${message}`);
  process.exit(1);
}

/** 定位 wrangler CLI（package exports 不暴露 bin，按文件路径解析） */
function resolveWranglerBin() {
  const candidates = [
    join(repoRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
    join(repoRoot, "worker", "node_modules", "wrangler", "bin", "wrangler.js"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) fail("未找到 wrangler，请先在仓库根目录执行 npm ci");
  return found;
}

let wranglerBin = "";

function runWrangler(args, options = {}) {
  return execFileSync(process.execPath, [wranglerBin, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
    ...options,
  });
}

/** 把 wrangler 的 stderr 收敛成一行可读信息 */
function describeWranglerError(error) {
  return (error.stderr || error.message || "").toString().trim();
}

async function main() {
  wranglerBin = resolveWranglerBin();
  const dryRun = process.argv.includes("--dry-run");

  const deps = {
    configPath: generatedConfigPath,
    listNamespaces: async () => {
      try {
        return runWrangler(["kv", "namespace", "list"]);
      } catch (error) {
        throw new Error(`读取 KV namespace 列表失败，请先执行 npx wrangler login。\n${describeWranglerError(error)}`);
      }
    },
    createNamespace: async (title) => {
      try {
        runWrangler(["kv", "namespace", "create", title], { input: "\n" });
      } catch (error) {
        throw new Error(`创建 KV namespace 失败。\n${describeWranglerError(error)}`);
      }
    },
    readConfig: () => readFileSync(configPath, "utf8"),
    writeConfig: (text) => writeFileSync(generatedConfigPath, text, "utf8"),
    removeConfig: () => rmSync(generatedConfigPath, { force: true }),
    uploadSecrets: async (payload) => {
      try {
        runWrangler(["secret", "bulk"], { input: payload });
      } catch (error) {
        throw new Error(`上传 Secret 失败。\n${describeWranglerError(error)}`);
      }
    },
    deploy: async (path, { dryRun: isDryRun }) => {
      try {
        const output = runWrangler(
          ["deploy", "--config", path, ...(isDryRun ? ["--dry-run"] : [])],
          { stdio: ["pipe", "inherit", "inherit"] }
        );
        if (output) process.stdout.write(output);
      } catch (error) {
        throw new Error(`部署失败。\n${describeWranglerError(error)}`);
      }
    },
  };

  try {
    const result = await runDeploy({ deps, env: process.env, dryRun, kvTitle, log });
    if (result.created && !dryRun) {
      log("提示：本次新建了 KV namespace，请确认 Worker 绑定指向它。");
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

void main();
