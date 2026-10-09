#!/usr/bin/env node
// /dflow-team 입장 제어 — 새 팀원을 띄우기 직전에 PC 여유 자원을 본다. (옛 capacity.sh 를 node 로 옮긴 것.)
// 사용: capacity.mjs [--state <파일>] | capacity.mjs max | capacity.mjs usage --live <n> [--state <파일>]
// 출력 한 줄(stdout): CAPACITY_OK|CAPACITY_LOW|CAPACITY_UNKNOWN … · TEAM_MAX … · CAPACITY_USAGE_OK|CAPACITY_USAGE_CAP|CAPACITY_USAGE_STOP|CAPACITY_USAGE_UNKNOWN …
// 종료 코드: 0(통과·판정불가) · 1(막음) · 2(사용 오류)
// node 18.17 이상, 외부 패키지 없음.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = '사용법: capacity.mjs [--state <파일>] | capacity.mjs max | capacity.mjs usage --live <n> [--state <파일>]';
const HELP = '입장 제어 — 새 팀원을 띄우기 직전에 PC 여유 자원을 본다.\n'
  + USAGE + '\n'
  + '출력 한 줄(stdout): CAPACITY_OK|CAPACITY_LOW|CAPACITY_UNKNOWN … · TEAM_MAX … · CAPACITY_USAGE_OK|CAPACITY_USAGE_CAP|CAPACITY_USAGE_STOP|CAPACITY_USAGE_UNKNOWN …\n'
  + '종료 코드: 0(통과·판정불가) · 1(막음) · 2(사용 오류)\n';

const isnum = (s) => s !== undefined && s !== null && String(s) !== '' && /^[0-9.]+$/.test(String(s));
const isint = (s) => s !== undefined && s !== null && String(s) !== '' && /^[0-9]+$/.test(String(s));

function pct(a, b) {
  const x = Number(a); const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || y <= 0) return null;
  return String(Math.floor((x * 100) / y + 0.5));
}

function runOut(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
    if (r.error || r.status !== 0) return null;
    const s = (r.stdout ?? '').trim();
    return s === '' ? '' : s;
  } catch { return null; }
}

const WIN32 = process.platform === 'win32';

function sysctl(key) {
  if (WIN32) return null;
  const v = runOut('sysctl', ['-n', key]);
  return v === null || v === '' ? null : v;
}

function ncpu(env) {
  let n = env.DFLOW_CAP_NCPU ?? '';
  if (n === '') {
    if (!WIN32) {
      n = runOut('getconf', ['_NPROCESSORS_ONLN']) ?? '';
      if (n === '') n = sysctl('hw.ncpu') ?? '';
      if (n === '') n = runOut('nproc', []) ?? '';
    }
    if (n === '') {
      try { const c = os.cpus().length; if (c > 0) n = String(c); } catch { /* 없음 */ }
    }
  }
  return isnum(n) && Number(n) > 0 ? String(n) : null;
}

function ramGb(proc) {
  if (!WIN32) {
    const b = sysctl('hw.memsize');
    if (b !== null && isint(b)) return String(Math.floor((Number(b) + 536870912) / 1073741824));
    try {
      const t = fs.readFileSync(path.join(proc, 'meminfo'), 'utf8');
      const m = /^MemTotal:\s*(\S+)/m.exec(t);
      if (m && isint(m[1])) return String(Math.floor((Number(m[1]) + 524288) / 1048576));
    } catch { /* 없음 */ }
  }
  try {
    const t = os.totalmem();
    if (t > 0) return String(Math.floor((t + 536870912) / 1073741824));
  } catch { /* 없음 */ }
  return null;
}

function detectOs(env) {
  if (env.DFLOW_CAP_OS) return env.DFLOW_CAP_OS;
  if (env.COMPAT_FORCE_OS === 'windows') return 'windows';
  if (WIN32) return 'windows';
  const u = runOut('uname', ['-s']);
  if (u) return u;
  return 'unknown';
}

function bandOf(line, mapUnknown) {
  const w = line.split(' ', 1)[0] ?? '';
  return mapUnknown && w === 'CAPACITY_USAGE_UNKNOWN' ? 'CAPACITY_USAGE_OK' : w;
}

