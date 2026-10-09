// scripts/stall-check.sh 의 node 판(스위치 COORD_JS_STALL_CHECK — js-bridge.sh _jsb_exec).
//   사용법: stall-check.mjs [레인…]   (없으면 active 레인 전부)
//   stdout 레인마다 한 줄: `STALL <레인> pid=<pid> cpu_delta=<초> quiet=<분>m heavy=<yes|no>` 또는 `OK <레인>`.
//   읽기 전용(관측 기록 <회차>/ticks/stall-<레인> 만 쓴다). 프로세스를 죽이지 않는다.
// bash 판이 정답이다. awk·ps·sort·cksum·stat·git 을 부르던 곳을 같은 뜻의 JS 로 옮기고, 바깥 명령(ps · lsof · git)은 spawn 한다.
//   · 프로세스 트리의 나열 순서: bash 판은 awk 의 `for (p in 배열)` 순서(구현 의존: bwk awk 해시 순서)다. 이 판은 ps 출력 순서를 쓴다.
//     판정에 영향이 없다(집합으로만 쓰고, top pid 는 sort 로 정한다). 다만 tick 파일의 `cpu=` 줄 안의 pid 나열 순서는 다를 수 있다(읽을 때 키로만 본다).
//   · top pid: sort -t<탭> -k2,2nr 은 cpu 큰 순이고 같으면 줄 전체 바이트 오름차순
//   · cksum: POSIX CRC-32(바이트 + 길이)
// node 18.17 이상, 외부 패키지 없음.
import { lstatSync, readFileSync, renameSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './lib/jq-json.mjs';
import { CoordDie, Ctx, cfgSub, hasRun, nowEpoch, pathInWt, runDir, sessionFile, stateFile, wtAbs } from './lib/common.mjs';
import { isWin, procCwds } from './lib/compat.mjs';
import { ArithAbort, arithVal, awkAtof, awkNum, cmpInt, coordDefaultRepo, coordGit, coordHeavyRunInWt, coordHeavyScript, fmtFixed, rawOut, runSync, stripNl } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const readDocs = (file) => { try { return J.parseStreamPartial(readFileSync(file, 'utf8')).values; } catch { return []; } };
const eachDoc = (docs, fn) => {
  const out = [];
  for (const d of docs) { try { const v = fn(d); if (v !== undefined) out.push(v); } catch (e) { if (!(e instanceof J.JqError)) throw e; } }
  return out;
};
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

// ---------- POSIX cksum ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 24;
    for (let k = 0; k < 8; k++) c = (c & 0x80000000) ? ((c << 1) ^ 0x04c11db7) : (c << 1);
    t[i] = c >>> 0;
  }
  return t;
})();
/** `cksum` 의 첫 칸(10진 CRC) */
export function cksum(buf) {
  let crc = 0;
  for (const b of buf) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0;
  for (let n = buf.length; n > 0; n = Math.floor(n / 256)) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ (n & 0xff)) & 0xff]) >>> 0;
  return String((~crc) >>> 0);
}

// ---------- ps 표 ----------
/** ps 의 `time=` → 초(awk 규칙: `D-HH:MM:SS`, `H:MM:SS`, `MM:SS.ss`) */
export function cpuSeconds(t0) {
  let t = t0, d = 0;
  if (t.includes('-')) { const dd = t.split('-'); d = awkAtof(dd[0] ?? ''); t = dd[1] ?? ''; }
  const p = t === '' ? [] : t.split(':');
  let s = 0;
  for (const x of p) s = s * 60 + awkAtof(x);
  return s + d * 86400;
}
/** `ps -axo pid=,ppid=,time=,args=` 출력 → 행 [{pid, ppid, cpu('%.2f' 글), args}] (awk 의 필드·sub 규칙) */
export function psRows(text) {
  const rows = [];
  const lines = stripNl(text).split('\n');
  for (const line of lines) {
    const f = line.trim() === '' ? [] : line.trim().split(/[ \t]+/);
    const m = /^ *[0-9]+ +[0-9]+ +[^ ]+ +/.exec(line);
    const args = m ? line.slice(m[0].length) : line;
    rows.push({ pid: f[0] ?? '', ppid: f[1] ?? '', cpu: fmtFixed(cpuSeconds(f[2] ?? ''), 2), args: args.split('\t')[0] });
  }
  return rows;
}

