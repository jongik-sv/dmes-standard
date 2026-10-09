// scripts/measure-window.sh 의 node 판(스위치 COORD_JS_MEASURE_WINDOW — js-bridge.sh _jsb_exec).
//   사용법: measure-window.mjs open <measure|move|ban> [--lane <레인>] --until <iso> [--hold-heavy] [--dry-run]
//           measure-window.mjs close [<kind>] [--dry-run] | status | quiet-check
//   측정·이동·금지 창. 상태 쓰기는 coord-state.sh spawn 으로만, heavy 스크립트·kill 도 spawn 으로.
// bash 판이 정답이다. 옮기며 같게 만든 것:
//   · windows_json: 회차가 있고 state.json 이 읽히면 `.windows // []`, 아니면 `[]`. 창 목록은 배열이 정상이고 객체면 값들을 돌며, 문자열·수·true 는 jq 오류와 같이 비어 있는 결과가 된다
//   · `read -r k j l` 은 IFS=탭이라 연속 탭이 하나로 접힌다(kind 가 null 이면 칸이 밀린다)
//   · stop_job: 잡 폴더의 runpid·pid 를 lstart(coord_pstart)가 맞을 때만 `kill -TERM`(coord_do), 윈도우는 killTree
//   · quiet-check 의 per_core 는 awk printf "%.2f", 비교는 awk 의 수/문자열 규칙
// node 18.17 이상, 외부 패키지 없음.
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './lib/jq-json.mjs';
import { CoordDie, Ctx, cfgSub, hasRun, q, isoToEpoch, nowEpoch, nowIso, pstart, stateFile } from './lib/common.mjs';
import { isWin, killTree, pidAlive, psTable } from './lib/compat.mjs';
import { ArithAbort, arithVal, awkAtof, awkNum, coordCpus, coordDo, coordHeavyScript, coordLoad1, coordStateCall, fmtFixed, jqAdd, runSync, stripNl, tsvText } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

/** windows_json — 창 목록 값(문서 하나의 `.windows // []`). 회차 없음·읽기 실패는 [] */
function windowsValue(c) {
  if (!hasRun(c)) return [];
  const t = readText(stateFile(c, ''));
  if (t === null) return [];
  const { values, error } = J.parseStreamPartial(t);
  if (error || values.length === 0) return [];
  try {
    const w = J.alt(J.index(values[0], 'windows'), []);
    return w;
  } catch (e) { if (e instanceof J.JqError) return []; throw e; }
}
/** jq 'length' (오류면 null) */
function lenOf(v) {
  if (Array.isArray(v)) return String(v.length);
  if (v instanceof Map) return String(v.size);
  if (typeof v === 'string') return String(Array.from(v).length);
  if (typeof v === 'number' || v instanceof J.JNum) return J.numberText(Math.abs(Number(v)));
  if (v === null) return '0';
  return null;
}
/** `.[]` 의 원소들(오류면 null) */
function elems(v) {
  if (Array.isArray(v)) return v;
  if (v instanceof Map) return [...v.values()];
  return null;
}
const kindOf = (e) => J.index(e, 'kind');

/** `[.[] | select($k == "" or .kind == $k)]` — 오류면 null */
function selectKind(ws, k) {
  const es = elems(ws);
  if (es === null) return null;
  const out = [];
  try { for (const e of es) if (k === '' || kindOf(e) === k) out.push(e); } catch (e) { if (e instanceof J.JqError) return null; throw e; }
  return out;
}
/** `[.[] | select(($k == "" or .kind == $k) | not)]` — 오류면 null */
function rejectKind(ws, k) {
  const es = elems(ws);
  if (es === null) return null;
  const out = [];
  try { for (const e of es) if (!(k === '' || kindOf(e) === k)) out.push(e); } catch (e) { if (e instanceof J.JqError) return null; throw e; }
  return out;
}