// --state 공통: 지난 줄의 첫 낱말과 이번 첫 낱말을 띠로 바꿔 비교해 notify 를 붙이고 이번 줄을 파일에 적는다.
function withNotify(line, mapUnknown, defPrev, stateFile) {
  let prevRaw = '';
  try {
    const first = String(fs.readFileSync(stateFile, 'utf8').split('\n')[0] ?? '');
    const m = /^[0-9]* ([A-Z_]*)/.exec(first);
    if (m) prevRaw = m[1];
  } catch { /* 없음 */ }
  const prev = (prevRaw !== '' ? prevRaw : defPrev);
  const prevBand = mapUnknown && prev === 'CAPACITY_USAGE_UNKNOWN' ? 'CAPACITY_USAGE_OK' : prev;
  const curBand = bandOf(line, mapUnknown);
  let out = line + (prevBand === curBand ? ' notify=0' : ' notify=1');
  try {
    fs.writeFileSync(stateFile, `${Math.floor(Date.now() / 1000)} ${out}\n`, 'utf8');
  } catch { out += ' state_write_failed'; }
  return out;
}

function heavyBin(env) {
  if (env.DFLOW_HEAVY_BIN) return env.DFLOW_HEAVY_BIN;
  // 논리 경로(process.argv[1] 기준) 먼저, 그 다음 물리 경로(import.meta.url 기준)
  const roots = [];
  try {
    if (process.argv[1]) roots.push(path.resolve(path.dirname(process.argv[1]), '..', '..'));
  } catch { /* 없음 */ }
  try {
    const real = fs.realpathSync(path.resolve(HERE, '..', '..'));
    if (!roots.includes(real)) roots.push(real);
  } catch { /* 없음 */ }
  // 전이 기간: heavy.mjs(정본) 우선, 없으면 heavy.sh(퇴역 전) 예비
  for (const r of roots) {
    const m = path.join(r, 'dflow-dev', 'scripts', 'heavy.mjs');
    try { if (fs.statSync(m).isFile()) return m; } catch { /* 없음 */ }
  }
  for (const r of roots) {
    const s = path.join(r, 'dflow-dev', 'scripts', 'heavy.sh');
    try { if (fs.statSync(s).isFile()) return s; } catch { /* 없음 */ }
  }
  return null;
}

// heavy 하니스 실행기: .mjs → node, .sh → bash. win32 는 .mjs 만(없으면 heavy=? 그대로).
function heavyStatus(hb) {
  let r;
  try {
    if (hb.endsWith('.mjs')) r = spawnSync(process.execPath, [hb, 'status'], { encoding: 'utf8', windowsHide: true });
    else if (WIN32) return null;
    else r = spawnSync('bash', [hb, 'status'], { encoding: 'utf8', windowsHide: true });
  } catch { return null; }
  if (!r || r.error || r.status !== 0) return null;
  const line = String(r.stdout ?? '').split('\n')[0] ?? '';
  const f = line.trim().split(/\s+/);
  if (f[0] !== 'HEAVY_STATUS') return null;
  const m2 = /^slots=([0-9]+)$/.exec(f[1] ?? '');
  const m3 = /^held=([0-9]+)$/.exec(f[2] ?? '');
  const m4 = /^waiting=([0-9]+)$/.exec(f[3] ?? '');
  if (!m2 || !m3 || !m4) return null;
  if (!(Number(m2[1]) > 0)) return null;
  return { slots: m2[1], wait: m4[1] };
}

function doMax(env, proc) {
  const TEAM_HARD_MAX = 6;
  const g = ramGb(proc);
  let k = env.DFLOW_HEAVY_SLOTS ?? '';
  if (k === '' || /[^0-9]/.test(k) || k === '0') {
    if (g !== null) {
      let n = Math.floor(Number(g) / 8);
      if (!(n >= 1)) n = 1;
      k = String(n);
    } else {
      k = '2';
    }
  }
  let n = Number(k) + 2;
  if (!(n <= TEAM_HARD_MAX)) n = TEAM_HARD_MAX;
  let src = 'default'; let extra = '';
  const o = env.DFLOW_TEAM_MAX ?? '';
  if (o !== '') {
    if (isint(o) && Number(o) >= 1) {
      src = 'DFLOW_TEAM_MAX'; n = Number(o);
      if (!(n <= TEAM_HARD_MAX)) { extra = ` clamped=${o}`; n = TEAM_HARD_MAX; }
    } else {
      extra = ` ignored=DFLOW_TEAM_MAX:${o}`;
    }
  }
  return { line: `TEAM_MAX ${n} k=${k} ram=${g ?? '?'}GB source=${src}${extra}`, rc: 0 };
}