const EXCL1 = /bootRun|be\.run\.module|GradleDaemon|mcp|^([^ ]*\/)?awk /;
const HIT = /GradleWrapperMain|org\.gradle\.launcher\.GradleMain|(^|[\/ ])gradlew?( |$)|GradleWorkerMain|Gradle Test Executor|vitest|playwright|(^|[\/ ])tsc( |$)|typescript\/bin\/tsc|(^|[\/ ])jest( |$)/;
const EXCL2 = /bootRun|be\.run\.module|GradleDaemon|mcp/;
const JN = /^([^ ]*\/)?(java|node)( |$)/;

/** awk 비교: 둘 다 수 꼴(또는 없는 칸=0)이면 수, 아니면 문자열 */
function awkCmp(a, b) {
  const x = a === undefined ? 0 : awkNum(a), y = awkNum(b);
  if (x !== null && y !== null) { const j = x - y; return j < 0 ? -1 : j > 0 ? 1 : 0; }
  const A = Buffer.from(a ?? '', 'utf8'), B = Buffer.from(b, 'utf8');
  return Buffer.compare(A, B);
}

/** lane_tree — 레인 트리의 `[pid, cpu]` 목록. rows 는 psRows 결과 */
export function laneTree(c, rows, wt, spid) {
  if (rows.length === 0) return [];
  const table = new Map();
  for (const r of rows) table.set(r.pid, r);
  const cand = [];
  for (const [p, r] of table) {
    if (p === spid || EXCL1.test(r.args)) continue;
    let hit = HIT.test(r.args);
    if (!hit && awkCmp(spid, '0') > 0 && JN.test(r.args)) {
      let q = r.ppid;
      let n = 0;
      while (awkCmp(q, '1') > 0 && n < 50) {
        if (awkCmp(q, spid) === 0) { hit = true; break; }
        q = table.get(q)?.ppid;
        n += 1;
      }
    }
    if (hit) cand.push(p);
  }
  if (cand.length === 0) return [];
  const cwds = procCwds(cand.join(','), c.env);
  const roots = [];
  for (const line of String(cwds).split('\n')) {
    if (line === '') continue;
    const s = line.replace(/^\t+/, '');
    const i = s.indexOf('\t');
    const p = i < 0 ? s : s.slice(0, i);
    const cwd = i < 0 ? '' : s.slice(i).replace(/^\t+/, '').replace(/\t+$/, '');
    if (pathInWt(c, cwd, wt)) roots.push(p);
  }
  if (roots.length === 0) return [];
  const inSet = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [p, r] of table) {
      if (!inSet.has(p) && inSet.has(r.ppid) && p !== spid && !EXCL2.test(r.args)) { inSet.add(p); changed = true; }
    }
  }
  const tree = [];
  for (const p of inSet) if (table.has(p)) tree.push([p, table.get(p).cpu]);
  return tree;
}

/** lane_output — [sig, latest] */
export function laneOutput(c, wt) {
  const st = coordGit(c, ['-C', wt, '-c', 'core.quotepath=off', 'status', '--porcelain', '-uall']);
  let end = st.out.length;
  while (end > 0 && st.out[end - 1] === 0x0a) end--;
  const listBuf = st.out.subarray(0, end);
  const sig = cksum(listBuf);
  const list = listBuf.toString('latin1');
  let latest = '';
  let best = null;
  for (const line of list.split('\n')) {
    let n = line.replace(/^.../, '').replace(/^.* -> /, '').replace(/^"(.*)"$/, '$1');
    if (n === '') continue;
    try {
      const mt = Math.floor(lstatSync(Buffer.concat([Buffer.from(`${wt}/`), Buffer.from(n, 'latin1')])).mtimeMs / 1000);
      if (best === null || mt > best) best = mt;
    } catch { /* stat 오류: 건너뜀 */ }
    n = '';
  }
  if (best !== null) latest = String(best);
  const head = stripNl(coordGit(c, ['-C', wt, 'log', '-1', '--format=%ct', 'HEAD']).out.toString('utf8'));
  if (head !== '' && (latest === '' || cmpInt(head, latest, 'gt'))) latest = head;
  return [sig, latest === '' ? '0' : latest];
}

