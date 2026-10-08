// compat.sh 의 node 판. 이 파일은 common.mjs 가 필요로 하는 함수까지만 준비 단계에서 만들어 두었고,
// 나머지(프로세스 표·후손·kill·pgrep·sha256 등)는 W1-a 레인이 같은 파일에 더한다. 이미 있는 함수의 동작·시그니처는 바꾸지 않는다.
// 계약: tests/js-parity/README.md. 환경 변수는 env 인자로 받는다(전역을 직접 읽지 않는다).
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
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
/** strftime 의 자주 쓰는 지시자만. 모르는 지시자는 그대로 둔다(date 도 알 수 없는 것은 글자로 낸다). TZ 는 환경(process.env.TZ)을 따른다. */
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
  return fmt.replace(/%(.)/g, (all, c) => (map[c] ? map[c]() : all));
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
/** /proc 스캔(윈도우 Git Bash) 또는 ps. 줄마다 `pid args`(ppid 없음) */
export function psPidArgs(env = process.env) {
  if (isWin(env)) {
    const root = env.COMPAT_PROC_ROOT || '/proc';
    let names = [];
    try { names = readdirSync(root).filter((n) => /^[0-9]/.test(n)); } catch { return ''; }
    const out = [];
    for (const n of names) {
      let pp;
      try { pp = readFileSync(join(root, n, 'ppid'), 'utf8').split('\n')[0]; } catch { continue; }
      if (!/^[0-9]+$/.test(pp)) continue;
      let a = '';
      try { for (const w of readFileSync(join(root, n, 'cmdline'), 'latin1').split('\0')) if (w !== '') a += ` ${w.replace(/\n/g, ' ')}`; } catch { /* 빈 인자 */ }
      out.push(`${n}${a}`);
    }
    return out.map((l) => `${l}\n`).join('');
  }
  const r = spawnSync('ps', ['-axo', 'pid=,args='], { env, encoding: 'latin1', windowsHide: true });
  return r.status === 0 ? r.stdout : '';
}
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
  compat_epoch_fmt: { run: ({ args }) => { const v = formatEpoch(args[0], args[1] ?? '', args[2] === '-u'); return v == null ? { rc: 1 } : { out: v + '\n' }; } },
  compat_is_abs_path: { run: ({ args, env }) => ({ rc: isAbsPath(args[0], env) ? 0 : 1 }) },
  compat_norm_path: { run: ({ args, env }) => ({ out: normPath(args[0] ?? '', env) }) },
  compat_posix_path: { run: ({ args, env }) => ({ out: posixPath(args[0] ?? '', env) }) },
  compat_native_path: { run: ({ args, env }) => ({ out: nativePath(args[0] ?? '', env) }) },
  compat_pid_cwd: { run: ({ args, env }) => { const c = pidCwd(args[0], env); return { out: c ? c + '\n' : '' }; } },
  compat_proc_cwds: { run: ({ args, env }) => ({ out: procCwds(args[0] ?? '', env) }) },
  compat_pid_alive: { run: ({ args, env }) => ({ rc: pidAlive(args[0], env) ? 0 : 1 }) },
  compat_ps_pidargs: { run: ({ env }) => ({ out: nl(psPidArgs(env)) }) },
};
if (isMain(import.meta.url)) cliMain(functions);