function doUsage(env, liveRaw, state) {
  const CAPP = isnum(env.DFLOW_CAP_WEEKLY_CAP_PCT) ? env.DFLOW_CAP_WEEKLY_CAP_PCT : '90';
  const STOPP = isnum(env.DFLOW_CAP_WEEKLY_STOP_PCT) ? env.DFLOW_CAP_WEEKLY_STOP_PCT : '95';
  let WMAX = '2';
  if (isint(env.DFLOW_CAP_WEEKLY_MAX) && Number(env.DFLOW_CAP_WEEKLY_MAX) >= 1) WMAX = String(env.DFLOW_CAP_WEEKLY_MAX);
  const LIVE = isint(liveRaw) ? String(liveRaw) : '?';
  const home = env.HOME ?? os.homedir();
  const LIM = env.DFLOW_CAP_LIMITS_DIR ?? `${home}/.dflow/limits`;
  const now = Math.floor(Date.now() / 1000);
  const limits = `limits=cap>=${CAPP}%:max${WMAX},stop>=${STOPP}%`;
  let why = ''; let best = null; let nd = 0;
  let names = null;
  try { names = fs.readdirSync(LIM).sort(); } catch { names = null; }
  if (names !== null) {
    for (const nm of names) {
      if (!nm.endsWith('.json')) continue;
      if (nm.endsWith('.settings.json')) continue;
      const f = path.join(LIM, nm);
      try { if (!fs.statSync(f).isFile()) continue; } catch { continue; }
      nd += 1;
      try {
        const obj = JSON.parse(fs.readFileSync(f, 'utf8'));
        const at = obj?.at;
        const wp = obj?.rate_limits?.seven_day?.used_percentage;
        const rs = obj?.rate_limits?.seven_day?.resets_at;
        if (typeof at === 'number' && typeof wp === 'number' && typeof rs === 'number') {
          if (best === null || at > best[0]) best = [at, wp, rs];
        }
      } catch { /* 깨진 파일은 그 파일만 건너뜀 */ }
    }
    if (nd === 0) why = '덤프 없음';
    else if (best === null) why = 'seven_day 없음';
  } else {
    why = '덤프 없음';
  }
  if (why === '') {
    const rs = best[2];
    if (rs <= now) why = '덤프 오래됨(창 해제 지남)';
  }
  let line; let rc;
  if (why !== '') {
    line = `CAPACITY_USAGE_UNKNOWN ${why} — 막지 않는다 | live=${LIVE} ${limits}`; rc = 0;
  } else {
    const at = best[0]; const wp = best[1];
    let age = Math.trunc(now - at);
    if (!(age >= 0)) age = 0;
    const src = age <= 1800 ? 'fresh' : 'old';
    const w = String(Math.trunc(Number(wp)));
    const tail = `age=${age}s src=${src} ${limits}`;
    if (Number(wp) >= Number(STOPP)) {
      line = `CAPACITY_USAGE_STOP weekly=${w} live=${LIVE} defer=1 ${tail}`; rc = 1;
    } else if (Number(wp) >= Number(CAPP)) {
      let d = 0;
      if (LIVE !== '?' && Number(LIVE) >= Number(WMAX)) { d = 1; rc = 1; } else rc = 0;
      line = `CAPACITY_USAGE_CAP max=${WMAX} weekly=${w} live=${LIVE} defer=${d} ${tail}`;
    } else {
      line = `CAPACITY_USAGE_OK weekly=${w} live=${LIVE} ${tail}`; rc = 0;
    }
  }
  if (state !== '') line = withNotify(line, true, 'CAPACITY_USAGE_OK', state);
  return { line, rc };
}

