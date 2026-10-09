#!/usr/bin/env node
// deps.sh 의 node 이식본. /dflow-dev --worker 행 H: 팀원 워크트리(cwd = 워크트리 루트)의 의존성을 설치한다.
// 동작·출력·환경 변수·종료 코드의 정본 설명은 아래(옛 deps.sh 머리 주석을 글자 그대로 옮김)다. 단계 순서: 1-0 워크트리 밖을 가리키는 node_modules
// 링크 제거 → 1 gradle-wrapper.jar 복사 → 1-1 gitignore 된 심링크 복제 → 2 설치(루트, 이어 하위 폴더 lockfile 폴더) → 4 준비 빌드.
// 출력 첫 단어: DEPS_GRADLE_JAR · DEPS_GRADLE_JAR_MISSING · DEPS_LINK · DEPS_LINK_SKIP · DEPS_UNLINKED · DEPS_SKIP · DEPS_CLONED ·
//   DEPS_CLONE_FAILED · DEPS_CACHED · DEPS_SYNCED · DEPS_SYNC_FAILED · DEPS_INSTALLED · DEPS_FAILED · DEPS_BUSY · DEPS_PREPARE ·
//   DEPS_PREPARED · DEPS_PREPARE_SKIP · DEPS_PREPARE_PENDING · DEPS_PREPARE_FAIL · DEPS_WARN
// 종료 코드: 0 정상(준비 빌드 실패 경고 포함), 75 DEPS_BUSY·DEPS_PREPARE_PENDING(실패 아님, 같은 호출을 다시 한다), 그 밖은 설치 명령의 exit.
// 환경 변수: DEPS_MAXDEPTH(기본 4) · MAIN_CHECKOUT · DFLOW_DEPS_MAIN_CLONE=1 · COMPAT_FORCE_OS · DFLOW_HEAVY_DIR(heavy 로 그대로 전달).
// 안전: 워크트리 밖(git 디렉터리의 표식·캐시 제외)에는 쓰지 않는다. 링크 경로는 재귀 삭제하지 않고 unlink 만 한다.
// 1) gradle-wrapper.jar 복구: *.jar 는 gitignore 대상이라 새 워크트리에 gradle/wrapper/gradle-wrapper.jar 가
//    없을 수 있다. 메인 체크아웃(env MAIN_CHECKOUT, 없으면 `git worktree list --porcelain` 의 첫 worktree)의
//    같은 상대 경로에 jar 가 있고 이 워크트리에 없을 때만 복사한다(이미 있으면 건드리지 않는다). gradlew 가
//    있는 폴더(루트 포함)마다 본다. 링크가 아니라 복사인 이유: 워크트리를 지워도 메인 체크아웃 쪽이 안전하다.
//    메인 체크아웃에도 jar 가 없으면 DEPS_GRADLE_JAR_MISSING <폴더> 로 알리기만 하고 계속한다(실패로 치지 않는다 —
//    jar 없이 방치된 예제 폴더도 있다). 조용히 건너뛰면 팀원이 testAll 실패 뒤에야 원인을 찾는다(2026-09-24).
// 1-1) gitignore 된 심링크 복제: 메인 체크아웃에서 ignore 된 심링크(.claude·node_modules 아래 제외, 깊이
//    DEPS_MAXDEPTH 미만)가 이 워크트리의 같은 상대 경로에 없으면 `ln -s <메인>/<경로>` 로 건다. 이미 무엇이든
//    있으면 건드리지 않는다. 외부 설계 문서 링크(dmes-standard docs/mdm/design)가 새 워크트리에 없어 팀원이 절대경로를
//    추측해 읽은 일(2026-09-24 TSK-02-02)에서 나왔다. Windows(Git Bash) 의 ln -s 는 복사본을 만들고 메인의 심링크도 복사본이라 한 건도 걸리지 않는다 —
//    그때는 `DEPS_WARN 윈도우(Git Bash): 의존성 링크가 한 건도 …` 한 줄로 알린다(윈도우에서 DEPS_LINK 가 하나도 없을 때만).
//    `node_modules` 자체가 심링크인 것은 걸지 않는다 — 링크째 걸리면 워커의 설치가 사람 체크아웃에 쓴다.
//    대상이 메인 체크아웃 안(폴더·파일·끊어진 링크 모두)을 가리키는 그 밖의 심링크도 걸지 않는다(DEPS_LINK_SKIP). 리포 밖(예 설계 문서)을 가리키는 것만 건다.
// 1-0) 메인 쓰기 방지(2026-10-05 tooltip-screens 사고): 설치 전에 이 워크트리 안의 `node_modules` 심링크를 깊이 제한 없이 찾아
//    그 대상이 워크트리(git rev-parse --show-toplevel, 물리 경로) 밖이거나 끊어졌으면 링크만 지운다
//    (DEPS_UNLINKED <경로> -> <대상>; 대상 폴더는 건드리지 않는다). pnpm 워크스페이스의 install 은 각 패키지의 node_modules 에
//    쓰므로, 패키지 node_modules 가 메인 체크아웃을 가리키는 심링크면 메인의 `node_modules/@dk-oasis/*` 링크가 워크트리 경로로
//    다시 써져 메인 포털이 깨진다. 링크를 지운 폴더 쪽 설치 폴더는 루트 node_modules 가 이미 있어도 건너뛰지 않고 다시 설치한다
//    (지운 자리를 설치가 워크트리 안에 독립된 node_modules 로 새로 만든다). 다시 부르는 경우(DEPS_BUSY 75)를 위해 지운 경로를
//    git 디렉터리의 dflow-deps-relink 에 남겼다가, 그 경로를 맡은 설치 폴더(위로 올라가며 처음 만나는 lockfile 폴더)의 설치가 성공하면 지운다. 설치할 폴더 자신이 워크트리 밖으로 가는 심링크이면
//    설치하지 않고 `DEPS_FAILED outside-worktree <폴더>` 로 끝낸다. 이 스크립트는 워크트리 밖 파일을 쓰지 않는다.
// 2) JS 의존성 설치. 루트뿐 아니라 하위 폴더의 lockfile 도 찾아 각각 설치한다(예 src/frontend/pnpm-lock.yaml)
//    — node_modules·.git·.claude(워크트리 포함) 는 제외하고 깊이는 DEPS_MAXDEPTH(기본 4)로 제한한다. 폴더마다
//    한 줄씩 보고하며, 루트 줄의 형식은 기존 계약과 글자 그대로 같다(접미사 없음) — 하위 폴더 줄만 끝에 그 폴더
//    경로를 붙인다. 복제는 macOS 는 cp -Rc(APFS 복제), 그 밖은 cp -R --reflink=auto 이고 안 되면 cp -R 이다.
//    APFS·reflink 파일시스템에서는 쓸 때만 실제로 복사된다.
//  2-a) npm(package-lock.json): lockfile·node 버전·플랫폼·폴더가 같은 설치본을 리포 공용 캐시
//    (<git-common-dir>/dflow-deps/<key>)에서 복제한다. 캐시는 이 스크립트의 npm ci 가 성공한 결과로만 채운다.
//    npm 은 사람 체크아웃의 node_modules 를 쓰지 않는다 — npm ci 는 node_modules 를 지우고 시작하므로 무엇을
//    복제해 두든 이득이 없고, 사람 체크아웃은 lockfile 과 어긋난 채 남아 있을 수 있다.
//    캐시는 완성 항목 최근 3개만 남긴다. 복제는 postinstall 을 다시 돌리지 않는다 — Playwright 브라우저처럼 postinstall 이
//    받는 것은 사용자 전역 캐시(macOS ~/Library/Caches/ms-playwright)에 있어 첫 npm ci 가 받아 두면 그대로 쓴다. 이 점을
//    "고치려고" 복제 뒤에 npm rebuild 를 넣지 않는다.
//  2-b) pnpm(pnpm-lock.yaml): 메인 체크아웃(MAIN)의 같은 폴더에 설치본이 있으면 그 node_modules 와 워크스페이스
//    패키지의 node_modules 를 같은 상대 경로로 복제한 뒤, 이 워크트리의 lockfile 로
//    `pnpm install --frozen-lockfile --prefer-offline --config.confirmModulesPurge=false` 를 한 번 돌린다.
//    사람 체크아웃의 설치본을 이제 써도 되는 이유: pnpm 은 기존 node_modules 를 lockfile 과 대조해 다른 것만
//    바로잡으므로, 사람 쪽이 어긋나 있어도(lockfile 을 받고 설치를 안 했거나, 스택 기점의 lockfile 이 기본 브랜치와
//    달라도) 이 install 뒤에는 워커 기점의 lockfile 대로다. 복제는 빈 폴더에서 시작하는 설치를 줄이는 출발점일
//    뿐 정답의 근거가 아니다(2026-09-24 실측: 의존 추가·제거가 이 install 에서 반영됐다).
//    실측으로 정한 세부(pnpm 10.14, 2026-09-24):
//    - 복제 뒤 모든 `*/node_modules/.bin`(.pnpm 안 포함)을 지운다. 셈의 NODE_PATH 에 메인의 절대경로가 박혀 있고,
//      install 은 최상위 셈만 새로 쓰고 .pnpm 안 패키지의 셈은 메인 경로로 남긴다. 지우면 install 이 전부 다시 만든다.
//    - confirmModulesPurge=false 없이 store 경로가 다르면(.modules.yaml 의 storeDir 는 절대경로) pnpm 은 "modules
//      디렉터리를 지우고 다시 설치할까" 를 묻고, stdin 이 /dev/null 이어도 실패하지 않고 영원히 기다린다. 이 설정이
//      있으면 묻지 않고 지운 뒤 새로 설치한다(결과는 맞고 이득만 없다). 같은 PC 의 워커는 store 가 같아 해당 없다.
//    - 메인의 node_modules 가 심링크면 복제하지 않는다(링크째 복제되면 워커의 install 이 사람 체크아웃에 쓴다).
//    - 복제나 복제 뒤 install 이 실패하면 복제본을 모두 지우고 새로 설치한다(반쯤 망가진 node_modules 를 남기지 않는다).
//    메인 복제는 DFLOW_DEPS_MAIN_CLONE=1 일 때만 한다(기본 꺼짐). dmes-standard src/frontend(파일 약 7.9만 개) 실측에서
//    복제+설치 134s·53s 가 새 설치(--prefer-offline, 따뜻한 store) 53s·26s 보다 두 배쯤 느렸다 — 시간이 cp 에 든다(2026-09-24).
//    메인에 설치본이 없으면 새로 설치한다(`--prefer-offline` 으로 전역 store 를 최대한 쓴다). pnpm 은 공용 캐시를
//    두지 않는다 — 메인 복제가 그 역할을 하고, 새 설치도 store 에서 링크만 하므로 캐시로 줄일 몫이 작다.
//  2-c) yarn(yarn.lock): 종전대로 새로 설치한다(이 PC 에 yarn 이 없어 복제 방식을 실측하지 못했다).
//
// 3) 설치 명령(npm ci · pnpm install · yarn install)은 같은 폴더의 heavy.sh(PC 전역 무거운 명령 세마포어)로 감싸 돈다.
//    팀원 여럿이 동시에 설치하면 그것만으로 메모리·CPU 가 바닥난다(2026-09-24, 16GB PC 에서 Gradle JVM 10개와 겹쳤다).
//    복제·심링크·jar 복사는 감싸지 않는다(가볍다). heavy.sh 가 대기 상한 안에 슬롯을 못 얻으면(HEAVY_BUSY, exit 75)
//    그 폴더를 `DEPS_BUSY <dir>`(루트는 ".") 로 알리고 곧바로 exit 75 로 끝난다. 실패가 아니다 — 같은 명령을 다시 부르면
//    이미 끝난 폴더는 DEPS_SKIP(node_modules 있음)으로 넘기고 이어서 진행한다(멱등). 그래서 BUSY 때는 반쯤 만든
//    node_modules(메인 복제본)를 남기지 않는다. 설치 명령 자신이 75 로 끝나도 BUSY 와 같이 거기서 멈춘다(드묾).
//    heavy.sh 의 출력(stderr)은 설치 출력과 함께 stdout 으로 나온다. 시험은 DFLOW_HEAVY_DIR 로 슬롯 폴더를 바꾼다.
//
// 4) 준비 빌드(prepare): 설치가 모두 성공한 뒤, 리포 루트의 `.dflow-gates` 에 `prepare<TAB><명령>` 줄이 있으면 그 명령을
//    리포 루트에서 **한 번** 돌린다(`bash -c`, heavy.sh 로 감싼다 — 설치와 같다). 새 워크트리에는 워크스페이스 라이브러리의
//    dist 가 없어 첫 vitest·lint 가 실패했다(2026-09-26 dmes-standard 성능 감사 P9). 예: `prepare	pnpm --filter "<패키지>^..." build`.
//    - `.dflow-gates` 는 한 줄에 `<키 또는 경로 접두><TAB><명령>` 이고 `full`·`prepare` 가 예약어다. 여기서는 첫 필드가 정확히
//      `prepare` 인 첫 줄만 읽는다(`#` 주석·빈 줄 무시). 파일이나 줄이 없으면 아무것도 하지 않는다.
//    - 이미 돌렸으면 다시 돌리지 않는다(DEPS_PREPARE_SKIP). 표식은 작업 트리 밖, 워크트리마다의 git 디렉터리
//      `$(git rev-parse --absolute-git-dir)/dflow-prepare.done` 에 명령의 cksum 으로 남긴다 — 명령이 바뀌면 다시 돈다.
//    - **이번 호출에서 실제로 설치를 했으면(heavy.sh 로 감싼 npm ci·pnpm install·yarn install 을 실제로 돌렸으면 —
//      캐시·메인 복제만으로 끝난 DEPS_CLONED 는 포함하지 않는다) 준비를 시작하지 않고 `DEPS_PREPARE_PENDING` 과 exit 75 로
//      끝낸다.** 설치 슬롯 대기(최대 90초)+설치+준비 슬롯 대기(최대 90초)+빌드가 한 호출에 다 쌓이면 Bash 도구 timeout
//      상한(600000ms)을 넘어 하네스가 백그라운드로 옮기는 정지 사고가 난다(설계 wbs-web 리포 docs/superpowers/specs/2026-09-26-dflow-perf-audit-kit-design.md, 킷에는 미동봉).
//      호출자가 다시 부르면 그때는 설치가 DEPS_SKIP 으로 끝나므로 준비만 돈다. `DEPS_BUSY`(exit 75)와 같은 뜻이다 — 실패가
//      아니며 같은 호출을 다시 한다. 설치가 필요 없던 호출(이미 설치돼 있어 DEPS_SKIP)에서는 이 호출 안에서 바로 돈다.
//    - 실패하면 `DEPS_PREPARE_FAIL exit <rc> <명령>` 경고만 내고 exit 는 설치 결과(0) 그대로다. 준비 빌드는 첫 게이트 실패를
//      줄이는 최적화이고, 실패 원인은 게이트가 다시 보여 준다. 표식을 남기지 않으므로 다음 호출이 다시 시도한다.
//    - 슬롯을 못 얻으면(HEAVY_BUSY) `DEPS_BUSY prepare` 와 exit 75 — 설치와 같이 다시 부르면 준비만 이어서 돈다.
//
// 출력 첫 단어: DEPS_GRADLE_JAR · DEPS_GRADLE_JAR_MISSING · DEPS_LINK · DEPS_LINK_SKIP · DEPS_UNLINKED · DEPS_SKIP · DEPS_CLONED · DEPS_CLONE_FAILED ·
//   DEPS_CACHED · DEPS_SYNCED · DEPS_SYNC_FAILED · DEPS_INSTALLED · DEPS_FAILED(exit 는 설치 명령의 exit) ·
//   DEPS_BUSY(exit 75, 다시 부른다) · DEPS_PREPARE · DEPS_PREPARED · DEPS_PREPARE_SKIP · DEPS_PREPARE_PENDING(exit 75, 다시
//   부르면 준비만 돈다) · DEPS_PREPARE_FAIL(경고, exit 0) · DEPS_WARN(경고, exit 0)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { runCommand } from '../../_shared/node/proc.mjs';

