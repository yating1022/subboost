import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const requireCjs = createRequire(import.meta.url);
const version = requireCjs("../../../scripts/check-version.cjs") as {
  PACKAGE_FILES: string[];
  TEXT_TARGETS: Array<{ file: string; label: string }>;
  TEST_FILES: Array<{ file: string }>;
  SEMVER: RegExp;
  collectVersions: (root: string) => Array<{ file: string; label: string; version: string }>;
  check: (root: string) => {
    code: number;
    reason: string;
    rootVersion?: string;
    findings: Array<{ file: string; version: string }>;
    mismatched: Array<{ file: string; version: string }>;
  };
  setVersion: (
    next: string,
    dryRun?: boolean,
    root?: string
  ) => { code: number; reason: string; nextVersion?: string; changed: Array<{ file: string; skipped?: string }> };
  report: (result: unknown, options?: { root?: string; dryRun?: boolean }) => number;
  main: (argv: string[], root: string) => number;
};

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(root: string, relPath: string, content: string) {
  const absPath = join(root, relPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, "utf8");
}

/**
 * 在临时目录里搭一个最小 workspace：结构、文件名与真实仓库一致，
 * 但内容完全受控。这样能构造「各位置不一致」这类真实仓库永远不会进入的状态，
 * 而不会碰到仓库里的真文件。
 */
function makeWorkspace(versions: { root: string; worker?: string; readme?: string; test?: string }) {
  const root = mkdtempSync(join(tmpdir(), "subboost-version-"));
  roots.push(root);

  write(root, "package.json", JSON.stringify({ name: "root", version: versions.root }, null, 2));
  write(root, "worker/package.json", JSON.stringify({ name: "worker", version: versions.worker ?? versions.root }, null, 2));
  write(root, "packages/core/package.json", JSON.stringify({ name: "core", version: versions.root }, null, 2));
  write(root, "packages/server-core/package.json", JSON.stringify({ name: "server", version: versions.root }, null, 2));
  write(root, "packages/ui/package.json", JSON.stringify({ name: "ui", version: versions.root }, null, 2));

  const readmeVersion = versions.readme ?? versions.root;
  write(
    root,
    "README.md",
    [
      `<img src="https://img.shields.io/badge/version-${readmeVersion}-green.svg" alt="Version ${readmeVersion}">`,
      ``,
      `关于版本 ${readmeVersion} 的说明段落不受影响。`,
    ].join("\n")
  );

  const testVersion = versions.test ?? versions.root;
  // 与真实文件同构：app: { version: "x" } 与 toContain("vx")
  write(
    root,
    "worker/src/router.test.ts",
    `expect(state).toEqual({ app: { version: "${testVersion}" } });\n`
  );
  write(
    root,
    "worker/ui/src/components/render.test.ts",
    [
      `const STATE = { app: { name: "SubBoost Lite", version: "${testVersion}" } };`,
      `expect(html).toContain("v${testVersion}");`,
    ].join("\n")
  );


  return root;
}

describe("SEMVER", () => {
  it("accepts plain and prerelease versions", () => {
    for (const value of ["0.0.0", "1.2.3", "0.3.8", "1.2.3-beta.1", "2.0.0-rc-1"]) {
      expect(version.SEMVER.test(value)).toBe(true);
    }
  });

  it("rejects partial, prefixed and empty values", () => {
    for (const value of ["1.2", "v1.2.3", "1.2.3.4", "", " ", "latest", "1.2.3 "]) {
      expect(version.SEMVER.test(value)).toBe(false);
    }
  });
});

describe("collectVersions", () => {
  it("reads every package.json plus both README badge literals", () => {
    const root = makeWorkspace({ root: "1.2.3" });
    const findings = version.collectVersions(root);

    // 5 个 package.json + 徽章 src + 徽章 alt
    expect(findings).toHaveLength(version.PACKAGE_FILES.length + version.TEXT_TARGETS.length);
    expect(findings.every((item) => item.version === "1.2.3")).toBe(true);
    // 徽章两条各自有 label，用于区分报错位置
    expect(findings.map((item) => item.label)).toContain("README 徽章");
    expect(findings.map((item) => item.label)).toContain("README 徽章 alt");
  });

  it("ignores prose that merely mentions the version", () => {
    const root = makeWorkspace({ root: "1.2.3" });
    const findings = version.collectVersions(root);
    // 「关于版本 1.2.3 的说明段落」不该被当成一个待同步位置
    expect(findings.filter((item) => item.file === "README.md")).toHaveLength(2);
  });
});

describe("check", () => {
  it("passes when every location matches the root version", () => {
    const root = makeWorkspace({ root: "1.2.3" });
    const result = version.check(root);

    expect(result.code).toBe(0);
    expect(result.reason).toBe("ok");
    expect(result.mismatched).toEqual([]);
  });

  it("reports each mismatched location against the root version", () => {
    const root = makeWorkspace({ root: "1.2.3", worker: "1.2.2", readme: "1.0.0" });
    const result = version.check(root);

    expect(result.code).toBe(1);
    expect(result.reason).toBe("mismatch");
    expect(result.rootVersion).toBe("1.2.3");
    const files = result.mismatched.map((item) => item.file);
    expect(files).toContain("worker/package.json");
    expect(files).toContain("README.md");
  });

  it("rejects an invalid root version before comparing anything", () => {
    const root = makeWorkspace({ root: "not-a-version" });
    const result = version.check(root);

    expect(result.code).toBe(1);
    expect(result.reason).toBe("invalid-root-version");
    expect(result.rootVersion).toBe("not-a-version");
    // 根版本非法时不该继续收集其它位置，否则报错信息会误导
    expect(result.findings).toEqual([]);
  });
});

