#!/usr/bin/env node
/**
 * 2026-06-09 — m-mcm Next.js standalone 배포 산출물 조립 스크립트.
 *
 * 전제:
 *   - next.config.ts 에 output: "standalone", outputFileTracingRoot 설정 완료.
 *   - 본 스크립트 실행 전에 `next build` 가 끝나 .next/standalone 이 존재해야 한다.
 *     (권장 호출: 워크스페이스 루트에서 `pnpm -r build` 후 `pnpm --filter @dk-oasis/mcm pack`)
 *
 * 하는 일 (standalone 이 자동 복사하지 않는 것 보강):
 *   1) .next/static  → standalone/<app>/.next/static   (정적 청크·CSS)
 *   2) public/       → standalone/<app>/public          (정적 에셋)
 *   3) (--zip) standalone 폴더 전체를 zip 으로 압축 (Windows: PowerShell Compress-Archive)
 *
 * 산출물 실행 (Windows Server):
 *   node .next/standalone/m-mcm/server.js   (env: PORT, BACKEND_API_URL, AUTH_SECRET, NEXTAUTH_URL, BACKEND_CLIENT_KEY, BFF_INTERNAL_SECRET)
 *
 * 옵션:
 *   --zip   조립 후 .next/m-mcm-standalone.zip 생성
 *
 * 호출:
 *   node scripts/pack-standalone.mjs [--zip]
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, ".."); // m-mcm/
const DIST_DIR = path.join(APP_DIR, ".next");
const STANDALONE_DIR = path.join(DIST_DIR, "standalone");
const STATIC_SRC = path.join(DIST_DIR, "static");
const PUBLIC_SRC = path.join(APP_DIR, "public");

const args = new Set(process.argv.slice(2));
const DO_ZIP = args.has("--zip");

function fail(msg) {
  console.error(`\n[pack-standalone] ✗ ${msg}\n`);
  process.exit(1);
}

function log(msg) {
  console.log(`[pack-standalone] ${msg}`);
}

/**
 * standalone 안에서 server.js 가 위치한 앱 디렉토리를 찾는다.
 * outputFileTracingRoot=frontend/ 이면 standalone/m-mcm/server.js 가 된다.
 * (트레이싱 루트 설정에 따라 위치가 달라질 수 있어 탐색으로 안전하게 결정)
 */
async function findAppStandaloneDir() {
  const direct = path.join(STANDALONE_DIR, "server.js");
  if (existsSync(direct)) return STANDALONE_DIR;

  const entries = await fs.readdir(STANDALONE_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(STANDALONE_DIR, entry.name);
    if (existsSync(path.join(candidate, "server.js"))) return candidate;
  }
  return null;
}

async function copyDir(src, dest, label) {
  if (!existsSync(src)) {
    log(`(skip) ${label} 원본 없음: ${src}`);
    return;
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true });
  log(`✓ ${label}: ${path.relative(APP_DIR, src)} → ${path.relative(APP_DIR, dest)}`);
}

/**
 * standalone 안의 모든 심볼릭 링크를 수집한다 (실디렉토리만 재귀 — 심볼릭 안으로는
 * 들어가지 않으므로 원본 트리로 되돌아가는 사이클/폭주가 없다).
 */
async function collectSymlinks(dir, acc) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) acc.push(full);
    else if (e.isDirectory()) await collectSymlinks(full, acc);
  }
  return acc;
}

/**
 * 남은 심볼릭 링크를 실파일로 펼친다 (dereference).
 *
 * Next.js standalone + pnpm 은 node_modules 를 절대경로 심볼릭으로 구성하는데,
 * 이는 다른 PC 로 zip 복사 시 깨진다.
 *
 * hoisted 덕분에 타겟이 평면 실디렉토리(중첩 심볼릭 farm 없음)라, 각 링크를
 * 타겟의 실파일 복사로 치환하면 이식 가능한 self-contained 산출물이 된다.
 * (전개된 패키지의 transitive deps 는 standalone 최상위 평면 node_modules 에서 해석됨)
 */