function doCheck(env) {
  const MIN_FREE_PCT = env.DFLOW_CAP_MIN_FREE_PCT ?? '30';
  const MAX_LOAD_PER_CPU = env.DFLOW_CAP_MAX_LOAD_PER_CPU ?? '2.0';
  const MAX_SWAP_PCT = env.DFLOW_CAP_MAX_SWAP_PCT ?? '150';
  const PROC = env.DFLOW_CAP_PROC ?? '/proc';
  const OS = detectOs(env);
  let free = null; let swap = null; let load = null; let pressure = '';
  let unknown = ''; let hslots = null; let hwait = null;
  let osName;

  if (OS === 'Darwin' || OS === 'darwin') {
    osName = 'darwin';
    // memory_pressure 는 종료 코드를 보지 않고 출력만 파싱한다
    let f = null;
    if (!WIN32) {
      try {
        const r = spawnSync('memory_pressure', ['-Q'], { encoding: 'utf8', windowsHide: true });
        const m = /free percentage:\s*([0-9]+)%/.exec(r.stdout ?? '');
        if (m) f = m[1];
      } catch { /* 없음 */ }
    }
    if (f === null) f = sysctl('kern.memorystatus_level');
    if (f !== null && isnum(f)) free = String(f);
    const ram = sysctl('hw.memsize');
    const su = sysctl('vm.swapusage');
    if (su !== null && ram !== null && isnum(ram)) {
      const m = /used\s*=\s*([0-9.]+)([MG])/.exec(su);
      if (m && isnum(m[1])) {
        let mb = Number(m[1]);
        if (m[2] === 'G') mb = mb * 1024;
        const s = pct(String(mb), String(Number(ram) / 1048576));
        if (s !== null) swap = s;
      }
    }
    const lavg = sysctl('vm.loadavg');
    if (lavg !== null) {
      const parts = lavg.replace(/[{}]/g, ' ').trim().split(/\s+/);
      if (parts.length >= 2) {
        const la = parts[1];
        const n = ncpu(env);
        if (isnum(la) && n !== null) load = (Number(la) / Number(n)).toFixed(1);
      }
    }
    const lv = sysctl('kern.memorystatus_vm_pressure_level');
    if (lv === '1') pressure = 'normal';
    else if (lv === '2') pressure = 'warn';
    else if (lv === '4') pressure = 'critical';
  } else if (OS === 'Linux' || OS === 'linux') {
    osName = 'linux';
    try {
      const mi = fs.readFileSync(path.join(PROC, 'meminfo'), 'utf8');
      const pick = (k) => {
        const m = new RegExp('^' + k + ':\\s*(\\S+)', 'm').exec(mi);
        return m ? m[1] : null;
      };
      const mt = pick('MemTotal'); const ma = pick('MemAvailable');
      const st = pick('SwapTotal'); const sf = pick('SwapFree');
      if (isnum(mt) && isnum(ma)) { const v = pct(ma, mt); if (v !== null) free = v; }
      if (isnum(mt) && isnum(st) && isnum(sf)) { const v = pct(String(Number(st) - Number(sf)), mt); if (v !== null) swap = v; }
    } catch { /* 없음 */ }
    try {
      const la1 = fs.readFileSync(path.join(PROC, 'loadavg'), 'utf8').split('\n')[0] ?? '';
      const la = la1.trim().split(/\s+/)[1] ?? '';
      const n = ncpu(env);
      if (la !== '' && isnum(la) && n !== null) load = (Number(la) / Number(n)).toFixed(1);
    } catch { /* 없음 */ }
  } else if (OS === 'windows' || /^MINGW/.test(OS) || /^MSYS/.test(OS) || /^CYGWIN/.test(OS)) {
    osName = 'windows';
    try {
      const t = os.totalmem(); const fr = os.freemem();
      if (t > 0 && fr >= 0 && fr <= t) {
        const v = String(Math.round((fr * 100) / t));
        if (isint(v)) free = v;
      }
    } catch { /* 없음 */ }
  } else {
    osName = OS !== '' ? OS : 'unknown';
  }

  const hb = heavyBin(env);
  if (hb !== null) {
    try {
      if (!fs.statSync(hb).isFile()) { /* 없음 */ } else {
        const hs = heavyStatus(hb);
        if (hs !== null) { hslots = hs.slots; hwait = hs.wait; }
      }
    } catch { /* 없음 */ }
  }

  if (free === null) unknown += (unknown !== '' ? ',' : '') + 'free';
  if (swap === null) unknown += (unknown !== '' ? ',' : '') + 'swap';
  if (load === null) unknown += (unknown !== '' ? ',' : '') + 'load';
  if (hslots === null) unknown += (unknown !== '' ? ',' : '') + 'heavy';

  const hw = hslots !== null ? `${hwait}/${hslots}` : '?';
  let metrics = `free=${free ?? '?'}% swap=${swap ?? '?'}% load=${load ?? '?'} heavy_wait=${hw}`;
  if (pressure !== '') metrics += ` pressure=${pressure}`;
  metrics += ` os=${osName} limits=free>=${MIN_FREE_PCT}%,load<=${MAX_LOAD_PER_CPU},heavy_wait<slots,swap<${MAX_SWAP_PCT}%`;
  if (unknown !== '') metrics += ` unknown=${unknown}`;

  let reasons = '';
  if (free !== null && !(Number(free) >= Number(MIN_FREE_PCT))) reasons += ` 여유메모리${free}%<${MIN_FREE_PCT}%`;
  if (swap !== null && !(Number(swap) < Number(MAX_SWAP_PCT))) reasons += ` 스왑${swap}%>=${MAX_SWAP_PCT}%`;
  if (load !== null && Number(load) > Number(MAX_LOAD_PER_CPU)) reasons += ` load${load}/코어>${MAX_LOAD_PER_CPU}`;
  if (pressure === 'warn' || pressure === 'critical') reasons += ` 메모리압박=${pressure}`;
  if (hslots !== null && !(Number(hwait) < Number(hslots))) reasons += ` heavy대기${hwait}>=슬롯${hslots}`;

  let line; let rc;
  if (reasons !== '') { line = `CAPACITY_LOW${reasons} | ${metrics}`; rc = 1; }
  else if (free === null && swap === null && load === null) { line = `CAPACITY_UNKNOWN 판정 불가(os=${osName}) — 막지 않는다 | ${metrics}`; rc = 0; }
  else { line = `CAPACITY_OK ${metrics}`; rc = 0; }
  return { line, rc, osName };
}