const USAGE = `사용법: node deps.mjs   (cwd = 워크트리 루트)
워크트리의 JS 의존성을 설치한다(gradle-wrapper.jar 복구 · 심링크 복제 · npm/pnpm/yarn 설치 · 준비 빌드).
종료 코드: 0 정상 · 75 DEPS_BUSY/DEPS_PREPARE_PENDING(같은 호출을 다시 한다) · 그 밖은 설치 명령의 exit
환경 변수: DEPS_MAXDEPTH MAIN_CHECKOUT DFLOW_DEPS_MAIN_CLONE COMPAT_FORCE_OS DFLOW_HEAVY_DIR
`;

const IS_WIN = process.platform === 'win32';
const IS_DARWIN = process.platform === 'darwin';
const BUSY_RC = 75;
const CWD = process.cwd();
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// ---- 출력: fs.writeSync 가 돌려주는 쓴 바이트 수로 부분 쓰기를 끝까지 이어 쓴다 ----
function writeAll(fd, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  let off = 0;
  while (off < buf.length) {
    try {
      off += fs.writeSync(fd, buf, off, buf.length - off);
    } catch (e) {
      if (e.code === 'EAGAIN') { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); continue; }
      if (e.code === 'EPIPE') return;
      throw e;
    }
  }
}
const out = (line) => writeAll(1, `${line}\n`);