async function dereferenceSymlinks(root) {
  const links = await collectSymlinks(root, []);
  let done = 0;
  let removedBroken = 0;
  for (const link of links) {
    let target;
    try {
      target = await fs.realpath(link);
    } catch {
      await fs.rm(link, { force: true });
      log(`⚠ 깨진 심볼릭 제거: ${path.relative(root, link)}`);
      removedBroken++;
      continue;
    }
    const stat = await fs.stat(target);
    await fs.rm(link, { recursive: true, force: true });
    await fs.cp(target, link, { recursive: stat.isDirectory(), dereference: true });
    done++;
  }
  if (links.length === 0) {
    log("✓ dereference: 심볼릭 없음 (이미 평면)");
  } else {
    log(
      `✓ dereference: ${done}개 실파일화${removedBroken ? `, ${removedBroken}개 깨진링크 제거` : ""}`
    );
  }
  // 안전 검증: 남은 심볼릭이 있으면 실패 처리 (이식 불가 산출물 방지)
  const remaining = await collectSymlinks(root, []);
  if (remaining.length > 0) {
    fail(
      `dereference 후에도 심볼릭 ${remaining.length}개 잔존 — 이식 불가:\n` +
        remaining
          .slice(0, 10)
          .map((l) => `  ${path.relative(root, l)}`)
          .join("\n")
    );
  }
}

function zipStandalone() {
  const zipPath = path.join(DIST_DIR, "m-mcm-standalone.zip");
  if (existsSync(zipPath)) {
    log(`기존 zip 삭제: ${path.relative(APP_DIR, zipPath)}`);
  }
  // Windows 기본 제공 PowerShell Compress-Archive 사용 (별도 의존성 불필요)
  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${STANDALONE_DIR}\\*' -DestinationPath '${zipPath}' -Force`,
    ],
    { stdio: "inherit" }
  );
  if (ps.status !== 0) {
    log(`⚠ zip 생성 실패 (status=${ps.status}). 폴더를 수동 압축하세요: ${STANDALONE_DIR}`);
    return;
  }
  log(`✓ zip: ${path.relative(APP_DIR, zipPath)}`);
}

/**
 * 배포물에서 개발용 env 파일을 제거한다.
 * Next 가 standalone 에 복사한 `.env`(dev 값)가 zip 에 섞여 운영으로 새지 않도록 한다.
 */
async function stripDevEnvFiles(appDir) {
  const names = [
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
    ".env.production.local",
  ];
  let removed = 0;
  for (const name of names) {
    const p = path.join(appDir, name);
    if (existsSync(p)) {
      await fs.rm(p, { force: true });
      log(`✓ 번들 env 제거: ${name}`);
      removed++;
    }
  }
  if (removed === 0) log("(제거할 번들 env 없음)");
}

async function main() {
  if (!existsSync(STANDALONE_DIR)) {
    fail(
      `standalone 산출물이 없습니다: ${STANDALONE_DIR}\n` +
        `  먼저 빌드하세요: (워크스페이스 루트에서) pnpm -r build\n` +
        `  next.config.ts 에 output: "standalone" 이 켜져 있어야 합니다.`
    );
  }

  const appStandaloneDir = await findAppStandaloneDir();
  if (!appStandaloneDir) {
    fail(`standalone 안에서 server.js 를 찾지 못했습니다: ${STANDALONE_DIR}`);
  }
  log(`앱 standalone 디렉토리: ${path.relative(APP_DIR, appStandaloneDir)}`);

  await copyDir(STATIC_SRC, path.join(appStandaloneDir, ".next", "static"), "static");
  await copyDir(PUBLIC_SRC, path.join(appStandaloneDir, "public"), "public");

  // 절대경로 심볼릭을 실파일로 펼쳐 다른 PC 로 이식 가능하게 만든다 (zip 전 필수).
  await dereferenceSymlinks(STANDALONE_DIR);

  // 개발용 .env 는 배포물에서 제거한다. (dev 시크릿/localhost 값이 운영으로 새는 것 방지 +
  //  재배포 시 서버의 운영 .env 를 덮어쓰지 않도록. 운영 env 는 실제 환경변수 또는 서버 .env 로 주입)
  await stripDevEnvFiles(appStandaloneDir);

  if (DO_ZIP) zipStandalone();

  const runJs = path.relative(STANDALONE_DIR, path.join(appStandaloneDir, "server.js"));
  log("완료. 배포 후 실행:");
  console.log(
    `\n  cd <standalone>\n  node ${runJs.split(path.sep).join("/")}\n` +
      `  (env: PORT, BACKEND_API_URL, AUTH_SECRET, NEXTAUTH_URL, BACKEND_CLIENT_KEY, BFF_INTERNAL_SECRET)\n`
  );
}

main().catch((err) => fail(err instanceof Error ? (err.stack ?? err.message) : String(err)));
