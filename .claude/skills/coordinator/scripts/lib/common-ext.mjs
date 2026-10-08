// common.sh 에서 bash 로 남긴 함수들(coord_log·coord_die·coord_do·coord_state_call·coord_git·coord_read1·coord_mkdirp·
// coord_default_repo·coord_cpus·coord_load1·coord_heavy_script·coord_heavy_run_in_wt·coord_wt_procs·coord_bg_signals)의 node 판.
// bash 스크립트들은 계속 common.sh 의 bash 판을 쓰므로 스위치는 없다(js-bridge 를 거치지 않는다). W3-b·후속 레인과
// 스크립트 node 판이 import 한다. 계약: tests/js-parity/README.md, 대조 명세 specs/common-ext.mjs(정답은 bash 판).
//   · coord_cpus·coord_load1 은 os.cpus()/os.loadavg() 로 바꾸지 않고 bash 판의 출력 규칙(sysctl → /proc → 빈 출력)을 그대로 따른다.
//   · 외부 명령(sysctl·nproc·awk·find·git·bash)은 모두 아래 runSync/runCmd 를 지난다(spawn, 셸 없이, windowsHide).
// node 18.17 이상, 외부 패키지 없음.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './compat.mjs';
import { CoordDie, Ctx, cfgSub, expand, hasRun, pathInWt, q, repo } from './common.mjs';
import { cliMain, isMain } from './js-cli.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
/** coord_state_call 이 부를 coord-state.sh 위치: 환경 변수 우선, 없으면 이 파일 기준 scripts/ 폴더 */
// common.sh 71줄처럼 환경 변수와 무관하게 lib 폴더 기준이다(bash 판이 정답).
export const scriptsDir = () => join(LIB_DIR, '..');

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const stripNl = (s) => s.replace(/\n+$/, '');

// ---------- 외부 명령(한 곳에 모은다) ----------
/** spawnSync 래퍼: 셸 없이, 인자 배열, windowsHide. {rc, out(Buffer), err(Buffer)}. 명령이 없으면 rc 127.
 *  · EAGAIN(부하 때 node 의 fork 한도)은 50ms 뒤 한 번 더 시도한다.
 *  · 자식이 stdin 을 다 안 읽고 끝나면 input 쓰기가 EPIPE 로 남는다(r.error) — 이때 status·stdout 은 정상이므로 그대로 쓴다.
 *    error 가 스폰 실패(ENOENT 등, status 없음)일 때만 127 로 돌린다. */
export function runSync(cmd, args, { env, cwd, input = '' } = {}) {
  let r = spawnSync(cmd, args, { env: env ?? process.env, cwd, input, maxBuffer: 1 << 28, windowsHide: true });
  if (r.error?.code === 'EAGAIN' && r.status == null) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    r = spawnSync(cmd, args, { env: env ?? process.env, cwd, input, maxBuffer: 1 << 28, windowsHide: true });
  }
  if (r.error && r.status == null && r.signal == null) return { rc: 127, out: Buffer.alloc(0), err: Buffer.from(String(r.error)) };
  return { rc: r.status ?? (r.signal ? 128 : 70), out: Buffer.from(r.stdout ?? Buffer.alloc(0)), err: Buffer.from(r.stderr ?? Buffer.alloc(0)) };
}
/** spawn(비동기) 래퍼: runSync 와 같은 결과. stdout·stderr 를 다 모은 뒤 끝난다. stdin 쓰기 EPIPE 는 무시한다(자식이 일찍 끝난 것). */
export function runCmd(cmd, args, { env, cwd, input = '' } = {}) {
  return new Promise((res) => {
    const ch = spawn(cmd, args, { env: env ?? process.env, cwd, windowsHide: true });
    const so = [], se = [];
    let done = false, spawnErr = null;
    const finish = (rc, sig) => {
      if (done) return;
      done = true;
      if (spawnErr && (rc == null || rc < 0) && sig == null) res({ rc: 127, out: Buffer.alloc(0), err: Buffer.from(String(spawnErr)) });
      else res({ rc: rc == null ? (sig ? 128 : 70) : rc, out: Buffer.concat(so), err: Buffer.concat(se) });
    };
    ch.stdout.on('data', (d) => so.push(d));
    ch.stderr.on('data', (d) => se.push(d));
    ch.stdin.on('error', () => { /* 자식이 stdin 을 다 안 읽고 끝남 */ });
    ch.on('error', (e) => {
      spawnErr = e;
      // 스폰 실패(ENOENT 등)는 close 가 이어져 오지 않을 수 있다 — 틱 하나 뒤에도 close 가 없으면 실패로 끝낸다
      setImmediate(() => finish(ch.exitCode, ch.signalCode));
    });
    ch.on('close', (rc, sig) => finish(rc, sig));
    ch.stdin.end(input);
  });
}

