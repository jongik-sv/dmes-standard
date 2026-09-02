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
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const frontendRoot = path.join(repositoryRoot, "src", "frontend");
const sharedRoot = path.join(frontendRoot, "shared");
const moduleRoot = path.join(frontendRoot, "m-design-dummy");
const outputDirectory = path.join(repositoryRoot, "dist");
const archivePath = path.join(outputDirectory, "dmes-design-dummy.zip");
const bundleName = "dmes-design-dummy";
const excludedNames = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
  ".DS_Store",
  "generated",
]);

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function includeInBundle(sourcePath) {
  const name = path.basename(sourcePath);
  if (excludedNames.has(name)) return false;
  if (name === ".env") return false;
  return true;
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !excludedNames.has(entry.name))
      .map(async (entry) => {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? walkFiles(target) : [target];
      }),
  );
  return nested.flat();
}

async function hashFile(target) {
  const contents = await readFile(target);
  return createHash("sha256").update(contents).digest("hex");
}

function currentCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

async function buildManifest() {
  const files = {};
  const roots = [
    {
      source: path.join(sharedRoot, "src"),
      archiveRoot: "shared/src",
      repositoryRoot: "src/frontend/shared/src",
    },
    {
      source: path.join(moduleRoot, "src"),
      archiveRoot: "m-design-dummy/src",
      repositoryRoot: "src/frontend/m-design-dummy/src",
    },
  ];

  for (const root of roots) {
    for (const file of await walkFiles(root.source)) {
      const relative = path
        .relative(root.source, file)
        .split(path.sep)
        .join("/");
      const archiveFile = `${root.archiveRoot}/${relative}`;
      files[archiveFile] = {
        sha256: await hashFile(file),
        repoPath: `${root.repositoryRoot}/${relative}`,
      };
    }
  }

  return {
    schemaVersion: 1,
    project: "dmes-design-dummy",
    exportedAt: new Date().toISOString(),
    baseGitCommit: currentCommit(),
    trackedRoots: ["shared/src", "m-design-dummy/src"],
    files,
  };
}

function exportedPackageJson() {
  return {
    name: "@dk-oasis/design-dummy-workspace",
    version: "0.1.0",
    private: true,
    workspaces: ["shared", "m-design-dummy"],
    scripts: {
      postinstall: "npm run build --workspace=@dk-oasis/shared",
      dev: "npm run dev --workspace=@dk-oasis/m-design-dummy",
      build:
        "npm run build --workspace=@dk-oasis/shared && npm run build --workspace=@dk-oasis/m-design-dummy",
      check:
        "npm run build && npm run test:design-handoff --workspace=@dk-oasis/shared && npm run lint --workspace=@dk-oasis/m-design-dummy && npm run check:no-backend --workspace=@dk-oasis/m-design-dummy",
      "design:changes": "node scripts/report-design-changes.mjs",
    },
    engines: {
      node: ">=20.19",
    },
    overrides: {
      react: "19.2.4",
      "react-dom": "19.2.4",
    },
  };
}

function rootReadme(manifest) {
  return `# DMES UI 디자인 검토 프로젝트

현행 DMES 화면 패턴, 실제 포털 셸, \`@dk-oasis/shared\` 소스를 함께 제공하는 디자인 작업 프로젝트입니다.

## 바로 실행

\`\`\`bash
npm install
npm run dev
\`\`\`

- 실행 주소: 터미널에 표시되는 Vite 주소
- 데이터: 모두 \`m-design-dummy/src/data/mock-data.ts\`의 하드코딩 데이터
- 네트워크: 백엔드/외부 서비스 호출 없음
- 포털: \`shared/src/portal-shell\` 운영 컴포넌트를 직접 사용
- 폰트: \`shared/src/styles/variables.css\`의 공통 \`--font-family\` 사용
- 기준 commit: \`${manifest.baseGitCommit}\`

## 수정 후 확인

\`\`\`bash
npm run check
npm run design:changes
\`\`\`

수정 가이드는 \`m-design-dummy/DESIGN-HANDOFF.md\`를 참고하세요. 전체 폴더를 그대로 개발팀에 반환하면 기준 해시를 사용해 동시 변경 충돌 여부를 검사할 수 있습니다.
`;
}

for (const required of [sharedRoot, moduleRoot]) {
  if (!(await exists(required))) {
    console.error(`필수 프로젝트를 찾을 수 없습니다: ${required}`);
    process.exit(1);
  }
}

execFileSync(
  process.execPath,
  [path.join(moduleRoot, "scripts", "check-no-backend.mjs")],
  {
    cwd: moduleRoot,
    stdio: "inherit",
  },
);

const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), "dmes-design-dummy-"),
);
const bundleRoot = path.join(temporaryRoot, bundleName);

try {
  await mkdir(bundleRoot, { recursive: true });
  await cp(sharedRoot, path.join(bundleRoot, "shared"), {
    recursive: true,
    filter: includeInBundle,
  });
  await cp(moduleRoot, path.join(bundleRoot, "m-design-dummy"), {
    recursive: true,
    filter: includeInBundle,
  });

  const sharedPackagePath = path.join(bundleRoot, "shared", "package.json");
  const sharedPackage = JSON.parse(await readFile(sharedPackagePath, "utf8"));
  sharedPackage.scripts["test:design-handoff"] =
    "vitest run tests/unit --exclude tests/unit/primary-color-consistency.unit.test.ts";
  await writeFile(
    sharedPackagePath,
    `${JSON.stringify(sharedPackage, null, 2)}\n`,
  );

  const modulePackagePath = path.join(
    bundleRoot,
    "m-design-dummy",
    "package.json",
  );
  const modulePackage = JSON.parse(await readFile(modulePackagePath, "utf8"));
  modulePackage.dependencies["@dk-oasis/shared"] = "file:../shared";
  await writeFile(
    modulePackagePath,
    `${JSON.stringify(modulePackage, null, 2)}\n`,
  );

  const manifest = await buildManifest();
  await mkdir(path.join(bundleRoot, ".design-handoff"), { recursive: true });
  await mkdir(path.join(bundleRoot, "scripts"), { recursive: true });
  await writeFile(
    path.join(bundleRoot, ".design-handoff", "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await cp(
    path.join(scriptDirectory, "report-design-changes.mjs"),
    path.join(bundleRoot, "scripts", "report-design-changes.mjs"),
  );
  await writeFile(
    path.join(bundleRoot, "package.json"),
    `${JSON.stringify(exportedPackageJson(), null, 2)}\n`,
  );
  await writeFile(path.join(bundleRoot, "README.md"), rootReadme(manifest));

  await mkdir(outputDirectory, { recursive: true });
  await rm(archivePath, { force: true });
  execFileSync("/usr/bin/zip", ["-qr", archivePath, bundleName], {
    cwd: temporaryRoot,
    stdio: "inherit",
  });

  const archiveStat = await stat(archivePath);
  const sourceCount = Object.keys(manifest.files).length;
  console.log("");
  console.log(`디자인 공유 ZIP 생성 완료: ${archivePath}`);
  console.log(`추적 소스: ${sourceCount}개`);
  console.log(`압축 크기: ${(archiveStat.size / 1024 / 1024).toFixed(2)} MB`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
