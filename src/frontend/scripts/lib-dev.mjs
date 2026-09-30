#!/usr/bin/env node
// 화면 라이브러리(shared, m-*) dev 빌드 도우미.
//
// `tsup --watch` 는 뜰 때마다 소스가 그대로여도 전체 빌드(.d.ts 포함)를 한 번 한다.
// 이 스크립트는 입력 파일 지문(경로·크기·수정 시각 + TSUP_DTS)을 지난 빌드 때 남긴 값과 비교해
// 바뀐 패키지만 빌드하고, watch 도 처음 빌드 없이 파일이 바뀔 때만 `tsup` 을 돌린다.
//
//   node scripts/lib-dev.mjs build [--force] <pkgDir...>   # frontend 루트에서. 적힌 순서대로(shared 먼저)
//   node ../scripts/lib-dev.mjs watch                      # 패키지 폴더에서(package.json "dev")
//
// 지문은 <pkg>/node_modules/.cache/lib-dev-stamp.json 에 둔다(배포 대상 dist 에 섞지 않는다).
// 한 번씩 도는 tsup 이 dist 를 비우지 않도록 TSUP_NO_CLEAN=1 을 넘긴다(shared 의 clean 설정 참고).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "tests",
  "test-results",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
]);
// 빌드가 스스로 쓰는 파일은 빼야 한다. 안 그러면 빌드가 빌드를 부른다.
//   tsup.config.bundled_*.mjs — tsup 이 빌드마다 설정을 묶어 잠깐 만들었다 지우는 파일
//   .tsbuildinfo              — .d.ts 생성(tsc incremental)이 빌드마다 다시 쓰는 파일
const IGNORE_FILE = /(^\.DS_Store$|\.swp$|\.swx$|~$|^README\.md$|\.(test|spec)\.[cm]?[jt]sx?$|^vitest\..*config\.[cm]?[jt]s$|\.bundled_[^.]*\.[cm]?js$|\.tsbuildinfo$)/;

function isIgnored(relPath) {
  const parts = relPath.split(path.sep);
  if (parts.some((p) => IGNORE_DIRS.has(p) || p.startsWith(".#"))) return true;
  return IGNORE_FILE.test(parts[parts.length - 1]);
}

function listInputs(pkgDir, rel = "") {
  const out = [];
  for (const ent of fs.readdirSync(path.join(pkgDir, rel), { withFileTypes: true })) {
    const relPath = rel ? path.join(rel, ent.name) : ent.name;
    if (isIgnored(relPath)) continue;
    if (ent.isDirectory()) out.push(...listInputs(pkgDir, relPath));
    else if (ent.isFile()) out.push(relPath);
  }
  return out;
}

function fingerprint(pkgDir) {
  const hash = createHash("sha1");
  hash.update(`TSUP_DTS=${process.env.TSUP_DTS ?? ""}\n`);
  for (const relPath of listInputs(pkgDir).sort()) {
    const st = fs.statSync(path.join(pkgDir, relPath));
    hash.update(`${relPath}\t${st.size}\t${st.mtimeMs}\n`);
  }
  return hash.digest("hex");
}

const stampPath = (pkgDir) => path.join(pkgDir, "node_modules", ".cache", "lib-dev-stamp.json");

function readStamp(pkgDir) {
  try {
    return JSON.parse(fs.readFileSync(stampPath(pkgDir), "utf8")).fingerprint;
  } catch {
    return null;
  }
}

function writeStamp(pkgDir, fp) {
  fs.mkdirSync(path.dirname(stampPath(pkgDir)), { recursive: true });
  fs.writeFileSync(stampPath(pkgDir), JSON.stringify({ fingerprint: fp, builtAt: new Date().toISOString() }));
}

function isFresh(pkgDir) {
  const dist = path.join(pkgDir, "dist");
  if (!fs.existsSync(dist) || fs.readdirSync(dist).length === 0) return false;
  return readStamp(pkgDir) === fingerprint(pkgDir);
}

let child = null;

function runTsup(pkgDir) {
  return new Promise((resolve) => {
    // 빌드 도중 바뀐 파일을 놓치지 않도록 지문은 빌드 시작 전에 뜬다.
    const fp = fingerprint(pkgDir);
    const bin = path.join(pkgDir, "node_modules", ".bin", process.platform === "win32" ? "tsup.cmd" : "tsup");
    child = spawn(bin, [], {
      cwd: pkgDir,
      stdio: "inherit",
      env: { ...process.env, TSUP_NO_CLEAN: "1" },
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      child = null;
      if (code === 0) writeStamp(pkgDir, fp);
      resolve(code ?? 1);
    });
  });
}

const log = (pkgDir, msg) => console.log(`[lib-dev] ${path.basename(pkgDir)}: ${msg}`);

async function buildCmd(args) {
  const force = args.includes("--force");
  for (const name of args.filter((a) => a !== "--force")) {
    const pkgDir = path.resolve(name);
    if (!force && isFresh(pkgDir)) {
      log(pkgDir, "변경 없음 — 빌드 건너뜀");
      continue;
    }
    log(pkgDir, "빌드");
    const code = await runTsup(pkgDir);
    if (code !== 0) process.exit(code);
  }
}

function watchCmd() {
  const pkgDir = process.cwd();
  let building = false;
  let pending = false;
  let timer = null;

  const build = async () => {
    if (building) {
      pending = true;
      return;
    }
    building = true;
    do {
      pending = false;
      const started = Date.now();
      const code = await runTsup(pkgDir);
      log(pkgDir, code === 0 ? `다시 빌드 완료 (${((Date.now() - started) / 1000).toFixed(1)}s)` : `빌드 실패 (exit ${code}) — 다음 저장 때 다시 빌드`);
    } while (pending);
    building = false;
  };

  // 감시를 먼저 걸어 두어야 첫 빌드 도중 저장한 변경도 놓치지 않는다.
  fs.watch(pkgDir, { recursive: true }, (_event, filename) => {
    // filename 이 없으면 무엇이 바뀌었는지 모르므로 다시 빌드한다.
    if (filename && isIgnored(filename.toString())) return;
    clearTimeout(timer);
    timer = setTimeout(build, 200);
  });

  if (isFresh(pkgDir)) log(pkgDir, "변경 없음 — 첫 빌드 건너뛰고 감시 시작");
  else {
    log(pkgDir, "소스가 바뀌어 첫 빌드 후 감시");
    build();
  }

  const stop = () => {
    if (child) child.kill("SIGTERM");
    process.exit(0);
  };
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, stop);
  // pnpm --parallel 워커는 부모가 죽으면 재부모화돼 남는다(fe-run.sh 의 straggler 정리 참고). 부모가 바뀌면 스스로 끝낸다.
  const parent = process.ppid;
  setInterval(() => {
    if (process.ppid !== parent) stop();
  }, 2000).unref();
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "build") await buildCmd(rest);
else if (cmd === "watch") watchCmd();
else {
  console.error("사용법: lib-dev.mjs build [--force] <pkgDir...> | watch");
  process.exit(2);
}