describe("setVersion", () => {
  it("writes the new version into every package.json and literal", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = makeWorkspace({ root: "1.0.0" });
    const result = version.setVersion("2.0.0", false, root);

    expect(result.code).toBe(0);
    expect(result.reason).toBe("synced");

    // 落盘结果必须真的变了，而不只是返回值正确
    for (const relPath of version.PACKAGE_FILES) {
      expect(JSON.parse(readFileSync(join(root, relPath), "utf8")).version).toBe("2.0.0");
    }
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).toContain("version-2.0.0-green.svg");
    expect(readme).toContain('alt="Version 2.0.0"');
    // 正文散文里出现的版本号不属于同步目标：正则只匹配徽章结构，
    // 否则会把文档里「关于 1.0.0 的故事」这类叙述一起改掉
    expect(readme).toContain("关于版本 1.0.0 的说明段落不受影响。");

    const renderTest = readFileSync(join(root, "worker/ui/src/components/render.test.ts"), "utf8");
    expect(renderTest).toContain('version: "2.0.0"');
    expect(renderTest).toContain('"v2.0.0"');
  });

  it("changes nothing on a dry run but still reports what would change", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = makeWorkspace({ root: "1.0.0" });
    const before = readFileSync(join(root, "package.json"), "utf8");

    const result = version.setVersion("2.0.0", true, root);

    expect(result.code).toBe(0);
    expect(result.reason).toBe("synced");
    expect(result.changed.length).toBeGreaterThan(0);
    // dry-run 的核心承诺：文件一个字节都不能动
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
    expect(readFileSync(join(root, "README.md"), "utf8")).toContain("version-1.0.0-green.svg");
  });

  it("does nothing when every location is already on the target version", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = makeWorkspace({ root: "3.1.4" });
    const result = version.setVersion("3.1.4", false, root);

    expect(result.code).toBe(0);
    expect(result.reason).toBe("already-synced");
    expect(result.changed).toEqual([]);
  });

  it("rejects an invalid target version without touching files", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const root = makeWorkspace({ root: "1.0.0" });
    const before = readFileSync(join(root, "package.json"), "utf8");

    const result = version.setVersion("1.0", false, root);

    expect(result.code).toBe(1);
    expect(result.reason).toBe("invalid-version");
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
  });

  it("accepts prerelease targets", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = makeWorkspace({ root: "1.0.0" });
    const result = version.setVersion("2.0.0-beta.1", false, root);

    expect(result.code).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version).toBe("2.0.0-beta.1");
  });

  it("flags a package.json whose version field cannot be rewritten", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = makeWorkspace({ root: "1.0.0" });
    // version 不出现在文本里（例如靠计算得出），正则就命中不了
    write(root, "packages/ui/package.json", JSON.stringify({ name: "ui", version: 1 }, null, 2));

    const result = version.setVersion("2.0.0", true, root);

    const skipped = result.changed.find((item) => item.file === "packages/ui/package.json");
    // 静默跳过会让人以为同步成功，必须显式标记
    expect(skipped?.skipped).toBe("未找到 version 字段");
  });
});

describe("report", () => {
  it("prints the mismatch list and returns the exit code", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = makeWorkspace({ root: "1.0.0", worker: "0.9.0" });

    const code = version.report(version.check(root), { root });

    expect(code).toBe(1);
    const printed = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed).toContain("版本不一致");
    expect(printed).toContain("worker/package.json");
    // 报错要给出可直接执行的修复命令
    expect(printed).toContain("--set <version>");
  });

  it("prints the synced summary with a relative path", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const root = makeWorkspace({ root: "1.0.0" });

    const code = version.report(version.setVersion("2.0.0", true, root), { root, dryRun: true });

    expect(code).toBe(0);
    const printed = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed).toContain("[dry-run] 将同步版本到 2.0.0");
    expect(printed).toContain("package.json: 1.0.0 -> 2.0.0");
  });

  it("uses an absolute-relative path without leaking the temp root", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const root = makeWorkspace({ root: "1.0.0" });

    version.report(version.setVersion("2.0.0", true, root), { root, dryRun: true });

    const printed = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    // 打印临时绝对路径既噪音大又可能泄露本机目录结构
    expect(printed).not.toContain(root);
  });
});

describe("main", () => {
  it("checks when no --set flag is present", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = makeWorkspace({ root: "1.0.0" });

    expect(version.main([], root)).toBe(0);
  });

  it("applies --set with --dry-run", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = makeWorkspace({ root: "1.0.0" });

    expect(version.main(["--set", "2.0.0", "--dry-run"], root)).toBe(0);
    expect(readFileSync(join(root, "package.json"), "utf8")).toContain('"1.0.0"');
  });

  it("applies --set for real", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const root = makeWorkspace({ root: "1.0.0" });

    expect(version.main(["--set", "2.0.0"], root)).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version).toBe("2.0.0");
  });

  it("prints usage and fails when --set has no value", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = makeWorkspace({ root: "1.0.0" });

    expect(version.main(["--set"], root)).toBe(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("用法");
  });
});