// ---------- 로그·die·실행 ----------
/** coord_log — stderr 한 줄 */
export function coordLog(c, args) { c.log(args.join(' ')); }
/** coord_die — CoordDie 를 던진다(main·CLI 어댑터가 종료 코드로 바꾼다) */
export function coordDie(rc, args) { throw new CoordDie(rc, args.join(' ')); }
/** coord_do — 부작용 명령. COORD_DRY=1 이면 stderr 에 `DRY <인용>` 만, rc 0. 아니면 명령을 실행해 rc·stdout 를 그대로 */
export function coordDo(c, args) {
  if ((c.env.COORD_DRY ?? '0') === '1') { c.log(`DRY ${q(args)}`); return { rc: 0, out: Buffer.alloc(0) }; }
  const r = runSync(args[0] ?? '', args.slice(1), { env: c.env, cwd: c.cwd });
  return { rc: r.rc, out: r.out, err: r.err };
}
/** coord_state_call — 상태 쓰기는 늘 coord-state.sh spawn(stdout 버림). DRY·스크립트 없음·회차 없음은 stderr 알림만 */
export function coordStateCall(c, args) {
  const cs = join(scriptsDir(), 'coord-state.sh');
  if ((c.env.COORD_DRY ?? '0') === '1') { c.log(`DRY coord-state.sh ${q(args)}`); return { rc: 0 }; }
  if (!isFile(cs)) { c.log(`coord-state.sh 없음 — 상태 기록 건너뜀: ${args.join(' ')}`); return { rc: 0 }; }
  if (!hasRun(c)) { c.log(`회차 없음 — 상태 기록 건너뜀: ${args.join(' ')}`); return { rc: 0 }; }
  const r = runSync('bash', [cs, ...args], { env: c.env, cwd: c.cwd });
  return { rc: r.rc, err: r.err };
}
/** coord_git — 설정 .git_bin(기본 git)으로 실행 */
export function coordGit(c, args) {
  const g = cfgSub(c, '.git_bin');
  return runSync(g || 'git', args, { env: c.env, cwd: c.cwd });
}

// ---------- 리포 기본값 ----------
/** coord_default_repo — COORD_REPO 가 없으면 스크립트 폴더의 git common dir 로 채운다(c.env.COORD_REPO 를 바꾼다) */
export function coordDefaultRepo(c) {
  if (c.env.COORD_REPO) return;
  if (repo(c)) return;   // cwd 가 리포면 그대로
  const r = runSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { env: c.env, cwd: scriptsDir() });
  if (r.rc !== 0) return;
  let common = stripNl(r.out.toString('utf8'));
  if (common) { const i = common.lastIndexOf('/'); if (i >= 0) common = common.slice(0, i); if (!common) common = '/'; }
  if (common) c.env.COORD_REPO = common;
}

// ---------- 부하·프로세스 ----------
/** coord_cpus — sysctl → nproc → 1(bash 판 `a || b || c` 그대로: 실패한 명령의 stdout 도 쌓이고, rc 는 마지막 명령의 것) */
export function coordCpus(c) {
  let r = runSync('sysctl', ['-n', 'hw.ncpu'], { env: c.env });
  if (r.rc === 0) return { rc: 0, out: r.out };
  r = runSync('nproc', [], { env: c.env });
  if (r.rc === 0) return { rc: 0, out: r.out };
  return { rc: 0, out: Buffer.concat([r.out, Buffer.from('1\n')]) };
}
/** coord_load1 — sysctl vm.loadavg 두 번째 칸, 아니면 /proc/loadavg 첫 칸(awk spawn), 둘 다 없으면 빈 출력·awk 종료 코드 */
export function coordLoad1(c) {
  const r = runSync('sysctl', ['-n', 'vm.loadavg'], { env: c.env });
  const o = stripNl(r.out.toString('latin1'));
  if (r.rc === 0 && o !== '') {
    // printf '%s\n' "$o" | awk '{print $2}' — 줄마다(빈 칸 줄은 빈 줄)
    const out = `${o}\n`.split('\n').slice(0, -1).map((l) => {
      const f = l.trim() === '' ? [] : l.trim().split(/\s+/);
      return `${f[1] ?? ''}\n`;
    }).join('');
    return { out };
  }
  const a = runSync('awk', ['{print $1}', '/proc/loadavg'], { env: c.env });
  return { rc: a.rc, out: a.out };
}