// ---- 작은 파일 도우미 ----
const statOf = (p) => { try { return fs.statSync(p); } catch { return null; } };
const lstatOf = (p) => { try { return fs.lstatSync(p); } catch { return null; } };
const isFile = (p) => !!statOf(p)?.isFile();
const isDir = (p) => !!statOf(p)?.isDirectory();
const lexists = (p) => !!lstatOf(p);
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return ''; } };
const norm = (p) => { const s = String(p).replace(/\\/g, '/'); return IS_WIN ? s.toLowerCase() : s; };

// 링크 경로는 unlink 만 한다(윈도우의 junction·디렉터리 심링크는 unlink 가 막히면 비재귀 rmdir).
function removeLink(p) {
  try { fs.unlinkSync(p); return true; } catch (e) {
    if (!IS_WIN) return false;
    try { fs.rmdirSync(p); return true; } catch { return false; }
  }
}
// rm -rf 의 안전판: 링크면 링크만 지우고, 실제 파일·폴더만 재귀로 지운다.
function safeRm(p) {
  const st = lstatOf(p);
  if (!st) return;
  if (st.isSymbolicLink()) { removeLink(p); return; }
  try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* rm -rf 처럼 조용히 */ }
}

// ---- POSIX cksum (다항식 0x04C11DB7, 길이를 뒤에 붙이고 보수를 취한다) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = (i << 24) >>> 0;
    for (let k = 0; k < 8; k++) c = (c & 0x80000000) ? (((c << 1) ^ 0x04c11db7) >>> 0) : ((c << 1) >>> 0);
    t[i] = c;
  }
  return t;
})();
function cksum(buf) {
  let crc = 0;
  for (let i = 0; i < buf.length; i++) crc = (((crc << 8) >>> 0) ^ CRC_TABLE[((crc >>> 24) ^ buf[i]) & 0xff]) >>> 0;
  let n = buf.length;
  while (n > 0) {
    crc = (((crc << 8) >>> 0) ^ CRC_TABLE[((crc >>> 24) ^ (n & 0xff)) & 0xff]) >>> 0;
    n = Math.floor(n / 256);
  }
  return { crc: (~crc) >>> 0, len: buf.length };
}

