import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifestPath = path.join(projectRoot, ".design-handoff", "manifest.json");

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function hashFile(target) {
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

if (!(await exists(manifestPath))) {
  console.error(".design-handoff/manifest.json을 찾을 수 없습니다.");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.schemaVersion !== 1 || manifest.project !== "dmes-design-dummy") {
  console.error("지원하지 않는 디자인 핸드오프 manifest입니다.");
  process.exit(1);
}

const baseline = new Map(
  Object.entries(manifest.files).map(([archivePath, value]) => [
    archivePath,
    value.sha256,
  ]),
);
const currentFiles = new Set();
for (const trackedRoot of manifest.trackedRoots) {
  const absoluteRoot = path.join(projectRoot, trackedRoot);
  for (const file of await walkFiles(absoluteRoot)) {
    currentFiles.add(
      path.relative(projectRoot, file).split(path.sep).join("/"),
    );
  }
}

const changes = [];
for (const [archivePath, baselineHash] of baseline) {
  const absolutePath = path.join(projectRoot, archivePath);
  if (!(await exists(absolutePath))) {
    changes.push({ type: "D", path: archivePath });
    continue;
  }
  const currentHash = await hashFile(absolutePath);
  if (currentHash !== baselineHash)
    changes.push({ type: "M", path: archivePath });
}

for (const archivePath of currentFiles) {
  if (!baseline.has(archivePath))
    changes.push({ type: "A", path: archivePath });
}

changes.sort((a, b) => a.path.localeCompare(b.path));

console.log(`기준 commit: ${manifest.baseGitCommit ?? "unknown"}`);
console.log(`내보낸 시각: ${manifest.exportedAt}`);
if (changes.length === 0) {
  console.log("디자인 소스 변경 없음");
  process.exit(0);
}

console.log(`디자인 소스 변경 ${changes.length}건`);
for (const change of changes) {
  console.log(`${change.type}  ${change.path}`);
}