function main(argv, env = process.env) {
  let MODE = 'check'; let STATE = ''; let LIVE = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
    else if (a === '--state') {
      if (i + 1 >= argv.length) { process.stderr.write(USAGE + '\n'); return 2; }
      STATE = argv[i + 1] ?? ''; i += 1;
    } else if (a === '--live') {
      if (i + 1 >= argv.length) { process.stderr.write(USAGE + '\n'); return 2; }
      LIVE = argv[i + 1] ?? ''; i += 1;
    } else if (a === 'max') MODE = 'max';
    else if (a === 'usage') MODE = 'usage';
    else { process.stderr.write(USAGE + '\n'); return 2; }
  }
  const PROC = env.DFLOW_CAP_PROC ?? '/proc';
  if (MODE === 'usage') {
    const r = doUsage(env, LIVE, STATE);
    process.stdout.write(r.line + '\n');
    return r.rc;
  }
  if (MODE === 'max') {
    const r = doMax(env, PROC);
    process.stdout.write(r.line + '\n');
    return r.rc;
  }
  const r = doCheck(env);
  let line = r.line;
  if (STATE !== '') line = withNotify(line, false, 'CAPACITY_OK', STATE);
  process.stdout.write(line + '\n');
  return r.rc;
}

// 직접 실행·심링크 경로에서도 늘 main 을 실행한다(진입 가드 없음).
{
  let rc = 70;
  try { rc = main(process.argv.slice(2)); } catch (e) {
    try { process.stderr.write(`내부 오류: ${(e && e.stack) || e}\n`); } catch { /* 무시 */ }
    rc = 70;
  }
  process.exitCode = rc ?? 0;
}