// ---- git ----
function git(args, cwd = CWD) {
  const r = runCommand('git', args, { cwd });
  return r.status === 0 ? r.stdout.replace(/\r?\n+$/, '') : null;
}

// ---- find 대용 걷기. 항목 경로는 '/' 구분 상대경로이고 깊이 = 경로 성분 수(find -maxdepth 와 같다) ----
// prune(name, rel, dirent) 가 참이면 그 항목은 보고도 내려가기도 하지 않는다. 링크는 따라가지 않는다.
function parseDepth(v) { return /^[0-9]+$/.test(v) ? Number(v) : -1; }   // 잘못된 값은 find 가 오류로 아무것도 안 내는 것과 같다
function walk(rootAbs, maxdepth, prune, onEntry) {
  const rec = (relDir, depth) => {
    if (!(depth + 1 <= maxdepth)) return;
    let ents;
    try { ents = fs.readdirSync(relDir ? path.join(rootAbs, relDir) : rootAbs, { withFileTypes: true }); } catch { return; }
    ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of ents) {
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (prune(e.name, rel, e)) continue;
      onEntry(rel, e);
      if (e.isDirectory() && depth + 1 < maxdepth) rec(rel, depth + 1);
    }
  };
  rec('', 0);
}

const MAXDEPTH = parseDepth(process.env.DEPS_MAXDEPTH || '4');

// ---- 상태 ----
let installedThisCall = false;   // INSTALL_MARK: 이번 호출에서 heavy_install 을 불렀는가
let HBUSY = false;
let unlinkedNow = [];            // 이번 호출에서 지운 node_modules 링크 경로

// ---- heavy 로 감싸 돌리기 ----
function quoteWin(a) { return /[\s"&|<>^%]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a; }
function exitCodeOf(code, signal) {
  if (typeof code === 'number') return code;
  const n = signal ? os.constants.signals[signal] : 0;
  return n ? 128 + n : 1;
}
function spawnRc(cmd, args, opts) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (rc) => { if (!done) { done = true; resolve(rc); } };
    let child;
    const useShell = IS_WIN && /^(npm|pnpm|yarn)$/.test(cmd);
    try {
      child = useShell ? spawn([cmd, ...args.map(quoteWin)].join(' '), { ...opts, shell: true, windowsHide: true })
        : spawn(cmd, args, { ...opts, windowsHide: true });
    } catch (e) { fin(e.code === 'EACCES' ? 126 : 127); return; }
    child.on('error', (e) => fin(e.code === 'EACCES' ? 126 : 127));
    child.on('close', (code, signal) => fin(exitCodeOf(code, signal)));
    if (opts.onChild) opts.onChild(child);
  });
}

