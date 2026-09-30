#!/usr/bin/env node
// 화면 라이브러리(shared, m-*) dev 빌드 도우미.
//
// `tsup --watch` 는 뜰 때마다 소스가 그대로여도 전체 빌드(.d.ts 포함)를 한 번 한다.
// 이 스크립트는 입력 파일 지문(경로·크기·수정 시각)을 지난 빌드 때 남긴 값과 비교해
// 바뀐 패키지만 빌드하고, watch 도 처음 빌드 없이 파일이 바뀔 때만 `tsup` 을 돌린다.
//
//   node scripts/lib-dev.mjs build [--force] <pkgDir...>   # frontend 루트에서. 적힌 순서대로(shared 먼저)
//   node ../scripts/lib-dev.mjs watch                      # 패키지 폴더에서(package.json "dev")
//   node ../scripts/lib-dev.mjs pkg-build [tsup 인자…]      # 패키지 폴더에서(package.json "build")
//
// pkg-build: 그 패키지를 dev watch 가 감시 중이면 tsup 을 따로 돌리지 않고 watch 에 "지금 .d.ts 까지" 를 청해
// 결과를 기다린다(2026-09-30: 에이전트가 dev 중에 pnpm build 를 돌려 tsup 둘이 같은 dist 에 쓰고, shared 는 clean 으로
// dist 를 비워 떠 있는 포털을 흔들었다). watch 가 없으면(다른 워크트리·CI·배포) 예전과 똑같이 tsup 을 돌린다.
//
// watch 는 저장하면 JS 만 바로 빌드하고(TSUP_DTS=0, 약 1초), .d.ts 는 저장이 LIB_DEV_DTS_DELAY_MS(기본 20초)
// 동안 멈춘 뒤 한 번만 만든다(`tsup --dts-only`). .d.ts 생성은 tsc 급 작업이라(shared 25초) 저장마다 돌리면
// 여러 세션이 함께 쓰는 PC 의 CPU 를 다 잡아먹는다. next dev 는 .d.ts 를 쓰지 않고, 편집기의 패키지 간 타입과
// 선언 안 된 식별자 검사만 .d.ts 쪽에 기대므로 조금 늦게 따라와도 된다. watch 에 TSUP_DTS=0 을 주면 .d.ts 를 아예 만들지 않는다.
// tsup 은 nice 로 낮은 우선순위로 돌린다(화면·다른 세션 작업을 먼저 돌게 한다).
//
// 지문은 <pkg>/node_modules/.cache/lib-dev-stamp.json 에 둔다(배포 대상 dist 에 섞지 않는다).
// 한 번씩 도는 tsup 이 dist 를 비우지 않도록 TSUP_NO_CLEAN=1 을 넘긴다(shared 의 clean 설정 참고).
import { execFileSync, spawn } from "node:child_process";
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
  for (const relPath of listInputs(pkgDir).sort()) {
    const st = fs.statSync(path.join(pkgDir, relPath));
    hash.update(`${relPath}\t${st.size}\t${st.mtimeMs}\n`);
  }
  return hash.digest("hex");
}

const cacheDir = (pkgDir) => path.join(pkgDir, "node_modules", ".cache");
const stampPath = (pkgDir) => path.join(cacheDir(pkgDir), "lib-dev-stamp.json");
/** watch 가 떠 있는 동안 두는 잠금 — { pid }. pkg-build 가 이것으로 watch 를 찾는다. */
const lockPath = (pkgDir) => path.join(cacheDir(pkgDir), "lib-dev-watch.json");
/** watch 의 마지막 .d.ts 빌드 출력. pkg-build 가 실패를 보여 줄 때 쓴다. */
const dtsLogPath = (pkgDir) => path.join(cacheDir(pkgDir), "lib-dev-dts.log");

