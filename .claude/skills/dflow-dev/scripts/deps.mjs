#!/usr/bin/env node
// deps.sh 의 node 이식본. /dflow-dev --worker 행 H: 팀원 워크트리(cwd = 워크트리 루트)의 의존성을 설치한다.
// 동작·출력·환경 변수·종료 코드의 정본 설명은 deps.sh 머리 주석이다. 단계 순서: 1-0 워크트리 밖을 가리키는 node_modules
// 링크 제거 → 1 gradle-wrapper.jar 복사 → 1-1 gitignore 된 심링크 복제 → 2 설치(루트, 이어 하위 폴더 lockfile 폴더) → 4 준비 빌드.
// 출력 첫 단어: DEPS_GRADLE_JAR · DEPS_GRADLE_JAR_MISSING · DEPS_LINK · DEPS_LINK_SKIP · DEPS_UNLINKED · DEPS_SKIP · DEPS_CLONED ·
//   DEPS_CLONE_FAILED · DEPS_CACHED · DEPS_SYNCED · DEPS_SYNC_FAILED · DEPS_INSTALLED · DEPS_FAILED · DEPS_BUSY · DEPS_PREPARE ·
//   DEPS_PREPARED · DEPS_PREPARE_SKIP · DEPS_PREPARE_PENDING · DEPS_PREPARE_FAIL · DEPS_WARN
// 종료 코드: 0 정상(준비 빌드 실패 경고 포함), 75 DEPS_BUSY·DEPS_PREPARE_PENDING(실패 아님, 같은 호출을 다시 한다), 그 밖은 설치 명령의 exit.
// 환경 변수: DEPS_MAXDEPTH(기본 4) · MAIN_CHECKOUT · DFLOW_DEPS_MAIN_CLONE=1 · COMPAT_FORCE_OS · DFLOW_HEAVY_DIR(heavy 로 그대로 전달).
// 안전: 워크트리 밖(git 디렉터리의 표식·캐시 제외)에는 쓰지 않는다. 링크 경로는 재귀 삭제하지 않고 unlink 만 한다.
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
        if (p.endsWith('/node_modules/.bin')) safeRm(p); else stack.push(p);
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
      if (C && !forced && isFile(`${E}/ok`)) {
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
      if (C) {
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
      if (!forced && process.env.DFLOW_DEPS_MAIN_CLONE === '1' && MAIN && lstatOf(`${srcRoot}/node_modules`)?.isDirectory()) {
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

// 윈도우: PATH 의 bash.exe(WSL 런처인 System32 것은 제외), 없으면 Git for Windows 기본 위치. 그 밖은 PATH 의 bash.
function findBash() {
  if (!IS_WIN) return 'bash';
  for (const d of (process.env.PATH || '').split(';')) {
    if (!d || /[\\/]system32([\\/]|$)/i.test(d)) continue;
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
