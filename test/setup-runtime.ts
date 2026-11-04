import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";

function findGitBashBinFromGitOnPath(): string | null {
  // Git for Windows is often installed at a custom path (for example D:\Git),
  // where git.exe still resolves through PATH. Derive <git-root>\bin from it.
  const where = spawnSync("where.exe", ["git"], { encoding: "utf8", windowsHide: true });
  if (where.status !== 0 || !where.stdout) return null;
  for (const raw of where.stdout.split(/\r?\n/)) {
    const gitPath = raw.trim();
    if (!gitPath || !/git\.exe$/i.test(gitPath)) continue;
    let dir = dirname(gitPath);
    for (let depth = 0; depth < 3; depth += 1) {
      const bin = join(dir, "bin");
      if (existsSync(join(bin, "bash.exe"))) return bin;
      dir = dirname(dir);
    }
  }
  return null;
}

function findGitBashBin(): string | null {
  const candidates = [
    process.env.ProgramFiles && join(process.env.ProgramFiles, "Git", "bin"),
    process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "Git", "bin"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Git", "bin"),
    process.env.USERPROFILE && join(process.env.USERPROFILE, "scoop", "apps", "git", "current", "bin"),
  ].filter((value): value is string => Boolean(value));
  const found = candidates.find((directory) => existsSync(join(directory, "bash.exe")));
  return found ?? findGitBashBinFromGitOnPath();
}

if (process.platform === "win32") {
  const gitBashBin = findGitBashBin();
  if (!gitBashBin) {
    throw new Error("Git for Windows Bash is required to run SubBoost shell-script tests on Windows.");
  }
  process.env.PATH = `${gitBashBin}${delimiter}${process.env.PATH || ""}`;
}
