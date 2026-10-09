// idle-check.mjs — 조정자 스크립트(node). 2026-10-09 W4 부터 이 파일이 유일한 구현이다(옛 bash 판은 backup/scripts/idle-check.sh 에 퇴역 보관).
//   사용법: idle-check.mjs [레인…]   (없으면 active 레인 전부)
//   stdout 레인마다 한 줄: IDLE · CANDIDATE · BUSY · HOLD · WAIT_USER · COMPACTING · STALL? · GONE (판정 순서는 idle-check.mjs 머리말)
//   상태 쓰기(hold 풀기·이벤트)는 coord-state.mjs spawn 으로만, 관측 기록은 <회차>/ticks/idle-<레인>.
// 옮길 때 bash 판이 기준이었다. 다른 스크립트(usage-band.mjs · heavy 스크립트 snapshot · coord-state.mjs)는 import 하지 않고 node 자식 프로세스로 부른다.
//   · jq 식은 JS 로 같은 뜻으로 옮겼다(.lanes | has, 세션 행의 `// ""`, `(…)/1000|floor`). 오류는 bash 처럼 그 줄만 빈 값
//   · bash 3.2 $(( )) 의 앞 0 8진·오류 동작은 arithVal 로, 오류가 나면 레인 루프 전체를 버린다(스크립트는 exit 0)
//   · `for L in $lanes` 는 공백으로 갈라진다(글롭 확장은 흉내 내지 않는다: 의심 목록)
// node 18.17 이상, 외부 패키지 없음.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './lib/jq-json.mjs';
import { CoordDie, Ctx, cfgSub, epochToIso, hasRun, isoToEpochLoose, nowEpoch, runDir, screenPromptKind, sessionFile, stateFile, wtAbs } from './lib/common.mjs';
import { pidAlive } from './lib/compat.mjs';
import { functions as termFns } from './lib/term.mjs';
import { ArithAbort, arithVal, cmpInt, coordBgSignals, coordDefaultRepo, coordHeavyScript, coordStateCall, rawOut, runScriptFile, runSync, scriptsDir, stripNl, testInt } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

/** 도움말(= bash 판 머리말 2~16줄, 이름만 .mjs). */
const HELP = `# 사용법: idle-check.mjs [레인…]   (없으면 active 레인 전부. 정본: ../references/contract.md §3.3, 설계 §3.i-2)
# stdout 레인마다 한 줄:
#   IDLE <레인> since=<iso>        확정(후보이고 거부 없음, 첫 관측 뒤 idle.confirm_gap_min 이상 지나 다시 후보). since = idle 시작 시각
#   CANDIDATE <레인>               첫 관측(확정 전). 관측 시각은 <회차>/ticks/idle-<레인>
#   BUSY <레인> <사유>             busy(세션 status 값) · idle-<n>m(idle_min 미만) · cooldown · bg=<콤마목록>
#   HOLD <레인> <사유>             hold until 미경과(사유 = hold.reason) · usage-band-R
#   WAIT_USER <레인> <창 종류>     화면에 확인·선택 창(permission·choice·usage-limit)
#   COMPACTING <레인>              화면 아래에 Compacting
#   STALL? <레인> bg=<분>m         bg 거부가 idle.stall_max_min 넘게 이어짐(분 = idle 지속 분: idle 중에는 새 bg 를 띄울 수 없으므로)
#   GONE <레인>                    세션 파일 없음 또는 pid 죽음
# 판정 순서: GONE → (until 지난 hold 는 coord-state.mjs hold <레인> - 로 풀고 hold-expired 이벤트) → 후보 아님(BUSY)
#   → 후보 중 거부: WAIT_USER → COMPACTING → HOLD → HOLD usage-band-R → BUSY cooldown → bg(BUSY/STALL?) → CANDIDATE/IDLE.
# 화면 신호는 레인 handle 이 있을 때만 읽는다. 후보가 아니거나 거부되면 관측 기록을 지운다.
# 상태 쓰기(hold 풀기·이벤트)는 coord-state.mjs 로만 한다(COORD_DRY=1 이면 DRY 로 찍기만).
set -uo pipefail
`;
const HERE = dirname(fileURLToPath(import.meta.url));
const digitsOr = (v, d) => (v === '' || /[^0-9]/.test(v) ? d : v);
const readDocs = (file) => {
  try { return J.parseStreamPartial(readFileSync(file, 'utf8')).values; } catch { return []; }
};
const isObj = (v) => v instanceof Map;