// ---------- heavy ----------
/** coord_heavy_script — 설정 heavy.script 경로(리포 기준 상대 허용). 없으면 rc 1 */
export function coordHeavyScript(c) {
  let p = cfgSub(c, '.heavy.script');
  if (p === '') return { rc: 1 };
  p = expand(p, c.env);
  if (!C.isAbsPath(p, c.env)) p = `${repo(c) ?? ''}/${p}`;
  if (!isFile(p)) return { rc: 1 };
  return { out: p };
}
/** coord_heavy_run_in_wt — snapshot 글의 RUN 줄(다섯째 칸=cwd)이 워크트리 안이면 rc 0. 탭은 IFS 읽기처럼 연속·앞뒤로 접는다 */
export function coordHeavyRunInWt(c, wt, snap) {
  if (!wt || !snap) return { rc: 1 };
  const lines = `${String(snap)}\n`.split('\n');
  lines.pop();   // 히어독은 $snap 뒤에 줄바꿈을 하나 보태 읽는다(끝 줄바꿈 없는 마지막 줄도 읽힌다)
  for (const line of lines) {
    const cols = line.replace(/^\t+/, '').replace(/\t+$/, '').split(/\t+/);   // IFS 탭 읽기: 연속 탭은 하나로, 앞뒤 탭은 뗀다
    if (cols[0] === 'RUN' && pathInWt(c, cols[4] ?? '', wt)) return { rc: 0 };
  }
  return { rc: 1 };
}
/** coord_wt_procs — 워크트리를 cwd 로 둔 빌드·시험 프로세스(`pid\t이름` 줄). awk 규칙을 그대로 */
export function coordWtProcs(c, wt) {
  if (!wt) return { out: '' };
  const RE_AWK = /^([^ ]*\/)?awk /;
  const RE_BOOT = /bootRun|be\.run\.module|GradleDaemon/;
  const cand = [];
  for (const line of C.psPidArgs(c.env).toString('latin1').split('\n')) {
    if (line === '') continue;
    const a = line.replace(/^ *[0-9]+ +/, '');
    if (RE_AWK.test(a) || RE_BOOT.test(a)) continue;
    let n = '';
    if (/GradleWrapperMain/.test(a)) n = 'GradleWrapperMain';
    if (n === '' && /(^|[/ ])gradlew?( |$)|org\.gradle\.launcher\.GradleMain/.test(a)) n = 'gradle';
    if (n === '' && /vitest/.test(a)) n = 'vitest';
    if (n === '' && /playwright/.test(a) && !/mcp/.test(a)) n = 'playwright';
    if (n === '' && /(^|[/ ])tsc( |$)|typescript\/bin\/tsc/.test(a)) n = 'tsc';
    if (n !== '') { const m = /^\s*(\S+)/.exec(line); if (m) cand.push([m[1], n]); }
  }
  if (cand.length === 0) return { out: '' };
  const pids = cand.map(([p]) => p).join(',');
  let out = '';
  for (const line of C.procCwds(pids, c.env).toString('latin1').split('\n')) {
    if (line === '') continue;
    const cols = line.replace(/^\t+/, '').replace(/\t+$/, '').split('\t');
    if (!pathInWt(c, cols[1] ?? '', wt)) continue;
    for (const [p, n] of cand) if (p === cols[0]) out += `${p}\t${n}\n`;
  }
  return { out };
}
/** coord_bg_signals — 레인 백그라운드 신호(heavy·tasks·프로세스 이름 콤마 목록). 출력은 끝 줄바꿈 없음 */
export function coordBgSignals(c, wt, sid = '', snap = '') {
  let out = '';
  if (coordHeavyRunInWt(c, wt, snap).rc === 0) out = 'heavy';
  let root = cfgSub(c, '.tasks_root');
  if (root !== '' && sid !== '' && sid !== 'null') {
    root = expand(root, c.env);
    const mins = cfgSub(c, '.idle.bg_recent_min');
    // bash 글롭 "$root"/*/"$sid"/tasks — 뿌리의 점 이름은 빼고, 실제 있는 경로만 펼친다(없으면 글자 그대로 find 에)
    let paths = [];
    try {
      for (const name of readdirSync(root)) {
        if (name.startsWith('.')) continue;
        const p = `${root}/${name}/${sid}/tasks`;
        try { statSync(p); paths.push(p); } catch { /* 없음 */ }
      }
    } catch { /* 뿌리 없음 */ }
    if (paths.length === 0) paths = [`${root}/*/${sid}/tasks`];
    const r = runSync('find', [...paths, '-maxdepth', '1', '-name', '*.output', '-mmin', `-${mins || 10}`], { env: c.env });
    if (stripNl(r.out.toString('latin1')) !== '') out = out ? `${out},tasks` : 'tasks';
  }
  const names = [];
  for (const line of stripNl(coordWtProcs(c, wt).out.toString('latin1')).split('\n')) {
    if (line === '') continue;
    const f = line.split('\t')[1];
    if (f !== undefined && !names.includes(f)) names.push(f);
  }
  if (names.length) out = out ? `${out},${names.join(',')}` : names.join(',');
  return { out };
}

