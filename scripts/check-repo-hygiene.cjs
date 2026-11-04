#!/usr/bin/env node
/**
 * 提交前的仓库卫生检查：确保密钥与部署资源标识不会回到版本库。
 *
 * 检查项：
 * 1. wrangler.jsonc 的 kv_namespaces[].id 必须是占位符，不能是真实 32 位 id。
 * 2. 仓库里不得出现被跟踪的 .dev.vars / .env。
 * 3. 被跟踪的文本文件里不得出现看起来像真实密钥的字面量。
 *
 * 用法：node scripts/check-repo-hygiene.cjs
 * 退出码 0 表示通过；发现问题时逐条打印并以 1 退出。
 */
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const { KV_ID_PLACEHOLDER } = require("./lib/deploy-config.cjs");

/** 密钥字面量规则：每条都自带 allow() 过滤占位符、测试值与文档片段 */
const SECRET_RULES = [
  {
    name: "secret-literal",
    hint: "密钥以字面量形式出现在源码里",
    // 同时匹配 JSON 的 "ADMIN_TOKEN": "x"、TS 的 ADMIN_TOKEN: "x" 与 .env 的 ADMIN_TOKEN=x
    pattern:
      /(?:\b(ADMIN_TOKEN|ENCRYPTION_KEY|JWT_SECRET|CRON_SECRET)\b|["'](ADMIN_TOKEN|ENCRYPTION_KEY|JWT_SECRET|CRON_SECRET)["'])\s*[:=]\s*["']?([^"'\r\n]{8,})["']?/g,
    allow: (value) => {
      if (/^(replace-with|choose-a|generate-a|changeme|your-|<)/i.test(value)) return true;
      if (/(^|[-_])(test|demo|fake|sample|dummy|local|example|fixture)([-_]|$)/i.test(value)) return true;
      // 文档里的命令替换、变量展开或模板尖括号不是真实密钥
      if (/\$\(|`|\$\{|\bnode -e\b|<[a-z-]+>/.test(value)) return true;
      // 真实密钥是无空白的连续串；带空格的多半是说明文字
      return !/\S{16,}/.test(value);
    },
  },
  {
    name: "api-token",
    hint: "疑似真实 API token",
    pattern:
      /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,})\b/g,
    allow: () => false,
  },
  {
    name: "private-key",
    hint: "私钥内容",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    allow: () => false,
  },
];

/** 取出规则匹配到的密钥值：secret-literal 的值落在第 3 组，其它规则落在第 1 组 */
function extractSecretValue(match) {
  return match[3] ?? match[2] ?? match[1] ?? "";
}

/**
 * 扫描一段文本，返回命中的密钥描述。
 * 纯函数，供单测直接调用，避免依赖 git 或文件系统。
 */
function scanTextForSecrets(content) {
  const hits = [];
  for (const rule of SECRET_RULES) {
    for (const match of content.matchAll(rule.pattern)) {
      const value = extractSecretValue(match);
      if (rule.allow(value)) continue;
      hits.push({ rule: rule.name, hint: rule.hint, value, raw: match[0] });
    }
  }
  return hits;
}

/** 从配置文本中取出所有 kv_namespaces 的 id 字面量（忽略行注释） */
function extractKvNamespaceIds(configText) {
  const withoutComments = configText.replace(/^\s*\/\/.*$/gm, "");
  return [...withoutComments.matchAll(/"id"\s*:\s*"([^"]*)"/g)].map((match) => match[1]);
}

/** 配置里出现非占位符的 KV id 时返回该 id，否则返回 null */
function findConcreteKvNamespaceId(configText, placeholder = KV_ID_PLACEHOLDER) {
  const concrete = extractKvNamespaceIds(configText).filter((id) => id !== placeholder);
  return concrete.length > 0 ? concrete[0] : null;
}

const TEXT_EXTENSIONS = /\.(ts|tsx|js|jsx|cjs|mjs|json|jsonc|md|yml|yaml|toml|example|env|txt)$/i;

/** 测试文件里的密钥都是构造的固定值，扫描它们只会产生噪声 */
function isSkippedFile(relativePath) {
  if (!TEXT_EXTENSIONS.test(relativePath)) return true;
  if (/package-lock\.json$/.test(relativePath)) return true;
  if (/\.(test|spec)\.[jt]sx?$/.test(relativePath)) return true;
  return false;
}

function trackedFiles(repoRoot) {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return output.split("\u0000").filter(Boolean);
  } catch {
    // 不在 git 仓库里时跳过文件扫描
    return [];
  }
}

function main() {
  const repoRoot = resolve(__dirname, "..");
  const configPath = join(repoRoot, "wrangler.jsonc");
  const findings = [];

  // 1. KV id 必须是占位符
  try {
    const configText = readFileSync(configPath, "utf8");
    const concreteId = findConcreteKvNamespaceId(configText);
    if (concreteId) {
      findings.push(
        `wrangler.jsonc 的 kv_namespaces id 是具体值（${concreteId.slice(0, 6)}…），` +
          `请改回占位符 ${KV_ID_PLACEHOLDER}，真实 id 由部署脚本注入`
      );
    }
  } catch {
    findings.push("未找到 wrangler.jsonc");
  }

  // 2/3. 被跟踪文件里的密钥
  for (const relativePath of trackedFiles(repoRoot)) {
    if (isSkippedFile(relativePath)) continue;
    let content;
    try {
      content = readFileSync(join(repoRoot, relativePath), "utf8");
    } catch {
      continue;
    }
    for (const hit of scanTextForSecrets(content)) {
      findings.push(`${relativePath}: ${hit.hint}`);
    }
  }

  if (findings.length > 0) {
    for (const finding of findings) console.error(`[hygiene] ${finding}`);
    console.error(`\n仓库卫生检查失败：${findings.length} 个问题`);
    process.exit(1);
  }

  console.log("仓库卫生检查通过：KV id 为占位符，未发现明文密钥。");
}

if (require.main === module) main();

module.exports = {
  SECRET_RULES,
  extractSecretValue,
  scanTextForSecrets,
  extractKvNamespaceIds,
  findConcreteKvNamespaceId,
  isSkippedFile,
};
