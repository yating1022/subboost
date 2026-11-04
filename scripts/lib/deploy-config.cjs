/**
 * 部署脚本的纯逻辑部分：不接触进程、文件与网络，便于直接单测。
 * 调用方见 scripts/deploy-worker.cjs。
 */

/** wrangler.jsonc 中 KV namespace id 的占位符 */
const KV_ID_PLACEHOLDER = "REPLACE_WITH_KV_NAMESPACE_ID";

/** 默认 KV namespace 名称，可用环境变量 SUBBOOST_KV_TITLE 覆盖 */
const DEFAULT_KV_TITLE = "SUBBOOST_KV";

/** ADMIN_TOKEN / ENCRYPTION_KEY 的最小长度，与 .dev.vars.example 的说明一致 */
const MIN_SECRET_LENGTH = 32;

/** 部署需要的密钥变量名 */
const REQUIRED_SECRETS = ["ADMIN_TOKEN", "ENCRYPTION_KEY"];

/**
 * 从环境里读取部署所需密钥并校验。
 * 返回 problems 数组而不是抛错，方便调用方一次性列出全部缺失项。
 */
function readRequiredSecrets(env = {}) {
  const values = {};
  const problems = [];

  for (const name of REQUIRED_SECRETS) {
    const raw = typeof env[name] === "string" ? env[name].trim() : "";
    if (!raw) {
      problems.push(`缺少环境变量 ${name}`);
      continue;
    }
    if (raw.length < MIN_SECRET_LENGTH) {
      problems.push(`${name} 长度不足 ${MIN_SECRET_LENGTH} 个字符（当前 ${raw.length}）`);
      continue;
    }
    if (/^(replace-with|choose-a|generate-a|changeme|your-)/i.test(raw)) {
      problems.push(`${name} 仍是示例占位值，请换成真实随机串`);
      continue;
    }
    values[name] = raw;
  }

  return { values, problems };
}

/** 把 wrangler.jsonc 里的 KV id 占位符替换成真实 id */
function injectKvNamespaceId(configText, namespaceId) {
  if (typeof configText !== "string" || configText.length === 0) {
    throw new Error("配置文件内容为空");
  }
  if (!/^[0-9a-f]{32}$/i.test(namespaceId ?? "")) {
    throw new Error(`KV namespace id 格式不正确：${namespaceId}`);
  }
  if (!configText.includes(KV_ID_PLACEHOLDER)) {
    throw new Error(`配置文件里没有找到 KV id 占位符 ${KV_ID_PLACEHOLDER}`);
  }
  return configText.replaceAll(KV_ID_PLACEHOLDER, namespaceId);
}

/** 校验注入后的配置确实带上了真实 id，且不再残留占位符 */
function assertKvNamespaceInjected(configText, namespaceId) {
  if (configText.includes(KV_ID_PLACEHOLDER)) {
    throw new Error("注入后仍残留 KV id 占位符，已中止部署");
  }
  if (!configText.includes(namespaceId)) {
    throw new Error("注入后的配置未包含目标 KV namespace id，已中止部署");
  }
  return configText;
}

/** 从 `wrangler kv namespace list` 的结果里按标题挑出 namespace */
function pickNamespaceId(namespaces, title = DEFAULT_KV_TITLE) {
  if (!Array.isArray(namespaces)) return null;
  const matched = namespaces.filter(
    (item) => item && typeof item.id === "string" && item.title === title
  );
  return matched.length > 0 ? matched[0].id : null;
}

/** 解析 `wrangler kv namespace list` 的 JSON 输出；输出异常时返回 null 交给调用方报错 */
function parseNamespaceList(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 组装 `wrangler secret bulk` 的 stdin 内容（JSON），避免密钥落盘 */
function buildSecretPayload(values = {}) {
  const payload = {};
  for (const name of REQUIRED_SECRETS) {
    const value = values[name];
    if (typeof value === "string" && value.length > 0) payload[name] = value;
  }
  return JSON.stringify(payload);
}

module.exports = {
  KV_ID_PLACEHOLDER,
  DEFAULT_KV_TITLE,
  MIN_SECRET_LENGTH,
  REQUIRED_SECRETS,
  readRequiredSecrets,
  injectKvNamespaceId,
  assertKvNamespaceInjected,
  pickNamespaceId,
  parseNamespaceList,
  buildSecretPayload,
};
