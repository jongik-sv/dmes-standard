// compat.sh 의 node 판. 이 파일은 common.mjs 가 필요로 하는 함수까지만 준비 단계에서 만들어 두었고,
// 나머지(프로세스 표·후손·kill·pgrep·sha256 등)는 W1-a 레인이 같은 파일에 더한다. 이미 있는 함수의 동작·시그니처는 바꾸지 않는다.
// 계약: tests/js-parity/README.md. 환경 변수는 env 인자로 받는다(전역을 직접 읽지 않는다).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { cliMain, isMain } from './js-cli.mjs';

// ---------- 플랫폼 판별 (compat.sh 머리의 COMPAT_WIN·COMPAT_GNU) ----------
export function isWin(env = process.env) {
  if (env.COMPAT_FORCE_OS === 'windows') return true;
  if (env.COMPAT_FORCE_OS === 'unix') return false;
  return /^(msys|cygwin|mingw)/.test(env.OSTYPE || '') || process.platform === 'win32';
}
/** GNU coreutils 인가. macOS 는 PATH 의 첫 stat 이 /usr/bin/stat 이면 BSD, 아니면 stat -c 가 되는지 본다. */
export function isGnu(env = process.env) {
  if (env.COMPAT_FORCE_USERLAND === 'gnu') return true;
  if (env.COMPAT_FORCE_USERLAND === 'bsd') return false;
  if (process.platform !== 'darwin') return true;
  const first = whichSync('stat', env);
  if (first === '/usr/bin/stat') return false;
  return spawnSync('stat', ['-c', '%Y', '/'], { env, stdio: 'ignore' }).status === 0;
}
export function whichSync(name, env = process.env) {
  for (const d of (env.PATH || '').split(delimiter)) {
    if (!d) continue;
    const p = join(d, name);
    try { if (statSync(p).isFile()) return p; } catch { /* 없음 */ }
  }
  return '';
}

// ---------- stat ----------
export function statMtime(file) { try { return String(Math.floor(statSync(file).mtimeMs / 1000)); } catch { return null; } }
export function statMode(file) { try { return (statSync(file).mode & 0o7777).toString(8); } catch { return null; } }
/** `<소유 uid> <8진 권한> <mtime> <크기>` — 못 읽으면 null */
export function statInfo(file) {
  try {
    const st = statSync(file);
    return `${st.uid} ${(st.mode & 0o7777).toString(8)} ${Math.floor(st.mtimeMs / 1000)} ${st.size}`;
  } catch { return null; }
}

// ---------- 날짜 (compat_epoch_fmt: date -d @e / date -r e 의 +형식) ----------
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const p2 = (n) => String(n).padStart(2, '0');
/** strftime 의 자주 쓰는 지시자만. TZ 는 환경(process.env.TZ)을 따른다.
 * 실제 쓰이는 지시자(Y m d H M S z + s Z 등)는 직접 계산하고, 목록 밖 지시자가 형식에 있으면 null(호출 쪽이 rc 1 + 빈 출력).
 * epoch 가 정규형(0|[1-9][0-9]{0,10})이 아니면 실제 date 를 불러 BSD 8진수·실패 코드를 같게 한다(common.mjs epochFmt 와 같다). */
export function formatEpoch(epoch, fmt, utc = false) {
  const d = new Date(Number(epoch) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const g = utc
    ? { Y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), H: d.getUTCHours(), M: d.getUTCMinutes(), S: d.getUTCSeconds(), w: d.getUTCDay(), off: 0 }
    : { Y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), H: d.getHours(), M: d.getMinutes(), S: d.getSeconds(), w: d.getDay(), off: -d.getTimezoneOffset() };
  const doy = () => Math.round((Date.UTC(g.Y, g.m, g.d) - Date.UTC(g.Y, 0, 1)) / 86400000) + 1;
  const zone = () => { const o = Math.abs(g.off); return `${g.off < 0 ? '-' : '+'}${p2(Math.floor(o / 60))}${p2(o % 60)}`; };
  const map = {
    Y: () => String(g.Y), y: () => p2(g.Y % 100), m: () => p2(g.m + 1), d: () => p2(g.d), e: () => String(g.d).padStart(2, ' '),
    H: () => p2(g.H), M: () => p2(g.M), S: () => p2(g.S), I: () => p2(g.H % 12 || 12), p: () => (g.H < 12 ? 'AM' : 'PM'),
    j: () => String(doy()).padStart(3, '0'), a: () => DAYS[g.w].slice(0, 3), A: () => DAYS[g.w], b: () => MONTHS[g.m].slice(0, 3), B: () => MONTHS[g.m],
    z: zone, Z: () => (utc ? 'UTC' : (process.env.TZ === 'UTC' ? 'UTC' : zone())), s: () => String(Math.floor(Number(epoch))),
    F: () => `${g.Y}-${p2(g.m + 1)}-${p2(g.d)}`, T: () => `${p2(g.H)}:${p2(g.M)}:${p2(g.S)}`, R: () => `${p2(g.H)}:${p2(g.M)}`,
    D: () => `${p2(g.m + 1)}/${p2(g.d)}/${p2(g.Y % 100)}`, n: () => '\n', t: () => '\t', '%': () => '%',
  };
  let unknown = false;
  const out = fmt.replace(/%(.)/g, (all, c) => {
    if (!map[c]) { unknown = true; return all; }
    return map[c]();
  });
  if (unknown) return null;
  return out;
}