/** { fingerprint, dts, dtsFailed } — dts 는 그 지문의 소스로 .d.ts 까지 만들었는지, dtsFailed 는 .d.ts 가 실패했는지. */
function readStamp(pkgDir) {
  try {
    const stamp = JSON.parse(fs.readFileSync(stampPath(pkgDir), "utf8"));
    return { fingerprint: stamp.fingerprint ?? null, dts: stamp.dts === true, dtsFailed: stamp.dtsFailed === true };
  } catch {
    return { fingerprint: null, dts: false, dtsFailed: false };
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

function writeStamp(pkgDir, fp, dts, dtsFailed = false) {
  writeJsonAtomic(stampPath(pkgDir), { fingerprint: fp, dts, dtsFailed, builtAt: new Date().toISOString() });
}

const dtsWanted = () => process.env.TSUP_DTS !== "0";

/** "fresh" — 할 일 없음 · "dts" — JS 는 최신이고 .d.ts 만 필요 · "full" — 다시 빌드. */
function staleness(pkgDir) {
  const dist = path.join(pkgDir, "dist");
  if (!fs.existsSync(dist) || fs.readdirSync(dist).length === 0) return "full";
  const stamp = readStamp(pkgDir);
  if (stamp.fingerprint !== fingerprint(pkgDir)) return "full";
  return stamp.dts || !dtsWanted() ? "fresh" : "dts";
}

let child = null;

/** 도는 tsup 을 끝낸다. Windows 는 shell 을 거쳐 뜨므로 셸만 죽으면 tsup 이 남는다 — 트리째 끝낸다. */
function killChild() {
  if (!child) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

/**
 * mode: "all" — 설정대로(TSUP_DTS 를 따른다) · "js" — .d.ts 없이 · "dts" — .d.ts 만(`--dts-only`).
 * 끝나면 지문을 남긴다. 지문은 빌드 도중 바뀐 파일을 놓치지 않도록 시작 전에 뜬다.
 */
function runTsup(pkgDir, mode = "all") {
  return new Promise((resolve) => {
    const fp = fingerprint(pkgDir);
    const bin = path.join(pkgDir, "node_modules", ".bin", process.platform === "win32" ? "tsup.cmd" : "tsup");
    const args = mode === "dts" ? ["--dts-only"] : [];
    const env = { ...process.env, TSUP_NO_CLEAN: "1" };
    if (mode === "js") env.TSUP_DTS = "0";
    const [cmd, cmdArgs] = process.platform === "win32" ? [bin, args] : ["nice", ["-n", "10", bin, ...args]];
    // .d.ts 출력은 로그 파일에도 남긴다 — watch 에 빌드를 맡긴 pkg-build 가 실패 내용을 보여 준다.
    const tee = mode === "dts";
    child = spawn(cmd, cmdArgs, {
      cwd: pkgDir,
      stdio: tee ? ["ignore", "pipe", "pipe"] : "inherit",
      env,
      shell: process.platform === "win32",
    });
    if (tee) {
      fs.mkdirSync(cacheDir(pkgDir), { recursive: true });
      const out = fs.createWriteStream(dtsLogPath(pkgDir));
      child.stdout.on("data", (d) => (process.stdout.write(d), out.write(d)));
      child.stderr.on("data", (d) => (process.stderr.write(d), out.write(d)));
      child.on("close", () => out.end());
    }
    child.on("exit", (code, signal) => {
      child = null;
      if (mode !== "dts") {
        if (code === 0) writeStamp(pkgDir, fp, mode === "all" && dtsWanted());
      } else if (!signal && readStamp(pkgDir).fingerprint === fp) {
        // .d.ts 만 만든 경우는 JS 가 같은 소스로 빌드돼 있을 때만 결과를 남긴다.
        writeStamp(pkgDir, fp, code === 0, code !== 0);
      }
      resolve(signal ? "killed" : (code ?? 1));
    });
  });
}

const log = (pkgDir, msg) => console.log(`[lib-dev] ${path.basename(pkgDir)}: ${msg}`);

async function buildCmd(args) {
  const force = args.includes("--force");
  for (const name of args.filter((a) => a !== "--force")) {
    const pkgDir = path.resolve(name);
    const state = force ? "full" : staleness(pkgDir);
    if (state === "fresh") {
      log(pkgDir, "변경 없음 — 빌드 건너뜀");
      continue;
    }
    log(pkgDir, state === "dts" ? ".d.ts 만 빌드" : "빌드");
    const code = await runTsup(pkgDir, state === "dts" ? "dts" : "all");
    if (code !== 0) process.exit(typeof code === "number" ? code : 1);
  }
}

function watchCmd() {
  const pkgDir = process.cwd();
  const dtsDelay = Number(process.env.LIB_DEV_DTS_DELAY_MS ?? 20000);
  let building = false;
  let pendingJs = false;
  let runningDts = false;
  let changeTimer = null;
  let dtsTimer = null;
  // pkg-build 가 SIGUSR2 로 "지금 .d.ts 까지" 를 청하면 켠다. 조용해지기를 기다리지 않고 바로 만든다.
  let dtsNow = false;

  const seconds = (started) => ((Date.now() - started) / 1000).toFixed(1);

  const scheduleDts = () => {
    clearTimeout(dtsTimer);
    if (dtsWanted()) dtsTimer = setTimeout(buildDts, dtsNow ? 0 : dtsDelay);
  };

  const buildJs = async () => {
    if (building) {
      pendingJs = true;
      return;
    }
    building = true;
    do {
      pendingJs = false;
      const started = Date.now();
      const code = await runTsup(pkgDir, "js");
      log(pkgDir, code === 0 ? `다시 빌드 완료 (${seconds(started)}s, .d.ts 는 저장이 멈추면)` : `빌드 실패 (exit ${code}) — 다음 저장 때 다시 빌드`);
    } while (pendingJs);
    building = false;
    scheduleDts();
  };

  async function buildDts() {
    if (building) return; // 진행 중인 JS 빌드가 끝나면 다시 예약한다.
    building = true;
    runningDts = true;
    const started = Date.now();
    const code = await runTsup(pkgDir, "dts");
    runningDts = false;
    building = false;
    if (code !== "killed") dtsNow = false;
    if (code === "killed") log(pkgDir, ".d.ts 빌드 중단 — 파일이 바뀌어 다시 예약");
    else log(pkgDir, code === 0 ? `.d.ts 완료 (${seconds(started)}s)` : `.d.ts 실패 (exit ${code}) — 타입 오류를 확인하세요`);
    if (pendingJs) buildJs();
  }

  // 감시를 먼저 걸어 두어야 첫 빌드 도중 저장한 변경도 놓치지 않는다.
  fs.watch(pkgDir, { recursive: true }, (_event, filename) => {
    // filename 이 없으면 무엇이 바뀌었는지 모르므로 다시 빌드한다.
    if (filename && isIgnored(filename.toString())) return;
    clearTimeout(dtsTimer);
    // 낡은 소스로 도는 .d.ts 빌드는 끊는다. JS 빌드가 끝나면 다시 예약된다.
    if (runningDts) killChild();
    clearTimeout(changeTimer);
    changeTimer = setTimeout(buildJs, 200);
  });

  process.on("SIGUSR2", () => {
    dtsNow = true;
    if (building) return; // 도는 JS 빌드 뒤에 바로 .d.ts 가 붙고, 도는 .d.ts 는 그대로 둔다.
    const now = staleness(pkgDir);
    if (now === "full") buildJs();
    else if (now === "dts") {
      clearTimeout(dtsTimer);
      buildDts();
    }
  });

  writeJsonAtomic(lockPath(pkgDir), { pid: process.pid, startedAt: new Date().toISOString() });
  process.on("exit", () => {
    try {
      if (JSON.parse(fs.readFileSync(lockPath(pkgDir), "utf8")).pid === process.pid) fs.unlinkSync(lockPath(pkgDir));
    } catch {}
  });

  const state = staleness(pkgDir);
  if (state === "fresh") log(pkgDir, "변경 없음 — 첫 빌드 건너뛰고 감시 시작");
  else if (state === "dts") {
    log(pkgDir, "JS 는 최신 — .d.ts 만 예약하고 감시 시작");
    scheduleDts();
  } else {
    log(pkgDir, "소스가 바뀌어 첫 빌드 후 감시");
    buildJs();
  }

  const stop = () => {
    killChild();
    process.exit(0);
  };
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, stop);
  // pnpm --parallel 워커는 부모가 죽으면 재부모화돼 남는다(fe-run.sh 의 straggler 정리 참고). 부모가 바뀌면 스스로 끝낸다.
  const parent = process.ppid;
  setInterval(() => {
    if (process.ppid !== parent) stop();
  }, 2000).unref();
}

/** 잠금의 pid 가 살아 있고 그 프로세스가 정말 lib-dev watch 인지(pid 재사용 대비). */
function liveWatchPid(pkgDir) {
  try {
    const { pid } = JSON.parse(fs.readFileSync(lockPath(pkgDir), "utf8"));
    process.kill(pid, 0);
    const command = execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
    return command.includes("lib-dev.mjs") && command.includes("watch") ? pid : null;
  } catch {
    return null;
  }
}

/**
 * 패키지 "build" 스크립트. dev watch 가 이 패키지를 감시 중이면 tsup 을 따로 돌리지 않고 watch 에 맡긴다 —
 * 같은 dist 에 두 tsup 이 동시에 쓰고, shared 는 clean 으로 dist 를 비워 떠 있는 포털(next dev)을 깨뜨린다.
 * watch 에 SIGUSR2 로 "지금 .d.ts 까지" 를 청하고, 지문이 지금 소스와 맞는 결과가 나오면 그 성패로 끝낸다.
 * 그 밖의 경우(watch 없음·인자 있음·CI·Windows·LIB_DEV_FORCE_BUILD=1·시간 초과)는 예전과 똑같이 tsup 을 돌린다.
 */
async function pkgBuildCmd(args) {
  const pkgDir = process.cwd();
  const plainTsup = () => {
    const bin = path.join(pkgDir, "node_modules", ".bin", process.platform === "win32" ? "tsup.cmd" : "tsup");
    const p = spawn(bin, args, { cwd: pkgDir, stdio: "inherit", shell: process.platform === "win32" });
    p.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
  };
  if (args.length > 0 || process.env.CI || process.platform === "win32" || process.env.LIB_DEV_FORCE_BUILD === "1") {
    return plainTsup();
  }
  const pid = liveWatchPid(pkgDir);
  if (!pid) return plainTsup();

  const wantDts = dtsWanted();
  const timeoutMs = Number(process.env.LIB_DEV_WAIT_MS ?? 600000);
  log(pkgDir, `dev watch(pid ${pid})가 감시 중 — tsup 을 따로 돌리지 않고 watch 결과를 기다린다 (직접 빌드: LIB_DEV_FORCE_BUILD=1)`);
  const started = Date.now();
  let signaledFp = null;
  for (;;) {
    const fp = fingerprint(pkgDir);
    const stamp = readStamp(pkgDir);
    if (stamp.fingerprint === fp && fs.existsSync(path.join(pkgDir, "dist"))) {
      if (stamp.dts || !wantDts) {
        console.log(`ESM ⚡️ Build success — dev watch 결과(${wantDts ? "JS + .d.ts" : "JS"}, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
        process.exit(0);
      }
      if (stamp.dtsFailed) {
        try {
          process.stdout.write(fs.readFileSync(dtsLogPath(pkgDir), "utf8"));
        } catch {}
        log(pkgDir, "watch 의 .d.ts 빌드가 실패했다(위 출력)");
        process.exit(1);
      }
    }
    if (wantDts && signaledFp !== fp) {
      try {
        process.kill(pid, "SIGUSR2");
      } catch {
        log(pkgDir, "watch 가 사라졌다 — 직접 빌드한다");
        return plainTsup();
      }
      signaledFp = fp;
    }
    if (Date.now() - started > timeoutMs) {
      log(pkgDir, `watch 결과를 ${timeoutMs / 1000}초 안에 받지 못했다 — 직접 빌드한다`);
      return plainTsup();
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "build") await buildCmd(rest);
else if (cmd === "watch") watchCmd();
else if (cmd === "pkg-build") await pkgBuildCmd(rest);
else {
  console.error("사용법: lib-dev.mjs build [--force] <pkgDir...> | watch | pkg-build [tsup 인자…]");
  process.exit(2);
}
