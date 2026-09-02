import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const args = process.argv.slice(2);
const applyChanges = args.includes("--apply");
const inputArgument = args.find((argument) => !argument.startsWith("--"));

if (!inputArgument) {
  console.error(
    "사용법: pnpm import-design-dummy -- <반환 폴더 또는 ZIP> [--apply]",
  );
  process.exit(1);
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(target) {
  if (!(await exists(target))) return null;
  const info = await stat(target);
  if (!info.isFile()) return null;
  const contents = await readFile(target);
  return createHash("sha256").update(contents).digest("hex");
}

async function walkFiles(directory) {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? walkFiles(target) : [target];
    }),
  );
  return nested.flat();
}

async function findBundleRoot(inputRoot) {
  const directManifest = path.join(
    inputRoot,
    ".design-handoff",
    "manifest.json",
  );
  if (await exists(directManifest)) return inputRoot;

  const entries = await readdir(inputRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(inputRoot, entry.name);
    if (
      await exists(path.join(candidate, ".design-handoff", "manifest.json"))
    ) {
      candidates.push(candidate);
    }
  }
  if (candidates.length === 1) return candidates[0];
  throw new Error(
    "반환본에서 .design-handoff/manifest.json을 찾을 수 없습니다.",
  );
}

function safeArchivePath(value) {
  const normalized = value.split("\\").join("/");
  return (
    normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !normalized.includes("../") &&
    !normalized.includes("/..") &&
    (normalized.startsWith("shared/src/") ||
      normalized.startsWith("m-design-dummy/src/"))
  );
}

function repositoryPathFor(archivePath) {
  if (archivePath.startsWith("shared/src/")) {
    return `src/frontend/${archivePath}`;
  }
  if (archivePath.startsWith("m-design-dummy/src/")) {
    return `src/frontend/${archivePath}`;
  }
  throw new Error(`허용되지 않은 경로: ${archivePath}`);
}

const inputPath = path.resolve(process.cwd(), inputArgument);
if (!(await exists(inputPath))) {
  console.error(`반환본을 찾을 수 없습니다: ${inputPath}`);
  process.exit(1);
}

let temporaryRoot = null;
let extractedRoot = inputPath;