// ---------- 얇은 보조 ----------
/** coord_read1 — 파일 첫 줄(\r 은 유지). 없으면 빈 값 */
export function coordRead1(file) {
  let s;
  try { s = readFileSync(file, 'utf8'); } catch { return ''; }
  const i = s.indexOf('\n');
  return i < 0 ? s : s.slice(0, i);
}
/** coord_mkdirp — 이미 있으면 프로세스 없이 rc 0 */
export function coordMkdirp(p) {
  if (isDir(p)) return { rc: 0 };
  try { mkdirSync(p, { recursive: true }); return { rc: 0 }; } catch { return { rc: 1 }; }
}

// ---------- CLI (bash 함수 이름 그대로) ----------
const mkc = (e, cwd) => new Ctx(e, cwd);
/** die 를 종료 코드 + _JSB_DIE 전역으로 알리는 어댑터(common.mjs 와 같은 방식) */
function dieable(fn) {
  return {
    stdin: fn.stdin,
    run: (x) => {
      const c = mkc(x.env, x.cwd);
      try { const r = fn.run(c, x) || {}; return { ...r, err: c.err + (r.err ?? '') }; } catch (e) {
        if (e instanceof CoordDie) return { rc: e.rc, err: `${c.err}${e.message}\n`, globals: { _JSB_DIE: '1' } };
        throw e;
      }
    },
  };
}
const plain = (fn) => ({ stdin: fn.stdin, run: (x) => { const c = mkc(x.env, x.cwd); const r = fn.run(c, x) || {}; return { ...r, err: c.err + (r.err ?? '') }; } });

export const functions = {
  coord_log: plain({ run: (c, { args }) => { coordLog(c, args); return {}; } }),
  coord_die: dieable({ run: (_c, { args }) => { const rc = Number.parseInt(args[0] ?? '', 10); coordDie(Number.isNaN(rc) ? 255 : rc, args.slice(1)); } }),
  coord_do: plain({ run: (c, { args }) => coordDo(c, args) }),
  coord_state_call: plain({ run: (c, { args }) => coordStateCall(c, args) }),
  coord_git: plain({ run: (c, { args }) => coordGit(c, args) }),
  coord_default_repo: plain({
    run: (c) => { coordDefaultRepo(c); return { globals: { COORD_REPO: c.env.COORD_REPO ?? '' } }; },
  }),
  coord_cpus: plain({ run: (c) => coordCpus(c) }),
  coord_load1: plain({ run: (c) => coordLoad1(c) }),
  coord_heavy_script: plain({ run: (c) => coordHeavyScript(c) }),
  coord_heavy_run_in_wt: plain({ run: (c, { args }) => coordHeavyRunInWt(c, args[0] ?? '', args[1] ?? '') }),
  coord_wt_procs: plain({ run: (c, { args }) => coordWtProcs(c, args[0] ?? '') }),
  coord_bg_signals: plain({ run: (c, { args }) => coordBgSignals(c, args[0] ?? '', args[1] ?? '', args[2] ?? '') }),
  coord_read1: plain({
    run: (_c, { args }) => ({ globals: { [args[0] ?? 'V']: coordRead1(args[1] ?? '') } }),
  }),
  coord_mkdirp: plain({ run: (_c, { args }) => coordMkdirp(args[0] ?? '') }),
};
if (isMain(import.meta.url)) cliMain(functions);