// 설치 명령을 heavy.mjs 로 감싸 돌리고 exit 를 돌려준다. 슬롯을 못 얻으면(rc 75 + HEAVY_BUSY 줄) HBUSY 를 세운다.
// heavy.mjs 가 없으면 그냥 돈다(fail-open). heavy 의 stdout·stderr 는 모두 우리 stdout 으로 나오고 HEAVY_BUSY 줄을 가려낸다.
async function heavyInstall(cmd, cwd) {
  HBUSY = false;
  installedThisCall = true;
  const heavy = path.join(SCRIPT_DIR, 'heavy.mjs');
  if (!isFile(heavy)) return spawnRc(cmd[0], cmd.slice(1), { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
  let sawBusy = false;
  const tails = ['', ''];
  const scan = (i, text, final) => {
    const lines = (tails[i] + text).split('\n');
    tails[i] = final ? '' : lines.pop();
    for (const l of lines) if (l.startsWith('HEAVY_BUSY')) sawBusy = true;
  };
  const rc = await spawnRc(process.execPath, [heavy, ...cmd], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    onChild: (child) => {
      child.stdout.on('data', (d) => { writeAll(1, d); scan(0, d.toString('utf8'), false); });
      child.stderr.on('data', (d) => { writeAll(1, d); scan(1, d.toString('utf8'), false); });
    },
  });
  scan(0, '', true);
  scan(1, '', true);
  if (rc === BUSY_RC && sawBusy) HBUSY = true;
  return rc;
}

// ---- 복제(cp -R 대용). 대상은 없어야 한다 ----
function cloneDir(src, dst) {
  if (IS_DARWIN) {
    const r = spawnSync('cp', ['-Rc', src, dst], { stdio: 'ignore' });
    if (r.status === 0) return true;
    safeRm(dst);
    return spawnSync('cp', ['-R', src, dst], { stdio: ['ignore', 'ignore', 'inherit'] }).status === 0;
  }
  // verbatimSymlinks: 상대 심링크를 절대경로로 바꾸지 않는다(바뀌면 설치가 원본·캐시에 쓴다). node 16.15·18.17 이상에서 지원
  const opts = { recursive: true, verbatimSymlinks: true };
  try { fs.cpSync(src, dst, opts); return true; } catch { /* 한 번 더 */ }
  safeRm(dst);
  try { fs.cpSync(src, dst, opts); return true; } catch { return false; }
}

// =====================================================================================================
async function main() {
  if (process.argv.slice(2).some((a) => a === '--help' || a === '-h')) { writeAll(1, USAGE); return 0; }

  // ---- 1-0) 워크트리 밖을 가리키는 node_modules 심링크 제거 ----
  const top0 = git(['rev-parse', '--show-toplevel']) || CWD;
  const TOP_PHYS = real(top0) || top0;
  const TOPN = norm(TOP_PHYS).replace(/\/+$/, '');
  const underTop = (p) => `${norm(p)}/`.startsWith(`${TOPN}/`);

  const gd0 = git(['rev-parse', '--absolute-git-dir']);
  const RELINK = gd0 ? `${gd0}/dflow-deps-relink` : '';

  // 표식 줄(<패키지>/node_modules)을 맡는 설치 폴더 = 그 패키지에서 위로 올라가며 처음 만나는 lockfile 폴더(없으면 ".")
  const relinkOwner = (p) => {
    let d = path.posix.dirname(p);
    while (d !== '.' && d !== '/') {
      if (isFile(`${TOP_PHYS}/${d}/pnpm-lock.yaml`) || isFile(`${TOP_PHYS}/${d}/package-lock.json`) || isFile(`${TOP_PHYS}/${d}/yarn.lock`)) return d;
      d = path.posix.dirname(d);
    }
    return '.';
  };
  const relinkFileLines = () => {
    if (!RELINK) return null;
    try { if ((fs.statSync(RELINK).size ?? 0) > 0) return fs.readFileSync(RELINK, 'utf8').split('\n'); } catch { /* 없음 */ }
    return null;
  };
  const relinkWanted = (dir) => {
    for (const u of [...unlinkedNow, ...(relinkFileLines() ?? [])]) if (u && relinkOwner(u) === dir) return true;
    return false;
  };
  const relinkDone = (dir) => {
    const lines = relinkFileLines();
    if (!lines) return;
    const keep = lines.filter((u) => u && relinkOwner(u) !== dir);
    if (keep.length) { try { fs.writeFileSync(RELINK, keep.map((u) => `${u}\n`).join('')); } catch { /* 무시 */ } }
    else { try { fs.unlinkSync(RELINK); } catch { /* 무시 */ } }
  };

  // 링크의 최종 대상(물리 경로, 폴더일 때만). 끊어졌거나 폴더가 아니면 ''.
  const linkTargetDir = (p) => {
    let l = '';
    try { l = fs.readlinkSync(p); } catch { return ''; }
    if (!l) return '';
    const r = real(p);
    return r && isDir(r) ? r : '';
  };

  const unlinked = [];
  walk(CWD, Infinity,
    (name, rel, e) => name === '.git' || rel === '.claude' || (name === 'node_modules' && e.isDirectory()),
    (rel, e) => {
      if (e.name !== 'node_modules' || !e.isSymbolicLink()) return;
      const abs = path.join(CWD, rel);
      let raw = '';
      try { raw = fs.readlinkSync(abs); } catch { /* 빈 문자열 */ }
      const tgt = linkTargetDir(abs);
      if (!tgt || !underTop(tgt)) {
        if (removeLink(abs)) unlinked.push({ rel, shown: tgt || raw });
      }
    });
  if (unlinked.length) {
    for (const u of unlinked) out(`DEPS_UNLINKED ${u.rel} -> ${u.shown}`);
    unlinkedNow = unlinked.map((u) => u.rel);
    if (RELINK) {
      try { fs.appendFileSync(RELINK, unlinkedNow.map((u) => `${u}\n`).join('')); }
      catch { out(`DEPS_WARN 재설치 표식을 쓰지 못했다(${RELINK}) — 이번 호출 안에서만 재설치한다`); }
    }
  }

  // ---- 1) gradle-wrapper.jar ----
  let MAIN = process.env.MAIN_CHECKOUT || '';
  if (!MAIN) {
    const wl = git(['worktree', 'list', '--porcelain']);
    const first = wl ? wl.split('\n')[0] : '';
    MAIN = first.startsWith('worktree ') ? first.slice('worktree '.length) : '';
  }
  if (!(MAIN && isDir(MAIN))) MAIN = '';

  walk(CWD, MAXDEPTH,
    (name, rel) => name === 'node_modules' || name === '.git' || rel === '.claude',
    (rel, e) => {
      if (e.name !== 'gradlew' || !e.isFile()) return;
      const dn = path.posix.dirname(rel);   // 루트면 '.'
      const relJar = dn === '.' ? 'gradle/wrapper/gradle-wrapper.jar' : `${dn}/gradle/wrapper/gradle-wrapper.jar`;
      if (isFile(path.join(CWD, relJar))) return;
      if (MAIN && isFile(`${MAIN}/${relJar}`)) {
        try {
          fs.mkdirSync(path.dirname(path.join(CWD, relJar)), { recursive: true });
          fs.copyFileSync(`${MAIN}/${relJar}`, path.join(CWD, relJar));
          out(`DEPS_GRADLE_JAR ${dn}`);
        } catch { /* cp 실패는 조용히(.sh 의 && 사슬과 같다) */ }
      } else {
        out(`DEPS_GRADLE_JAR_MISSING ${dn}`);   // 경고만 한다(exit 0)
      }
    });

  // ---- 1-1) gitignore 된 심링크 복제 ----
  const forceOs = process.env.COMPAT_FORCE_OS || (IS_WIN ? 'windows' : 'other');
  const DEPS_WIN = /^(windows$|MINGW|MSYS|CYGWIN)/.test(forceOs);

  const linkTargetAny = (p) => {
    let l = '';
    try { l = fs.readlinkSync(p); } catch { return ''; }
    if (!l) return '';
    const abs = (l.startsWith('/') || (IS_WIN && /^[A-Za-z]:[\\/]/.test(l))) ? l : `${path.dirname(p)}/${l}`;
    if (isDir(abs)) return real(abs);
    const d = real(path.dirname(abs));
    if (!d) return abs;   // 부모까지 없으면 글자 그대로 비교한다
    return `${d}/${path.basename(abs)}`;
  };
  const createLink = (p) => {
    const target = `${MAIN}/${p}`;
    const dest = path.join(CWD, p);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!IS_WIN) { fs.symlinkSync(target, dest); return; }
    if (isDir(target)) { fs.symlinkSync(target, dest, 'junction'); return; }
    try { fs.symlinkSync(target, dest, 'file'); } catch (e) {
      if (e.code === 'EPERM') fs.copyFileSync(target, dest); else throw e;
    }
  };
  const linkIgnoredSymlinks = (emit) => {
    const r = runCommand('git', ['-C', MAIN, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory']);
    if (r.status !== 0) return;
    const mainPhys = real(MAIN);
    for (const p of r.stdout.split('\n')) {
      if (!p) continue;
      // node_modules 자체가 심링크여도 걸지 않는다 — 링크째 걸리면 워커의 설치가 사람 체크아웃에 쓴다
      if (p.endsWith('/') || p.startsWith('.claude/') || p.includes('node_modules/') || p === 'node_modules' || p.endsWith('/node_modules') || p.startsWith('.git/')) continue;
      if (!((p.split('/').length - 1) < MAXDEPTH)) continue;
      if (!lstatOf(`${MAIN}/${p}`)?.isSymbolicLink()) continue;
      if (lexists(path.join(CWD, p))) continue;
      // 대상이 메인 체크아웃 안이면 건너뛴다 — 링크 너머로 쓰면 메인이 바뀐다
      const tgt = linkTargetAny(`${MAIN}/${p}`);
      if (tgt && `${norm(tgt)}/`.startsWith(`${norm(mainPhys)}/`)) { emit(`DEPS_LINK_SKIP ${p} (메인 체크아웃 안을 가리킨다)`); continue; }
      try { createLink(p); emit(`DEPS_LINK ${p}`); } catch { /* ln 실패는 조용히 */ }
    }
  };
  if (MAIN && norm(real(MAIN)) !== norm(real(CWD))) {
    if (DEPS_WIN) {
      const lines = [];
      linkIgnoredSymlinks((l) => lines.push(l));
      for (const l of lines) out(l);
      if (!lines.some((l) => l.startsWith('DEPS_LINK '))) {
        out('DEPS_WARN 윈도우(Git Bash): 의존성 링크(gitignore 된 심링크 복제)가 한 건도 걸리지 않았다(이미 있거나 메인에 원래 없으면 무시해도 된다) — 윈도우는 ln -s 가 복사를 만들어 메인의 심링크가 보이지 않을 수 있다. 외부 설계 문서 링크 같은 것이 필요하면 직접 복사하거나 개발자 모드 + MSYS=winsymlinks:nativestrict 로 메인에 심링크를 만든 뒤 다시 부른다');
      }
    } else {
      linkIgnoredSymlinks(out);
    }
  }

  // ---- 2) JS 의존성 ----
  const PNPM_FLAGS = ['--frozen-lockfile', '--prefer-offline', '--config.confirmModulesPurge=false'];
  const unameSM = () => `${os.type()} ${typeof os.machine === 'function' ? os.machine() : process.arch}`;

  // 복제할 워크스페이스 패키지 폴더(상대경로): 메인에 package.json 과 실제 node_modules 가 있고, 자기 lockfile 이 없고,
  // 워커 트리에 package.json 이 있으며 node_modules 는 아직 없는 것.
  const pnpmWsPkgs = (srcRoot, workDir) => {
    const pkgs = [];
    walk(srcRoot, MAXDEPTH,
      (name) => name === 'node_modules' || name === '.git' || name === '.claude',
      (rel, e) => {
        if (e.name !== 'package.json' || !e.isFile()) return;
        const p = path.posix.dirname(rel);
        if (p === '.') return;
        if (isFile(`${srcRoot}/${p}/pnpm-lock.yaml`) || isFile(`${srcRoot}/${p}/package-lock.json`) || isFile(`${srcRoot}/${p}/yarn.lock`)) return;
        if (!lstatOf(`${srcRoot}/${p}/node_modules`)?.isDirectory()) return;
        if (!isFile(path.join(workDir, p, 'package.json'))) return;
        if (lexists(path.join(workDir, p, 'node_modules'))) return;
        pkgs.push(p);
      });
    return pkgs;
  };

  // 복제본 안의 모든 */node_modules/.bin 폴더를 지운다(절대경로가 박힌 셈). 링크는 따라가지 않는다.
  const removeBins = (rootAbs) => {
    const stack = [rootAbs];
    while (stack.length) {
      const d = stack.pop();
      let ents;
      try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        if (!e.isDirectory()) continue;
        const p = `${d}/${e.name}`;
        if (p.replace(/\\/g, '/').endsWith('/node_modules/.bin')) safeRm(p); else stack.push(p);
      }
    }
  };

  const cacheRoot = (abs) => {
    let g = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], abs);
    if (!g) { g = git(['rev-parse', '--git-common-dir'], abs); if (g) g = path.resolve(abs, g); }
    return g ? `${g}/dflow-deps` : '';   // git 디렉터리를 못 찾으면 캐시를 쓰지 않는다(.sh 는 "/dflow-deps" 가 됐다)
  };

  const trimCache = (C) => {
    let names = [];
    try { names = fs.readdirSync(C).filter((n) => !n.startsWith('.')).sort(); } catch { return; }
    // ok 없이 60분 넘은 항목(쓰다 죽음)
    for (const n of names) {
      const d = `${C}/${n}`;
      const st = lstatOf(d);
      if (st?.isDirectory() && !isFile(`${d}/ok`) && Date.now() - st.mtimeMs > 60 * 60 * 1000) safeRm(d);
    }
    // 최근 3개를 넘는 완성 항목(ls -1t | tail -n +4)
    const rest = [];
    try {
      for (const n of fs.readdirSync(C).filter((x) => !x.startsWith('.'))) rest.push({ n, m: lstatOf(`${C}/${n}`)?.mtimeMs ?? 0 });
    } catch { return; }
    rest.sort((a, b) => (b.m - a.m) || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
    for (const { n } of rest.slice(3)) if (isFile(`${C}/${n}/ok`)) safeRm(`${C}/${n}`);
  };

  const installDir = async (dir) => {
    const abs = path.resolve(CWD, dir);
    const suffix = dir === '.' ? '' : ` ${dir}`;
    if (!isDir(abs)) { out(`DEPS_FAILED cd ${dir} exit 1`); return 1; }
    // 설치할 폴더가 심링크로 워크트리 밖을 가리키면 설치하지 않는다 — install 이 그 밖에 쓴다(1-0)
    const rp = real(abs);
    if (!rp || !underTop(rp)) { out(`DEPS_FAILED outside-worktree ${dir} exit 1`); return 1; }
    const P = (...s) => path.join(abs, ...s);

    if (!isFile(P('package.json'))) { out(`DEPS_SKIP package.json 없음${suffix}`); return 0; }
    let forced = false;
    if (fs.existsSync(P('node_modules'))) {
      if (!relinkWanted(dir)) { out(`DEPS_SKIP node_modules 있음${suffix}`); return 0; }
      forced = true;
    }
    const tmpName = `node_modules.dflow-tmp.${process.pid}`;

    if (isFile(P('package-lock.json'))) {
      let ck;
      try { ck = cksum(fs.readFileSync(P('package-lock.json'))); } catch { ck = { crc: 0, len: 0 }; }
      const keyText = `${ck.crc} ${ck.len}\n${process.version}\n${unameSM()}\n${dir}`;
      const key = String(cksum(Buffer.from(keyText, 'utf8')).crc);
      const C = cacheRoot(abs);
      const E = `${C}/${key}`;
      if (C && !IS_WIN && !forced && isFile(`${E}/ok`)) {
        const t = P(tmpName);
        safeRm(t);
        let okClone = cloneDir(`${E}/node_modules`, t);
        if (okClone) { try { fs.renameSync(t, P('node_modules')); } catch { okClone = false; } }
        if (okClone) {
          try { const now = new Date(); fs.utimesSync(E, now, now); } catch { /* touch 실패는 무시 */ }
          relinkDone(dir);
          out(`DEPS_CLONED ${key}${suffix}`);
          return 0;
        }
        safeRm(t);
        safeRm(P('node_modules'));
        out(`DEPS_CLONE_FAILED ${key}, npm ci 로 설치한다${suffix}`);
      }
      const rc = await heavyInstall(['npm', 'ci'], abs);
      if (HBUSY) { out(`DEPS_BUSY ${dir}`); return BUSY_RC; }
      if (rc !== 0) { out(`DEPS_FAILED npm ci exit ${rc}${suffix}`); return rc; }
      relinkDone(dir);
      out(`DEPS_INSTALLED npm ci${suffix}`);
      // 캐시 채우기. mkdir 에 성공한 한 팀원만 쓰고, 다 쓴 뒤 ok 를 남긴다. 실패해도 설치 결과는 유효하다.
      if (C && !IS_WIN) {   // 윈도우는 junction 이 절대경로라 복제본이 다른 체크아웃을 가리킨다 — 캐시를 쓰지 않는다
        try { fs.mkdirSync(C, { recursive: true }); } catch { /* 무시 */ }
        let made = false;
        try { fs.mkdirSync(E); made = true; } catch { /* 남이 만들었다 */ }
        if (made) {
          if (cloneDir(P('node_modules'), `${E}/node_modules`)) {
            safeRm(`${E}/node_modules/.cache`);
            safeRm(`${E}/node_modules/.vite`);   // 절대경로를 품을 수 있는 도구 캐시
            try { fs.writeFileSync(`${E}/ok`, `${Math.floor(Date.now() / 1000)}\n`); out(`DEPS_CACHED ${key}${suffix}`); } catch { /* 무시 */ }
          } else {
            safeRm(E);
          }
        }
        trimCache(C);
      }
      return 0;
    }

    if (isFile(P('pnpm-lock.yaml'))) {
      // 2-b) 메인 체크아웃의 설치본을 복제한 뒤 이 워크트리의 lockfile 로 바로잡는다
      const srcRoot = `${MAIN}/${dir}`;
      if (!forced && !IS_WIN && process.env.DFLOW_DEPS_MAIN_CLONE === '1' && MAIN && lstatOf(`${srcRoot}/node_modules`)?.isDirectory()) {
        let cloned = [];
        let ok = true;
        const t = P(tmpName);
        safeRm(t);
        let first = cloneDir(`${srcRoot}/node_modules`, t);
        if (first) { try { fs.renameSync(t, P('node_modules')); } catch { first = false; } }
        if (first) {
          cloned = ['node_modules'];
          for (const p of pnpmWsPkgs(srcRoot, abs)) {
            const c = cloneDir(`${srcRoot}/${p}/node_modules`, P(p, 'node_modules'));
            cloned.push(`${p}/node_modules`);
            if (!c) { ok = false; break; }
          }
        } else {
          ok = false;
        }
        if (ok) {
          for (const c of cloned) {
            removeBins(P(c));
            safeRm(P(c, '.cache'));
            safeRm(P(c, '.vite'));   // 절대경로를 품을 수 있는 도구 캐시
          }
          const rc = await heavyInstall(['pnpm', 'install', ...PNPM_FLAGS], abs);
          if (HBUSY) {
            // 아래에서 복제본을 지우고 DEPS_BUSY 로 끝낸다(다시 부르면 처음부터 — 멱등)
          } else if (rc === 0) {
            relinkDone(dir); out(`DEPS_SYNCED pnpm 메인 복제 + frozen install${suffix}`); return 0;
          } else {
            out(`DEPS_SYNC_FAILED pnpm install exit ${rc}, 복제본을 지우고 새로 설치한다${suffix}`);
          }
        } else {
          out(`DEPS_CLONE_FAILED 메인 node_modules 복제 실패, 새로 설치한다${suffix}`);
        }
        safeRm(t);
        for (const c of cloned) safeRm(P(c));
        if (HBUSY) { out(`DEPS_BUSY ${dir}`); return BUSY_RC; }
      }
      const rc = await heavyInstall(['pnpm', 'install', ...PNPM_FLAGS], abs);
      if (HBUSY) { out(`DEPS_BUSY ${dir}`); return BUSY_RC; }
      if (rc !== 0) { out(`DEPS_FAILED pnpm install --frozen-lockfile exit ${rc}${suffix}`); return rc; }
      relinkDone(dir);
      out(`DEPS_INSTALLED pnpm${suffix}`);
      return 0;
    }

    if (isFile(P('yarn.lock'))) {
      // 무결성 기록이 맞으면 지운 패키지 폴더를 다시 만들지 않고 끝날 수 있다
      const rc = await heavyInstall(['yarn', 'install', '--frozen-lockfile', ...(forced ? ['--check-files'] : [])], abs);
      if (HBUSY) { out(`DEPS_BUSY ${dir}`); return BUSY_RC; }
      if (rc !== 0) { out(`DEPS_FAILED yarn install --frozen-lockfile exit ${rc}${suffix}`); return rc; }
      relinkDone(dir);
      out(`DEPS_INSTALLED yarn${suffix}`);
      return 0;
    }

    out(`DEPS_SKIP lockfile 없음${suffix}`);
    return 0;
  };

  let status = 0;
  // 설치 슬롯을 못 얻은 폴더(DEPS_BUSY, exit 75)가 나오면 거기서 멈추고 75 로 끝난다 — 다시 부르면 이어서 진행한다
  const rootRc = await installDir('.');
  if (rootRc !== 0) status = rootRc;
  if (status === BUSY_RC) return BUSY_RC;

  // 하위 폴더의 lockfile 도 찾는다(루트 자신은 제외)
  const subSet = new Set();
  walk(CWD, MAXDEPTH,
    (name, rel) => name === 'node_modules' || name === '.git' || rel === '.claude',
    (rel, e) => {
      if (!e.isFile() || !(e.name === 'package-lock.json' || e.name === 'pnpm-lock.yaml' || e.name === 'yarn.lock')) return;
      const d = path.posix.dirname(rel);
      if (d !== '.') subSet.add(d);
    });
  for (const d of [...subSet].sort()) {
    const rc = await installDir(d);
    if (rc !== 0) {
      if (rc === BUSY_RC) return BUSY_RC;
      if (status === 0) status = rc;
    }
  }

  // ---- 4) 준비 빌드(prepare) ----
  if (status === 0) {
    const top = git(['rev-parse', '--show-toplevel']) || CWD;
    const gf = path.join(top, '.dflow-gates');
    let pcmd = '';
    if (isFile(gf)) {
      // 첫 필드가 정확히 prepare 인 첫 줄. # 주석·빈 줄은 무시하고 CR 은 지운다. 명령 = 첫 TAB 뒤 전부
      const lines = fs.readFileSync(gf, 'utf8').replace(/\r/g, '').split('\n');
      for (const line of lines) {
        if (/^[ \t]*#/.test(line) || /^[ \t]*$/.test(line)) continue;
        const tab = line.indexOf('\t');
        const first = tab < 0 ? line : line.slice(0, tab);
        if (first === 'prepare') { pcmd = tab < 0 ? '' : line.slice(tab + 1); break; }
      }
      pcmd = pcmd.trim();
    }
    if (pcmd) {
      const gd = git(['rev-parse', '--absolute-git-dir']) || '';
      const mark = gd ? `${gd}/dflow-prepare.done` : '';
      const h = String(cksum(Buffer.from(pcmd, 'utf8')).crc);
      let prev = null;
      if (mark) { try { prev = fs.readFileSync(mark, 'utf8').replace(/\n+$/, ''); } catch { prev = null; } }
      if (mark && prev === h) {
        out(`DEPS_PREPARE_SKIP 이미 돌렸다: ${pcmd}`);
      } else if (installedThisCall) {
        // 이번 호출에서 실제로 설치를 했다 — 여기서 멈추고 다시 부르게 한다(DEPS_BUSY 와 같은 뜻)
        out(`DEPS_PREPARE_PENDING ${pcmd}`);
        return BUSY_RC;
      } else {
        out(`DEPS_PREPARE ${pcmd}`);
        const bash = findBash();
        if (!bash) {
          out('DEPS_WARN Git Bash 없음: bash.exe 를 PATH 와 C:/Program Files/Git/bin 에서 찾지 못해 준비 빌드를 돌리지 못했다');
          out(`DEPS_PREPARE_FAIL exit 127 ${pcmd}`);
        } else {
          const cwd = isDir(top) ? top : CWD;
          const rc = await heavyInstall([bash, '-c', pcmd], cwd);
          if (HBUSY) {
            out('DEPS_BUSY prepare'); return BUSY_RC;
          } else if (rc === 0) {
            if (mark) {
              const tmp = `${mark}.tmp.${process.pid}`;
              try { fs.writeFileSync(tmp, `${h}\n`); fs.renameSync(tmp, mark); } catch { /* 무시 */ }
              try { fs.rmSync(tmp, { force: true }); } catch { /* 무시 */ }
            }
            out(`DEPS_PREPARED ${pcmd}`);
          } else {
            // 경고만 한다(exit 는 설치 결과 그대로). 표식을 남기지 않으므로 다음 호출이 다시 시도한다
            out(`DEPS_PREPARE_FAIL exit ${rc} ${pcmd}`);
          }
        }
      }
    }
  }
  return status;
}

// 윈도우: PATH 의 bash.exe(WSL 런처인 System32·WindowsApps 것은 제외), 없으면 Git for Windows 기본 위치. 그 밖은 PATH 의 bash.
function findBash() {
  if (!IS_WIN) return 'bash';
  for (const d of (process.env.PATH || '').split(';')) {
    if (!d || /[\\/](system32|WindowsApps)([\\/]|$)/i.test(d)) continue;   // WSL 런처 제외
    const c = path.join(d, 'bash.exe');
    if (isFile(c)) return c;
  }
  const fallback = 'C:/Program Files/Git/bin/bash.exe';
  return isFile(fallback) ? fallback : null;
}

main().then((code) => process.exit(code), (e) => {
  writeAll(2, `deps.mjs: ${e && e.stack ? e.stack : e}\n`);
  process.exit(1);
});