/** bash `IFS=$'\t' read -r a b c` — 탭은 IFS 공백이라 앞뒤는 떼고 연속은 하나로 접으며 마지막 변수가 나머지를 받는다 */
export function readTab3(line) {
  const s = line.replace(/^\t+/, '');
  const parts = [];
  let rest = s;
  for (let i = 0; i < 2; i++) {
    const m = /^([^\t]*)(\t+|$)/.exec(rest);
    parts.push(m ? m[1] : '');
    rest = rest.slice(m ? m[0].length : rest.length);
  }
  parts.push(rest.replace(/\t+$/, ''));
  return parts;
}

/** awk 'p < q' — 둘 다 수 꼴이면 수, 아니면 문자열(strcmp) */
export function awkLt(a, b) {
  const x = awkNum(a), y = awkNum(b);
  if (x !== null && y !== null) return x - y < 0;
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')) < 0;
}
/** awk 'c > 0' */
function awkPos(a) {
  const x = awkNum(a);
  if (x !== null) return x > 0;
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from('0', 'utf8')) > 0;
}

/** main — 종료 코드. {env, cwd, now} 는 맥락 */
export async function main(argv, { env = process.env, cwd = process.cwd() } = {}) {
  const c = new Ctx({ ...env }, cwd);
  const out = [];
  const flush = () => {
    if (c.errs.length) process.stderr.write(c.err);
    if (out.length) process.stdout.write(`${out.join('\n')}\n`);
  };
  try {
    const sub = argv[0] ?? '';
    const args = argv.slice(1);
    let kind = '', lane = '', untilIso = '', hold = false, dry = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--lane') { lane = args[i + 1] ?? ''; i++; }
      else if (a === '--until') { untilIso = args[i + 1] ?? ''; i++; }
      else if (a === '--hold-heavy') hold = true;
      else if (a === '--dry-run') dry = true;
      else if (a === '-h' || a === '--help') {
        const ls = readFileSync(join(HERE, 'measure-window.sh'), 'latin1').split('\n').slice(1, 15);
        process.stdout.write(Buffer.from(`${ls.join('\n')}\n`, 'latin1'));
        return 0;
      } else if (a.startsWith('-')) throw new CoordDie(2, `모르는 옵션: ${a}`);
      else kind = a;
    }
    if (dry) c.env.COORD_DRY = '1';
    const JOBS = c.env.DFLOW_HEAVY_JOBS ? c.env.DFLOW_HEAVY_JOBS : `${c.env.HOME ?? ''}/.dflow/jobs`;
    const isDry = () => (c.env.COORD_DRY ?? '0') === '1';

    const stopJob = async (id) => {
      const jd = `${JOBS}/${id}`;
      if (!isDir(jd)) { c.log(`잡 폴더가 없다: ${jd}`); return; }
      const rc = readText(`${jd}/rc`);
      if (rc !== null) { c.log(`잡 ${id} 은 이미 끝났다(rc=${stripNl(rc)})`); return; }
      let any = false;
      for (const n of ['run', '']) {
        const p = stripNl(readText(`${jd}/${n}pid`) ?? '');
        const ps0 = stripNl(readText(`${jd}/${n}pstart`) ?? '');
        if (p === '') continue;
        const cur = pstart(c, p);
        if (cur === '' && ps0 === '' && pidAlive(p, c.env)) {
          let hit = false;
          if (isWin(c.env) && n === '') {
            for (const line of psTable(c.env).split('\n')) {
              const f = line.trim().split(/\s+/);
              if (f[0] === p && line.includes('__job') && line.includes(jd)) { hit = true; break; }
            }
          }
          if (hit) {
            if (isDry()) c.log(`DRY compat_kill_tree ${p}`); else killTree(p, c.env);
            any = true;
          } else c.log(`잡 ${id} 의 ${n !== '' ? n : 'job '}pid ${p} 시작 시각 - (관측 불가) — 명령줄로 같은 잡임을 확인하지 못해 건너뜀`);
        } else if (cur !== '' && cur === ps0) {
          if (isWin(c.env)) {
            if (isDry()) c.log(`DRY compat_kill_tree ${p}`); else killTree(p, c.env);
            any = true;
          } else if (coordDo(c, ['kill', '-TERM', p]).rc === 0) any = true;
        } else c.log(`잡 ${id} 의 ${n !== '' ? n : 'job '}pid ${p} 는 이미 없거나 다른 프로세스다(건너뜀)`);
      }
      if (any && !isDry()) await sleep(1000);
    };

    if (sub === 'open') {
      if (!['measure', 'move', 'ban'].includes(kind)) throw new CoordDie(2, 'open <measure|move|ban> 가 필요하다');
      if (untilIso === '') throw new CoordDie(2, '--until <iso> 가 필요하다');
      const ue = stripNl(isoToEpoch(c, untilIso));
      if (ue === '') throw new CoordDie(2, `--until 시각을 읽지 못했다: ${untilIso}`);
      const now = Number(nowEpoch());
      const secs = BigInt.asIntN(64, arithVal(ue) - BigInt(now));
      if (!(secs > 0n)) throw new CoordDie(2, `--until 이 이미 지났다: ${untilIso}`);
      if (!hasRun(c)) throw new CoordDie(3, '현재 회차가 없다');
      let job = '-';
      if (hold) {
        const hs = coordHeavyScript(c);
        if (hs.out) {
          if (dry) c.log(`DRY ${q(['bash', hs.out, '--detach', '--exclusive', 'sleep', String(secs)])}`);
          else {
            const o = stripNl(runSync('bash', [hs.out, '--detach', '--exclusive', 'sleep', String(secs)], { env: c.env, cwd: c.cwd }).out.toString('utf8'));
            const mk = 'HEAVY_DETACHED id=';
            const i = o.indexOf(mk);
            if (i >= 0) { const after = o.slice(i + mk.length); const sp = after.indexOf(' '); job = sp >= 0 ? after.slice(0, sp) : after; }
            else c.log(`heavy 붙잡기 실패(통지만으로 진행): ${o}`);
          }
        } else c.log('heavy.script 가 없다 — 공용 칸은 붙잡지 않고 통지만 한다');
      }
      const w = new Map([['kind', kind], ['lane', lane === '' ? null : lane], ['opened_at', stripNl(nowIso(c))], ['until', untilIso], ['notified', []], ['hold_job', job === '-' ? null : job]]);
      const wsv = windowsValue(c);
      let added = '';
      try { added = J.tojson(jqAdd(wsv, [w])); } catch (e) { if (!(e instanceof J.JqError)) throw e; added = ''; }
      coordStateCall(c, ['set', '.windows', added]);
      coordStateCall(c, ['event', 'window-open', lane !== '' ? lane : '-', J.tojson(w)]);
      out.push(`${dry ? 'DRY ' : ''}WINDOW_OPEN ${kind} until=${untilIso} hold_job=${job}`);
    } else if (sub === 'close') {
      const ws = windowsValue(c);
      const sel = selectKind(ws, kind);
      if (sel !== null && sel.length === 0) { out.push('WINDOW none'); flush(); return 0; }
      // 행: [.kind, (.hold_job // "-"), (.lane // "-")] | @tsv  (오류가 나면 그 앞 행까지)
      const rows = [];
      if (sel !== null) {
        try {
          for (const e of sel) {
            rows.push([tsvText(kindOf(e)), tsvText(J.alt(J.index(e, 'hold_job'), '-')), tsvText(J.alt(J.index(e, 'lane'), '-'))].join('\t'));
          }
        } catch (e) { if (!(e instanceof J.JqError)) throw e; }
      }
      for (const row of rows) {
        const [k, j, l] = readTab3(row);
        if (j !== '-') await stopJob(j);
        coordStateCall(c, ['event', 'window-close', l, J.tojson(new Map([['kind', k], ['hold_job', j === '-' ? null : j]]))]);
        out.push(dry ? `DRY WINDOW_CLOSED ${k}` : `WINDOW_CLOSED ${k}`);
      }
      const rest = rejectKind(ws, kind);
      coordStateCall(c, ['set', '.windows', rest === null ? '' : J.tojson(rest)]);
      const hs = coordHeavyScript(c);
      if (hs.out && !dry) {
        const first = runSync('bash', [hs.out, 'snapshot'], { env: c.env, cwd: c.cwd }).out.toString('latin1').split('\n')[0] ?? '';
        c.log(`heavy 현황: ${first.replace(/\t/g, ' ')}`);
      }
    } else if (sub === 'status') {
      const ws = windowsValue(c);
      const n = lenOf(ws);
      if (n === '0') { out.push('WINDOW none'); flush(); return 0; }
      const es = elems(ws);
      if (es !== null) {
        for (const e of es) {
          try {
            const s = (v) => J.tostring(v);
            out.push(`WINDOW ${s(J.index(e, 'kind'))} lane=${s(J.alt(J.index(e, 'lane'), '-'))} until=${s(J.alt(J.index(e, 'until'), '-'))}`);
          } catch (err) { if (err instanceof J.JqError) break; throw err; }
        }
      }
    } else if (sub === 'quiet-check') {
      let run = '0';
      const hs = coordHeavyScript(c);
      if (hs.out) {
        const snap = runSync('bash', [hs.out, 'snapshot'], { env: c.env, cwd: c.cwd }).out.toString('latin1');
        run = String(snap.split('\n').filter((l) => l.split('\t')[0] === 'RUN' && !(l === '' )).length);
        // awk 레코드: 끝 줄바꿈 없는 마지막 줄도 한 레코드로 센다
      } else c.log('heavy.script 가 없다 — RUN 수는 0 으로 본다(ps 검사만)');
      let procs = 0;
      for (const line of psTable(c.env).split('\n')) {
        const f = line.trim() === '' ? [] : line.trim().split(/[ \t]+/);
        if (f.length === 0) continue;
        const t = f.length >= 2 ? [f[0], '', ...f.slice(2)].join(' ') : f[0];
        if (!/GradleWrapperMain|vitest|playwright/.test(t)) continue;
        if (/mcp|grep/i.test(t)) continue;
        if (f[0] === String(process.pid)) continue;
        procs += 1;
      }
      const load = stripNl(Buffer.from(coordLoad1(c).out ?? '').toString('latin1'));
      let cpus = stripNl(Buffer.from(coordCpus(c).out ?? '').toString('latin1'));
      if (cpus === '') cpus = '1';
      let qv = cfgSub(c, '.heavy.measure_quiet');
      if (qv === '') qv = '0.5';
      let pc, r;
      if (load === '') { pc = '-'; r = 'unknown'; }
      else {
        const cn = awkAtof(cpus);
        if (awkPos(cpus) && cn === 0) throw new CoordDie(2, 'awk: division by zero');   // 문자열 cpus 가 0 보다 크다고 보이는데 값은 0 — 실제 환경에는 없는 입력
        pc = fmtFixed(awkPos(cpus) ? awkAtof(load) / cn : awkAtof(load), 2);
        r = run === '0' && String(procs) === '0' && awkLt(pc, qv) ? 'yes' : 'no';
      }
      out.push(`QUIET ${r} run=${run} per_core=${pc} procs=${procs}`);
    } else throw new CoordDie(2, '사용법: measure-window.sh open|close|status|quiet-check …');
    flush();
    return 0;
  } catch (e) {
    flush();
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc; }
    if (e instanceof ArithAbort) { process.stderr.write(`bash: ${e.message}\n`); return 1; }
    throw e;
  }
}
if (isMain(import.meta.url)) scriptMain(main);