/** awk delta: prev·cur 는 `pid:cpu,…` 글. printf "%.1f" */
export function cpuDelta(prev, cur) {
  const pv = new Map();
  if (prev !== '') for (const item of prev.split(',')) { const kv = item.split(':'); pv.set(kv[0], kv[1]); }
  let d = 0;
  if (cur !== '') for (const item of cur.split(',')) {
    const kv = item.split(':');
    const x = awkAtof(kv[1] ?? '') - (pv.has(kv[0]) ? awkAtof(pv.get(kv[0]) ?? '') : 0);
    if (x > 0) d += x;
  }
  return fmtFixed(d, 1);
}

/** main — 종료 코드. {env, cwd, now} 는 맥락(now 는 epoch 초) */
export async function main(argv, { env = process.env, cwd = process.cwd(), now } = {}) {
  const c = new Ctx({ ...env }, cwd);
  const out = [];
  const flush = () => {
    if (c.errs.length) process.stderr.write(c.err);
    if (out.length) process.stdout.write(`${out.join('\n')}\n`);
  };
  try {
    coordDefaultRepo(c);
    const a0 = argv[0] ?? '';
    if (a0 === '-h' || a0 === '--help') {
      const ls = readFileSync(join(HERE, 'stall-check.sh'), 'latin1').split('\n').slice(1, 13);
      process.stderr.write(Buffer.from(`${ls.join('\n')}\n`, 'latin1'));
      return 0;
    }
    if (a0.startsWith('-')) throw new CoordDie(2, '사용법: stall-check.sh [레인…]');
    if (!hasRun(c)) throw new CoordDie(3, '현재 회차가 없다(coord-state.sh init 먼저)');
    const SF = stateFile(c, '');
    const TICKS = `${runDir(c, '')}/ticks`;
    try { mkdirSync(TICKS, { recursive: true }); } catch { throw new CoordDie(4, `ticks 폴더 생성 실패: ${TICKS}`); }
    const NOW = now ?? Number(nowEpoch());
    let QUIET = cfgSub(c, '.stall.quiet_min');
    if (QUIET === '' || /[^0-9]/.test(QUIET)) QUIET = '20';
    let SNAP = '';
    const hs = coordHeavyScript(c);
    if (hs.out) SNAP = stripNl(runSync('bash', [hs.out, 'snapshot'], { env: c.env, cwd: c.cwd }).out.toString('utf8'));
    const cpuObs = !isWin(c.env);
    if (!cpuObs) c.log('Git Bash: 프로세스 누적 CPU 시간을 읽을 수 없어 STALL 판정을 하지 않는다(OK 만 낸다)');
    let rows = [];
    if (cpuObs) rows = psRows(runSync('ps', ['-axo', 'pid=,ppid=,time=,args='], { env: c.env, cwd: c.cwd }).out.toString('utf8'));
    if (rows.length === 1 && rows[0].pid === '' && rows[0].args === '') rows = [];   // 빈 출력

    const docs = readDocs(SF);
    let lanes;
    if (argv.length > 0) lanes = argv.join(' ');
    else {
      const keys = [];
      for (const d of docs) {
        try {
          const ls = J.index(d, 'lanes');
          let entries;
          if (ls instanceof Map) entries = [...ls.entries()];
          else if (Array.isArray(ls)) entries = ls.map((v, i) => [String(i), v]);
          else throw new J.JqError('lanes has no keys', 5);
          for (const [k, v] of entries) if (J.alt(J.index(v, 'state'), 'active') === 'active') keys.push(k);
        } catch (e) { if (!(e instanceof J.JqError)) throw e; }
      }
      lanes = keys.join('\n');
    }

    try {
      for (const L of lanes.split(/[ \t\n]+/).filter((s) => s !== '')) {
        const has = eachDoc(docs, (d) => {
          const ls = J.index(d, 'lanes');
          if (!(ls instanceof Map)) throw new J.JqError('has requires object', 5);
          return ls.has(L) ? 'true' : 'false';
        }).join('\n');
        if (has !== 'true') { c.log(`없는 레인: ${L}`); continue; }
        const lane = (d) => J.index(J.index(d, 'lanes'), L);
        const wt = wtAbs(c, eachDoc(docs, (d) => rawOut(J.alt(J.index(lane(d), 'worktree'), ''))).join('\n'));
        let spid = eachDoc(docs, (d) => rawOut(J.alt(J.index(J.index(lane(d), 'session'), 'pid'), 0))).join('\n');
        const sid = eachDoc(docs, (d) => rawOut(J.alt(J.index(J.index(lane(d), 'session'), 'session_id'), ''))).join('\n');
        const sf = sessionFile(c, spid, sid) ?? '';
        if (sf !== '') {
          const p2 = stripNl(eachDoc(readDocs(sf), (d) => { const v = J.alt(J.index(d, 'pid'), undefined); return v === undefined ? undefined : rawOut(v); }).join('\n'));
          if (p2 !== '') spid = p2;
        }
        if (spid === '' || /[^0-9]/.test(spid)) spid = '0';
        const tf = `${TICKS}/stall-${L}`;
        if (wt === '' || !isDir(wt)) { c.log(`${L}: 워크트리 없음 — 판정 생략`); out.push(`OK ${L}`); continue; }
        if (!cpuObs) { out.push(`OK ${L}`); continue; }

        const tree = laneTree(c, rows, wt, spid);
        const [sig, latest] = laneOutput(c, wt);
        const cpuNow = tree.map(([p, cpu]) => `${p}:${cpu}`).join(',');

        let pAt = '', pSig = '', pChange = '', pCpu = '';
        let prevText = null;
        try { prevText = readFileSync(tf, 'latin1'); } catch { prevText = null; }
        if (prevText !== null) {
          const pick = (k) => stripNl(prevText.split('\n').filter((l) => l.startsWith(`${k}=`)).map((l) => l.slice(k.length + 1)).join('\n'));
          pAt = pick('at'); pSig = pick('sig'); pChange = pick('change_at'); pCpu = pick('cpu');
        }
        let changeAt = pChange;
        if (changeAt === '' || sig !== pSig) changeAt = String(NOW);
        const tmp = `${tf}.tmp.${process.pid}`;
        try { writeFileSync(tmp, `at=${NOW}\nsig=${sig}\nchange_at=${changeAt}\ncpu=${cpuNow}\n`, 'latin1'); renameSync(tmp, tf); } catch { /* 쓰기 실패 */ }

        let last = changeAt;
        if (latest !== '' && cmpInt(latest, last, 'gt')) last = latest;
        let quiet = (BigInt(NOW) - arithVal(last)) / 60n;
        if (quiet < 0n) quiet = 0n;
        if (tree.length === 0 || pAt === '' || BigInt.asIntN(64, BigInt(NOW) - arithVal(pAt)) < 60n || cmpInt(String(quiet), QUIET, 'lt')) { out.push(`OK ${L}`); continue; }

        const delta = cpuDelta(pCpu, cpuNow);
        if (awkAtof(delta) < 2) {
          const sorted = tree.map(([p, cpu]) => `${p}\t${cpu}`).sort((a, b) => {
            const x = awkAtof(a.split('\t')[1]), y = awkAtof(b.split('\t')[1]);
            if (x !== y) return y - x;
            return Buffer.compare(Buffer.from(a), Buffer.from(b));
          });
          const top = sorted[0].split('\t')[0];
          const heavy = coordHeavyRunInWt(c, wt, SNAP).rc === 0 ? 'yes' : 'no';
          out.push(`STALL ${L} pid=${top} cpu_delta=${delta} quiet=${quiet}m heavy=${heavy}`);
        } else out.push(`OK ${L}`);
      }
    } catch (e) {
      if (!(e instanceof ArithAbort)) throw e;
      c.log(`bash: ${e.message}`);
    }
    flush();
    return 0;
  } catch (e) {
    flush();
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc; }
    throw e;
  }
}
if (isMain(import.meta.url)) scriptMain(main);