/** compat_epoch_fmt 본체. 실제 쓰이는 지시자 집합 밖(위 map 밖)은 rc 1相当 null.
 * 정규형 epoch 가 아니면 실제 date 를 불러 BSD date 의 8진수·실패(rc 1·빈 출력)를 같게 한다. */
export function epochFmt(epoch, fmt, utc = false, env = process.env) {
  if (!/^(0|[1-9][0-9]{0,10})$/.test(epoch ?? '')) {
    const args = isGnu(env)
      ? [...(utc ? ['-u'] : []), '-d', `@${epoch}`, `+${fmt}`]
      : [...(utc ? ['-u'] : []), '-r', String(epoch), `+${fmt}`];
    const r = spawnSync('date', args, { env, encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) return null;
    return (r.stdout ?? '').replace(/\n$/, '');
  }
  return formatEpoch(epoch, fmt, utc);
}

/** compat_touch_ago <초> <파일>. mtime 을 <초> 전으로. 성공 0, 실패 1 */
export function touchAgoFn(secs, file, env = process.env) {
  if (!/^[0-9]+$/.test(secs ?? '') || !file) return 1;
  const now = nowSec();
  const e = now - Number(secs);
  const s = epochFmt(String(e), '%Y%m%d%H%M.%S', false, { ...env, TZ: 'UTC' });
  if (s == null || s === '') return 1;
  try {
    try { utimesSync(file, e, e); }
    catch (err) {
      if (err && err.code === 'ENOENT') {
        const d = dirname(file);
        if (d && d !== '.') { try { mkdirSync(d, { recursive: true }); } catch { /* 무시 */ } }
        writeFileSync(file, '');
        utimesSync(file, e, e);
      } else throw err;
    }
    return 0;
  } catch { return 1; }
}

/** compat_sha256: stdin 바이트 → 소문자 hex 64자 한 줄. 성공 {out}, 실패 null */
export function sha256Hex(buf) {
  try { return createHash('sha256').update(buf).digest('hex'); }
  catch { return null; }
}

// ---------- 경로 ----------
export function isAbsPath(p, env = process.env) {
  p = p ?? '';
  if (p.startsWith('/')) return true;
  if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')) return isWin(env);
  return false;
}
/** compat_norm_path: 비교용 정규형(윈도우만 변환·소문자·끝 / 제거). 그 밖의 OS 는 그대로. */
export function normPath(p, env = process.env) {
  if (!isWin(env)) return p;
  p = p.replace(/\\/g, '/');
  if (/^\/cygdrive\/[A-Za-z](\/|$)/.test(p)) p = p.slice('/cygdrive'.length);
  else if (/^[A-Za-z]:(\/|$)/.test(p)) p = `/${p[0]}${p.slice(2)}`;
  p = p.toLowerCase();
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}
function cygpath(flag, p, env) {
  if (!isWin(env) || !whichSync('cygpath', env)) return p;
  const r = spawnSync('cygpath', [flag, p], { env, encoding: 'utf8', windowsHide: true });
  return r.status === 0 && r.stdout.replace(/\n$/, '') ? r.stdout.replace(/\n$/, '') : p;
}
export const posixPath = (p, env = process.env) => cygpath('-u', p, env);
export const nativePath = (p, env = process.env) => cygpath('-m', p, env);

// ---------- 프로세스 ----------
/** bash glob("$root"/[0-9]*) 순서와 같게(바이트 순서). readdirSync 순서는 파일시스템마다 달라 정렬한다. */
function procNames(root) {
  let names;
  try { names = readdirSync(root).filter((n) => /^[0-9]/.test(n)); } catch { return null; }
  names.sort();
  return names;
}
/** /proc/<pid>/cmdline → ` arg1 arg2…`(인자 속 줄바꿈은 공백). bash while-read 본문과 같다. */
function procArgs(root, n) {
  let buf;
  try { buf = readFileSync(join(root, n, 'cmdline')); } catch { return ''; }
  if (buf.length === 0) return '';
  const parts = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) { parts.push(buf.subarray(start, i).toString('latin1')); start = i + 1; }
  }
  if (start < buf.length) parts.push(buf.subarray(start).toString('latin1'));
  else if (start === buf.length) { /* 끝 NUL 뒤는 읽지 않는다 */ }
  let a = '';
  for (const w of parts) a += ` ${w.replace(/\n/g, ' ')}`;
  return a;
}
function procPpid(root, n) {
  let pp;
  try { pp = readFileSync(join(root, n, 'ppid'), 'utf8').split('\n')[0]; } catch { return null; }
  if (!/^[0-9]+$/.test(pp)) return null;
  return pp;
}
/** /proc 스캔(윈도우 Git Bash) 또는 ps. 줄마다 `pid args`(ppid 없음) */
export function psPidArgs(env = process.env) {
  if (isWin(env)) {
    const root = env.COMPAT_PROC_ROOT || '/proc';
    const names = procNames(root);
    if (!names) return '';
    const out = [];
    for (const n of names) {
      const pp = procPpid(root, n);
      if (pp == null) continue;
      out.push(`${n}${procArgs(root, n)}`);
    }
    return out.map((l) => `${l}\n`).join('');
  }
  const r = spawnSync('ps', ['-axo', 'pid=,args='], { env, encoding: 'latin1', windowsHide: true });
  return r.status === 0 ? r.stdout : '';
}
/** 한 줄에 `pid ppid args` */
export function psTable(env = process.env) {
  if (isWin(env)) {
    const root = env.COMPAT_PROC_ROOT || '/proc';
    const names = procNames(root);
    if (!names) return '';
    const out = [];
    for (const n of names) {
      const pp = procPpid(root, n);
      if (pp == null) continue;
      out.push(`${n} ${pp}${procArgs(root, n)}`);
    }
    return out.map((l) => `${l}\n`).join('');
  }
  const r = spawnSync('ps', ['-axo', 'pid=,ppid=,args='], { env, encoding: 'latin1', windowsHide: true });
  return r.status === 0 ? r.stdout : '';
}
/** 한 줄에 `pid ppid` */
export function psPairs(env = process.env) {
  if (isWin(env)) {
    const root = env.COMPAT_PROC_ROOT || '/proc';
    const names = procNames(root);
    if (!names) return '';
    const out = [];
    for (const n of names) {
      const pp = procPpid(root, n);
      if (pp == null) continue;
      out.push(`${n} ${pp}`);
    }
    return out.map((l) => `${l}\n`).join('');
  }
  const r = spawnSync('ps', ['-axo', 'pid=,ppid='], { env, encoding: 'latin1', windowsHide: true });
  return r.status === 0 ? r.stdout : '';
}
/** 후손 pid(깊은 쪽부터, 자기 자신 제외). compat_descendants */
export function descendants(rootPid, env = process.env) {
  if (!rootPid) return '';
  const text = psPairs(env);
  const kids = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const toks = line.trim().split(/\s+/);
    const pid = toks[0], ppid = toks[1] ?? '';
    if (!/^[0-9]+$/.test(pid)) continue;
    if (!kids.has(ppid)) kids.set(ppid, []);
    kids.get(ppid).push(pid);
  }
  const out = [];
  const walk = (p) => {
    for (const c of kids.get(String(p)) || []) { walk(c); out.push(c); }
  };
  walk(String(rootPid));
  return out.map((p) => `${p}\n`).join('');
}
/** 신호를 보내도 되는 pid 인가(2 이상의 정수만 — bash _compat_pid_ok 와 같은 문자열 판정) */
export function pidOk(pid) {
  const s = pid ?? '';
  if (s === '' || s === '0' || s === '1') return false;
  if (!/^[0-9]+$/.test(s)) return false;
  return true;
}
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
/** 프로세스 그룹 전체에 KILL. 항상 rc 0 */
export function killPgroup(pgid, env = process.env) {
  if (!pidOk(pgid ?? '')) return 0;
  const n = Number(pgid);
  try { process.kill(-n, 'SIGKILL'); } catch { /* 없음·권한 없음 무시 */ }
  return 0;
}
/** 프로세스 그룹 생존. 0/1 */
export function pgroupAlive(pgid, env = process.env) {
  if (!pidOk(pgid ?? '')) return false;
  const n = Number(pgid);
  try { process.kill(-n, 0); return true; } catch { return false; }
}
/** 후손부터 TERM → 0.3초 → 남은 것 KILL. 항상 rc 0 */
export function killTree(rootPid, env = process.env) {
  if (!rootPid) return 0;
  const desc = descendants(rootPid, env).split('\n').filter((s) => s !== '');
  const all = [...desc, String(rootPid)];
  for (const p of all) {
    if (!pidOk(p)) continue;
    try { process.kill(Number(p), 'SIGTERM'); } catch { /* 무시 */ }
  }
  sleepMs(300);
  for (const p of all) {
    if (!pidOk(p)) continue;
    let alive = false;
    try { process.kill(Number(p), 0); alive = true; } catch { alive = false; }
    if (!alive) continue;
    try { process.kill(Number(p), 'SIGKILL'); } catch { /* 무시 */ }
    if (isWin(env)) {
      try { process.kill(Number(p), 0); alive = true; } catch { alive = false; }
      if (alive) spawnSync('/usr/bin/kill', ['-f', String(p)], { env, stdio: 'ignore', windowsHide: true });
    }
  }
  return 0;
}
function callerPid(env) { return env.COORD_JS_CALLER_PID || String(process.ppid); }
/** 후보 판정 공용 본체. mode f=정규식, s=고정 문자열. 호출 셸과 그 복제를 뺀다.
 * JS 판은 패턴을 node 인자로 받으므로(node 자신의 명령줄이 패턴에 맞는다) 자기 자신(process.pid)도 뺀다.
 * bash 판이 패턴을 환경 변수로 넘겨 awk 자신을 피하는 것과 같다. */