/** jq -r '<식>' 을 문서마다 적용한 줄들(오류 난 문서는 건너뜀) */
const eachDoc = (docs, fn) => {
  const out = [];
  for (const d of docs) {
    try { const v = fn(d); if (v !== undefined) out.push(v); } catch (e) { if (!(e instanceof J.JqError)) throw e; }
  }
  return out;
};
const num = (v) => typeof v === 'number' || v instanceof J.JNum;
const raw = (v) => rawOut(v);

/** 레인 하나의 행: [sid, pid, handle, hreason, huntil, linstr, wt] (jq 프로그램과 같은 `// ""`·tostring) */
function laneRow(docs, lane) {
  const rows = eachDoc(docs, (d) => {
    const x = J.index(J.index(d, 'lanes'), lane);
    const s = (...keys) => { let v = x; for (const k of keys) v = J.index(v, k); return v; };
    const f = (v, dflt) => J.tostring(J.alt(v, dflt));
    return [f(s('session', 'session_id'), ''), f(s('session', 'pid'), 0), f(s('session', 'handle'), ''), f(s('hold', 'reason'), ''), f(s('hold', 'until'), ''), f(s('last_instr_at'), ''), f(s('worktree'), '')];
  });
  const first = rows.length ? rows[0].join('\u001f') : '';
  // `read -r` 은 첫 줄만 읽는다
  const line = first.split('\n')[0];
  const parts = line.split('\u001f');
  while (parts.length < 7) parts.push('');
  return parts.slice(0, 7);
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
      process.stderr.write(HELP);
      return 0;
    }
    if (a0.startsWith('-')) throw new CoordDie(2, '사용법: idle-check.mjs [레인…]');
    if (!hasRun(c)) throw new CoordDie(3, '현재 회차가 없다(coord-state.mjs init 먼저)');
    const SF = stateFile(c, '');
    const TICKS = `${runDir(c, '')}/ticks`;
    try { mkdirSync(TICKS, { recursive: true }); } catch { throw new CoordDie(4, `ticks 폴더 생성 실패: ${TICKS}`); }
    const NOW = now ?? Number(nowEpoch());
    const IDLE_MIN = digitsOr(cfgSub(c, '.idle.idle_min'), '5');
    const COOL_MIN = digitsOr(cfgSub(c, '.idle.cooldown_min'), '15');
    const GAP_MIN = digitsOr(cfgSub(c, '.idle.confirm_gap_min'), '2');
    const STALL_MAX = digitsOr(cfgSub(c, '.idle.stall_max_min'), '90');

    let SNAP = '';
    const hs = coordHeavyScript(c);
    if (hs.out) SNAP = stripNl(runScriptFile(hs.out, ['snapshot'], { env: c.env, cwd: c.cwd }).out.toString('utf8'));
    let BAND = '';
    const band = () => {
      if (BAND === '') {
        const r = runScriptFile(join(scriptsDir(), 'usage-band.mjs'), [], { env: c.env, cwd: c.cwd });
        BAND = stripNl(r.out.toString('utf8').split('\n').slice(0, -1).map((l) => l.trim().split(/\s+/)[1] ?? '').join('\n'));
      }
      return BAND === '' ? 'UNKNOWN' : BAND;
    };
    const clearTick = (l) => { try { rmSync(`${TICKS}/idle-${l}`, { force: true }); } catch { /* 무시 */ } };

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
        let [sid, pid, handle, hreason, huntil, linstr, wt] = laneRow(docs, L);
        const sfile = sessionFile(c, pid, sid) ?? '';
        let spid = '';
        let sdocs = [];
        if (sfile !== '') {
          sdocs = readDocs(sfile);
          spid = stripNl(eachDoc(sdocs, (d) => { const v = J.alt(J.index(d, 'pid'), undefined); return v === undefined ? undefined : `${raw(v)}`; }).join('\n'));
        }
        if (sfile === '' || !pidAlive(spid, c.env)) { clearTick(L); out.push(`GONE ${L}`); continue; }
        const status = eachDoc(sdocs, (d) => raw(J.alt(J.index(d, 'status'), 'unknown'))).join('\n');
        const s2 = stripNl(eachDoc(sdocs, (d) => { const v = J.alt(J.index(d, 'sessionId'), undefined); return v === undefined ? undefined : raw(v); }).join('\n'));
        if (s2 !== '') sid = s2;
        const upd = eachDoc(sdocs, (d) => {
          const v = J.alt(J.alt(J.index(d, 'statusUpdatedAt'), J.index(d, 'updatedAt')), 0);
          if (!num(v)) throw new J.JqError('cannot be divided', 5);
          return J.numberText(Math.floor(Number(v) / 1000));
        }).join('\n');

        // until 지난 hold 풀기
        if (hreason !== '' && huntil !== '') {
          const ue = isoToEpochLoose(c, huntil);
          if (ue !== '' && cmpInt(ue, String(NOW), 'le')) {
            coordStateCall(c, ['hold', L, '-']);
            coordStateCall(c, ['event', 'hold-expired', L, J.stringify(new Map([['reason', hreason], ['until', huntil]]), { indent: 0 })]);
            hreason = '';
          }
        }

        // 후보 판정
        let idleFor = (BigInt(NOW) - arithVal(upd)) / 60n;
        if (idleFor < 0n) idleFor = 0n;
        if (status !== 'idle') { clearTick(L); out.push(`BUSY ${L} ${status}`); continue; }
        if (cmpInt(String(idleFor), IDLE_MIN, 'lt')) { clearTick(L); out.push(`BUSY ${L} idle-${idleFor}m`); continue; }

        // 거부 신호
        if (handle !== '') {
          const r = termFns.term_read_screen.run({ args: [handle, '40'], env: c.env, cwd: c.cwd });
          const scr = stripNl(Buffer.from(r.out ?? '').toString('latin1'));
          if (scr !== '') {
            const kind = screenPromptKind(Buffer.from(`${scr}\n`, 'latin1'));
            if (kind !== '') { clearTick(L); out.push(`WAIT_USER ${L} ${kind}`); continue; }
            if (`${scr}\n`.split('\n').slice(0, -1).slice(-15).some((l) => l.includes('Compacting'))) { clearTick(L); out.push(`COMPACTING ${L}`); continue; }
          }
        }
        if (hreason !== '') { clearTick(L); out.push(`HOLD ${L} ${hreason.replace(/[ \t]/g, '_')}`); continue; }
        if (band() === 'R') { clearTick(L); out.push(`HOLD ${L} usage-band-R`); continue; }
        if (linstr !== '') {
          const le = isoToEpochLoose(c, linstr);
          if (le !== '' && BigInt.asIntN(64, BigInt(NOW) - arithVal(le)) < BigInt.asIntN(64, arithVal(COOL_MIN) * 60n)) { clearTick(L); out.push(`BUSY ${L} cooldown`); continue; }
        }
        const bg = stripNl(coordBgSignals(c, wtAbs(c, wt), sid, SNAP).out);
        if (bg !== '') {
          clearTick(L);
          out.push(cmpInt(String(idleFor), STALL_MAX, 'gt') ? `STALL? ${L} bg=${idleFor}m` : `BUSY ${L} bg=${bg}`);
          continue;
        }

        // 확정
        const tf = `${TICKS}/idle-${L}`;
        let first = '';
        try { first = (readFileSync(tf, 'latin1').split('\n')[0] ?? '').replace(/[^0-9]/g, ''); } catch { first = ''; }
        if (first !== '' && cmpInt(first, upd, 'ge') && BigInt.asIntN(64, BigInt(NOW) - arithVal(first)) >= BigInt.asIntN(64, arithVal(GAP_MIN) * 60n)) {
          out.push(`IDLE ${L} since=${epochToIso(c, upd)}`);
        } else if (first !== '' && cmpInt(first, upd, 'ge')) {
          out.push(`CANDIDATE ${L}`);
        } else {
          const tmp = `${tf}.tmp.${process.pid}`;
          try { writeFileSync(tmp, `${NOW}\n`); renameSync(tmp, tf); } catch { /* 쓰기 실패: bash 는 && 로 건너뛰고 CANDIDATE 만 낸다 */ }
          out.push(`CANDIDATE ${L}`);
        }
      }
    } catch (e) {
      if (!(e instanceof ArithAbort)) throw e;
      c.log(`bash: ${e.message}`);   // $(( )) 오류: for 루프 전체를 버리고 exit 0
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