try {
  const inputStat = await stat(inputPath);
  if (inputStat.isFile()) {
    if (path.extname(inputPath).toLowerCase() !== ".zip") {
      throw new Error("폴더 또는 .zip 파일만 지원합니다.");
    }
    temporaryRoot = await mkdtemp(
      path.join(os.tmpdir(), "dmes-design-import-"),
    );
    execFileSync("/usr/bin/unzip", ["-q", inputPath, "-d", temporaryRoot], {
      stdio: "inherit",
    });
    extractedRoot = temporaryRoot;
  }

  const bundleRoot = await findBundleRoot(extractedRoot);
  const manifest = JSON.parse(
    await readFile(
      path.join(bundleRoot, ".design-handoff", "manifest.json"),
      "utf8",
    ),
  );
  if (
    manifest.schemaVersion !== 1 ||
    manifest.project !== "dmes-design-dummy"
  ) {
    throw new Error("지원하지 않는 디자인 핸드오프 manifest입니다.");
  }

  const baselineEntries = Object.entries(manifest.files);
  const baselinePaths = new Set(
    baselineEntries.map(([archivePath]) => archivePath),
  );
  const currentArchivePaths = new Set();
  for (const trackedRoot of manifest.trackedRoots) {
    if (!safeArchivePath(`${trackedRoot}/placeholder`)) {
      throw new Error(`허용되지 않은 추적 루트: ${trackedRoot}`);
    }
    const absoluteRoot = path.join(bundleRoot, trackedRoot);
    for (const file of await walkFiles(absoluteRoot)) {
      currentArchivePaths.add(
        path.relative(bundleRoot, file).split(path.sep).join("/"),
      );
    }
  }

  const requestedChanges = [];
  for (const [archivePath, entry] of baselineEntries) {
    if (!safeArchivePath(archivePath)) {
      throw new Error(`허용되지 않은 manifest 경로: ${archivePath}`);
    }
    const returnedHash = await hashFile(path.join(bundleRoot, archivePath));
    if (returnedHash === null) {
      requestedChanges.push({
        type: "D",
        archivePath,
        repoPath: entry.repoPath,
        baselineHash: entry.sha256,
        returnedHash: null,
      });
    } else if (returnedHash !== entry.sha256) {
      requestedChanges.push({
        type: "M",
        archivePath,
        repoPath: entry.repoPath,
        baselineHash: entry.sha256,
        returnedHash,
      });
    }
  }

  for (const archivePath of currentArchivePaths) {
    if (baselinePaths.has(archivePath)) continue;
    if (!safeArchivePath(archivePath)) {
      throw new Error(`허용되지 않은 추가 파일 경로: ${archivePath}`);
    }
    requestedChanges.push({
      type: "A",
      archivePath,
      repoPath: repositoryPathFor(archivePath),
      baselineHash: null,
      returnedHash: await hashFile(path.join(bundleRoot, archivePath)),
    });
  }

  const assessed = [];
  for (const change of requestedChanges) {
    const expectedRepoPath = repositoryPathFor(change.archivePath);
    if (change.repoPath !== expectedRepoPath) {
      throw new Error(
        `manifest 저장소 경로가 일치하지 않습니다: ${change.archivePath}`,
      );
    }
    const repositoryFile = path.join(repositoryRoot, change.repoPath);
    const currentHash = await hashFile(repositoryFile);
    const alreadyApplied =
      change.type !== "D" &&
      currentHash !== null &&
      currentHash === change.returnedHash;
    const safe =
      alreadyApplied ||
      (change.type === "A"
        ? currentHash === null
        : currentHash === change.baselineHash);
    assessed.push({
      ...change,
      currentHash,
      safe,
      alreadyApplied,
    });
  }

  assessed.sort((a, b) => a.archivePath.localeCompare(b.archivePath));
  const conflicts = assessed.filter((change) => !change.safe);
  const pending = assessed.filter(
    (change) => change.safe && !change.alreadyApplied,
  );
  const alreadyApplied = assessed.filter((change) => change.alreadyApplied);

  console.log(`기준 commit: ${manifest.baseGitCommit ?? "unknown"}`);
  console.log(`디자이너 변경: ${assessed.length}건`);
  for (const change of assessed) {
    const state = change.alreadyApplied
      ? "이미 반영"
      : change.safe
        ? "반영 가능"
        : "충돌";
    console.log(`${change.type}  [${state}] ${change.repoPath}`);
  }

  if (conflicts.length > 0) {
    console.error("");
    console.error(
      `동시 변경 충돌 ${conflicts.length}건이 있어 자동 반영하지 않습니다. shared 또는 더미 소스의 현재 변경과 디자이너 변경을 수동 병합하세요.`,
    );
    process.exitCode = 2;
  } else if (!applyChanges) {
    console.log("");
    console.log(
      pending.length > 0
        ? `충돌 없음: ${pending.length}건을 반영하려면 같은 명령에 --apply를 추가하세요.`
        : alreadyApplied.length > 0
          ? "모든 변경이 이미 반영되어 있습니다."
          : "디자이너 소스 변경이 없습니다.",
    );
  } else if (pending.length === 0) {
    console.log("");
    console.log("새로 반영할 변경이 없습니다.");
  } else {
    const timestamp = new Date()
      .toISOString()
      .replaceAll(":", "-")
      .replaceAll(".", "-");
    const backupRoot = path.join(
      repositoryRoot,
      "dist",
      "design-import-backups",
      timestamp,
    );

    for (const change of pending) {
      const repositoryFile = path.join(repositoryRoot, change.repoPath);
      const returnedFile = path.join(bundleRoot, change.archivePath);
      if (change.currentHash !== null) {
        const backupFile = path.join(backupRoot, change.repoPath);
        await mkdir(path.dirname(backupFile), { recursive: true });
        await cp(repositoryFile, backupFile);
      }

      if (change.type === "D") {
        await rm(repositoryFile, { force: true });
      } else {
        await mkdir(path.dirname(repositoryFile), { recursive: true });
        await cp(returnedFile, repositoryFile);
      }
    }

    console.log("");
    console.log(`디자인 변경 ${pending.length}건 반영 완료`);
    console.log(`기존 파일 백업: ${backupRoot}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (temporaryRoot) {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
