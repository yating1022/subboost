/**
 * 部署编排逻辑：与进程、文件系统、wrangler 全部解耦，依赖由调用方注入。
 * CLI 壳见 scripts/deploy-worker.cjs，测试见 test/regression/tooling/deploy-runner.test.ts。
 */
const {
  assertKvNamespaceInjected,
  buildSecretPayload,
  injectKvNamespaceId,
  parseNamespaceList,
  pickNamespaceId,
  readRequiredSecrets,
} = require("./deploy-config.cjs");

/**
 * 确保 KV namespace 存在。
 * 优先级：显式 id → 按标题复用 → 按标题新建。
 * 返回 { id, created }；无法确定时抛错。
 */
async function ensureKvNamespace({ deps, kvTitle, explicitId, log }) {
  if (explicitId) {
    log(`使用环境变量指定的 KV namespace id：${explicitId}`);
    return { id: explicitId, created: false };
  }

  const listNamespaces = async () => {
    const namespaces = parseNamespaceList(await deps.listNamespaces());
    if (!namespaces) throw new Error("无法解析 KV namespace 列表输出");
    return namespaces;
  };

  const existing = pickNamespaceId(await listNamespaces(), kvTitle);
  if (existing) {
    log(`复用已存在的 KV namespace「${kvTitle}」：${existing}`);
    return { id: existing, created: false };
  }

  log(`未找到 KV namespace「${kvTitle}」，正在创建…`);
  await deps.createNamespace(kvTitle);

  const created = pickNamespaceId(await listNamespaces(), kvTitle);
  if (!created) {
    throw new Error(`KV namespace「${kvTitle}」已创建，但列表中读不到它的 id`);
  }
  log(`已创建 KV namespace「${kvTitle}」：${created}`);
  return { id: created, created: true };
}

/**
 * 执行整套部署流程：
 * 校验密钥 → 确保 KV → 注入 id 到临时配置 → 上传 Secret → 部署。
 *
 * deps 需要提供：
 *   listNamespaces(): Promise<string>
 *   createNamespace(title): Promise<void>
 *   readConfig(): string
 *   writeConfig(text): void
 *   removeConfig(): void
 *   uploadSecrets(payload): Promise<void>
 *   deploy(configPath, options): Promise<void>
 */
async function runDeploy({ deps, env = {}, dryRun = false, kvTitle, log = () => {} }) {
  const skipSecrets = env.SUBBOOST_SKIP_SECRETS === "1" || dryRun;
  const { values: secrets, problems } = readRequiredSecrets(env);

  if (!skipSecrets && problems.length > 0) {
    throw new Error(
      `密钥校验未通过：\n  - ${problems.join("\n  - ")}\n\n` +
        "请设置 ADMIN_TOKEN / ENCRYPTION_KEY 环境变量，或改用 SUBBOOST_SKIP_SECRETS=1 跳过上传（需已在 Dashboard 配好）。"
    );
  }
  if (skipSecrets) log("已跳过 Secret 上传（dry-run 或 SUBBOOST_SKIP_SECRETS=1）");

  const namespace = await ensureKvNamespace({
    deps,
    kvTitle,
    explicitId: env.SUBBOOST_KV_ID?.trim(),
    log,
  });

  const generatedConfig = assertKvNamespaceInjected(
    injectKvNamespaceId(deps.readConfig(), namespace.id),
    namespace.id
  );

  const configPath = deps.configPath;
  try {
    deps.writeConfig(generatedConfig);

    if (!skipSecrets) {
      log("上传 Secret（经 stdin，不落盘）…");
      await deps.uploadSecrets(buildSecretPayload(secrets));
      log("Secret 上传完成");
    }

    log("开始部署 Worker…");
    await deps.deploy(configPath, { dryRun });
    log(dryRun ? "Dry-run 完成（未实际上传）" : "部署完成");
  } finally {
    // 生成的配置含真实 KV id，无论成功失败都删除
    try {
      deps.removeConfig();
    } catch {
      // 清理失败不影响部署结果
    }
  }

  return { namespaceId: namespace.id, created: namespace.created, secretsUploaded: !skipSecrets };
}

module.exports = { ensureKvNamespace, runDeploy };