export function pgrep(mode, pat, env = process.env) {
  if (!pat) return '';
  const table = psTable(env);
  const me = callerPid(env);
  const self = String(process.pid);
  const rows = [];
  let mine = '';
  for (const line of table.split('\n')) {
    if (!line.trim()) continue;
    const m = /^\s*([0-9]+)\s+[0-9]+\s?([\s\S]*)$/.exec(line);
    if (!m) continue;
    const pid = m[1], args = m[2] ?? '';
    rows.push([pid, args]);
    if (pid === String(me)) mine = args;
  }
  let re = null;
  if (mode === 'f') {
    try { re = new RegExp(pat); } catch { return ''; }
  }
  const out = [];
  for (const [pid, args] of rows) {
    if (pid === String(me) || pid === self) continue;
    if (mine !== '' && args === mine) continue;
    const hit = mode === 's' ? args.includes(pat) : re.test(args);
    if (hit) out.push(pid);
  }
  return out.map((p) => `${p}\n`).join('');
}
export const pgrepF = (pat, env = process.env) => pgrep('f', pat ?? '', env);
export const pgrepS = (pat, env = process.env) => pgrep('s', pat ?? '', env);
/** 위 pid 에 TERM. 항상 rc 0 */
export function pkill(mode, pat, env = process.env) {
  const list = pgrep(mode, pat ?? '', env).split('\n').filter((s) => s !== '');
  for (const p of list) {
    if (!pidOk(p)) continue;
    try { process.kill(Number(p), 'SIGTERM'); } catch { /* 무시 */ }
  }
  return 0;
}
/** sc_now_ms 와 같은 초 정밀 지금 시각 */
function nowSec() { return Math.floor(Date.now() / 1000); }
export function pidCwd(pid, env = process.env) {
  if (!pid) return '';
  const root = env.COMPAT_PROC_ROOT || '/proc';
  const link = join(root, String(pid), 'cwd');
  let c = '';
  try { lstatSync(link); c = readlinkSync(link); } catch {
    if (whichSync('lsof', env)) {
      const r = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { env, encoding: 'utf8', windowsHide: true });
      const m = /^n(.*)$/m.exec(r.stdout || '');
      c = m ? m[1] : '';
    }
  }
  return c;
}
/** pid 콤마 목록 → 줄마다 `<pid>\t<cwd>` */
export function procCwds(list, env = process.env) {
  if (!list) return '';
  const root = env.COMPAT_PROC_ROOT || '/proc';
  if (!existsSync(join(root, 'self', 'cwd')) && whichSync('lsof', env)) {
    const r = spawnSync('lsof', ['-a', '-d', 'cwd', '-p', list, '-Fpn'], { env, encoding: 'utf8', windowsHide: true });
    let p = '', out = '';
    for (const line of (r.stdout || '').split('\n')) {
      if (line.startsWith('p')) p = line.slice(1);
      else if (line.startsWith('n')) out += `${p}\t${line.slice(1)}\n`;
    }
    return out;
  }
  let out = '';
  for (const p of list.split(',')) { const c = pidCwd(p, env); if (c) out += `${p}\t${c}\n`; }
  return out;
}
/** compat_pid_alive: kill -0 이 되면 살아 있음. 윈도우(Git Bash)는 ps -W 의 WINPID 열도 본다. */
export function pidAlive(pid, env = process.env) {
  if (!pid || pid === '0' || pid === 'null') return false;
  const n = Number(pid);
  if (Number.isInteger(n) && n > 0) {
    try { process.kill(n, 0); return true; } catch { /* 아래 */ }
  }
  if (!isWin(env)) return false;
  const r = spawnSync('ps', ['-W'], { env, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return false;
  const lines = r.stdout.split('\n');
  const hdr = lines[0].trim().split(/\s+/);
  const col = hdr.indexOf('WINPID');
  if (col < 0) return false;
  return lines.slice(1).some((l) => l.trim().split(/\s+/)[col] === String(pid));
}

// ---------- CLI (bash 함수 이름 그대로) ----------
const nl = (s) => (s == null ? '' : s);
export const functions = {
  compat_stat_mtime: { run: ({ args }) => { const v = statMtime(args[0]); return v == null ? { rc: 1 } : { out: v + '\n' }; } },
  compat_stat_mode: { run: ({ args }) => { const v = statMode(args[0]); return v == null ? { rc: 1 } : { out: v + '\n' }; } },
  compat_stat_info: { run: ({ args }) => { const v = statInfo(args[0]); return v == null ? { rc: 1 } : { out: v }; } },
  compat_epoch_fmt: { run: ({ args, env }) => { const v = epochFmt(args[0] ?? '', args[1] ?? '', args[2] === '-u', env); return v == null ? { rc: 1 } : { out: v + '\n' }; } },
  compat_touch_ago: { run: ({ args, env }) => ({ rc: touchAgoFn(args[0] ?? '', args[1] ?? '', env) }) },
  compat_ps_table: { run: ({ env }) => ({ out: nl(psTable(env)) }) },
  compat_ps_pairs: { run: ({ env }) => ({ out: nl(psPairs(env)) }) },
  compat_is_abs_path: { run: ({ args, env }) => ({ rc: isAbsPath(args[0], env) ? 0 : 1 }) },
  compat_norm_path: { run: ({ args, env }) => ({ out: normPath(args[0] ?? '', env) }) },
  compat_posix_path: { run: ({ args, env }) => ({ out: posixPath(args[0] ?? '', env) }) },
  compat_native_path: { run: ({ args, env }) => ({ out: nativePath(args[0] ?? '', env) }) },
  compat_pid_cwd: { run: ({ args, env }) => { const c = pidCwd(args[0], env); return { out: c ? c + '\n' : '' }; } },
  compat_proc_cwds: { run: ({ args, env }) => ({ out: procCwds(args[0] ?? '', env) }) },
  compat_pid_alive: { run: ({ args, env }) => ({ rc: pidAlive(args[0], env) ? 0 : 1 }) },
  compat_ps_pidargs: { run: ({ env }) => ({ out: nl(psPidArgs(env)) }) },
  compat_descendants: { run: ({ args, env }) => ({ out: nl(descendants(args[0] ?? '', env)) }) },
  compat_kill_pgroup: { run: ({ args, env }) => ({ rc: killPgroup(args[0] ?? '', env) }) },
  compat_pgroup_alive: { run: ({ args, env }) => ({ rc: pgroupAlive(args[0] ?? '', env) ? 0 : 1 }) },
  compat_kill_tree: { run: ({ args, env }) => ({ rc: killTree(args[0] ?? '', env) }) },
  compat_pgrep_f: { run: ({ args, env }) => ({ out: nl(pgrepF(args[0] ?? '', env)) }) },
  compat_pgrep_s: { run: ({ args, env }) => ({ out: nl(pgrepS(args[0] ?? '', env)) }) },
  compat_pkill_f: { run: ({ args, env }) => ({ rc: pkill('f', args[0] ?? '', env) }) },
  compat_pkill_s: { run: ({ args, env }) => ({ rc: pkill('s', args[0] ?? '', env) }) },
  compat_sha256: { stdin: true, run: ({ stdin }) => { const h = sha256Hex(stdin ?? Buffer.alloc(0)); return h == null ? { rc: 1 } : { out: h + '\n' }; } },
};
if (isMain(import.meta.url)) cliMain(functions);
