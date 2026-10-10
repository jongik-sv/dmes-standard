// 감시 틱 한 번을 묶어 돌리고, 조정자가 행동해야 할 줄만 낸다. 정본: ../references/contract.md §3.3, ../SKILL.md 「틱 절차」
// 사용법: node tick.mjs [--no-answer] [--dry-run]
//   (옛 bash 판 tick.sh 를 node 로 옮긴 것. 2026-10-09 W4 에서 bash 판은 backup/scripts/ 로 퇴역했다.)
//   수집·판정을 모두 스크립트로 해서 조정자는 결과 몇 줄만 읽는다(조용한 틱은 `TICK quiet` 한 줄).
//   확인·선택 창은 판정표대로 바로 응답한다(auto-answer.mjs). --no-answer 면 PROMPT 줄만 낸다.
//   stdout(행동 줄만, 순서대로):
//     PROMPT <레인> <kind> · ANSWER/DENY/ESCALATE …(auto-answer 결과 그대로)
//     IDLE <레인> since=… · WAIT_USER <레인> <kind> · STALL? <레인> … · GONE <레인>     (idle-check)
//     STALL <레인> …                                                                    (stall-check)
//     CTX_OVER <레인> pct=<n> thr=<n> · CTX_OVER_SELF pct=<n> thr=<n>
//     BAND_CHANGED <이전> <지금> five=<n> week=<n>        (state.usage 를 지금 값으로 갱신해 한 번만 낸다)
//     LOAD_SOFT|LOAD_HARD|LOAD_RELEASE per_core=<f>      (두 틱 연속일 때만)
//     WINDOW_DUE <kind> lane=<레인|-> until=<iso>
//     UNACKED <instr-id> <레인> <분>m
//     UNLINKED <이름> pid=<pid>                          (처음 본 것만)
//     STALE_RUN <run-id> session=<id|-> idle=<분>m       (다른 조정 세션이 연 회차가 마감 표식 없이 살아 있는 레인을 둔 채 남음 — 경고만.
//                                                         같은 세션의 열린 회차는 팀장 칸을 공유하는 정상 상태라 알리지 않는다)
//     TICK quiet                                          (위 줄이 하나도 없을 때)
// 종료 코드: 0(경고·실패가 있어도 틱은 늘 0) · 3(현재 회차 없음).
// 다른 스크립트(coord-status·prompt-watch·auto-answer·idle-check·stall-check·ctx-usage·usage-band·office·console-poll·coord-state)는
// 모두 node 자식 프로세스로 부른다(각자 stdout 에 직접 쓰므로 import 로는 출력을 잡을 수 없다). 자식의 stderr 는 버린다.
// node 18.17 이상, 외부 패키지 없음.
import { appendFileSync, existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join } from 'node:path';
import * as J from './lib/jq-json.mjs';
import { CoordDie, Ctx, cfgAll, cfgSub, hasRun, isoToEpoch, laneGet, nowEpoch, nowIso, runDir, sess8Of, staleRuns, stateFile, stateRoot } from './lib/common.mjs';
import { statMtime } from './lib/compat.mjs';
import { coordStateCall, runScript, scriptsDir, stripNl, testInt } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

/** bash `read -r a b c rest` — IFS 공백류(기본 공백·탭)로 갈라 앞 n-1 칸 + 나머지(앞뒤 공백 뗌). 모자라면 빈 칸 */
function readFields(line, n, ifs = /[ \t]+/) {
  const sep = new RegExp(`^(?:${ifs.source})`);
  let rest = line;
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    rest = rest.replace(sep, '');
    if (rest === '') { out.push(''); continue; }
    const m = new RegExp(`^(.*?)(?:${ifs.source}|$)`, 's').exec(rest);
    out.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  out.push(rest.replace(sep, '').replace(new RegExp(`(?:${ifs.source})$`), ''));
  return out;
}
/** jq `@tsv` 한 칸 */
function tsvCell(v) {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : J.tostring(v);
  return s.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}
const lines = (s) => { const a = s.split('\n'); if (a[a.length - 1] === '') a.pop(); return a; };
/** awk 비교용: 둘 다 수 꼴이면 수로, 아니면 글로 */
const NUMLIKE = /^[ \t\n]*[-+]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][-+]?[0-9]+)?[ \t\n]*$/;
function awkGe(a, b) {
  if (NUMLIKE.test(a) && NUMLIKE.test(b)) return Number(a) >= Number(b);
  return a >= b;
}
function awkLt(a, b) {
  if (NUMLIKE.test(a) && NUMLIKE.test(b)) return Number(a) < Number(b);
  return a < b;
}
/** jq `tonumber? // null` */
const toNumOrNull = (s) => (/^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$/.test(s) ? Number(s) : null);

/** main — 종료 코드 */
export async function main(argv, { env = process.env, cwd = process.cwd() } = {}) {
  const c = new Ctx({ ...env }, cwd);
  let answer = true;
  let dry = false;
  const drain = () => { if (c.errs.length) { process.stderr.write(c.errs.join('')); c.errs.length = 0; } };
  for (const a of argv) {
    if (a === '--no-answer') answer = false;
    else if (a === '--dry-run') { dry = true; c.env.COORD_DRY = '1'; }
    else if (a === '-h' || a === '--help') { process.stdout.write(HELP); return 0; }
  }
  try {
    if (!hasRun(c)) throw new CoordDie(3, '현재 회차가 없다');
    const RD = runDir(c);
    mkdirSync(join(RD, 'ticks'), { recursive: true });
    const out = [];
    const emit = (s) => out.push(s);
    const now = Number(nowEpoch());
    const child = (name, args = []) => runScript(c, name, args);
    const outOf = (r) => r.out.toString('utf8');
    const readState = () => {
      try { const v = J.parseStreamPartial(readFileSync(stateFile(c), 'utf8')).values; return v.length ? v[0] : null; } catch { return null; }
    };
    const entries = (v) => (v instanceof Map ? [...v.entries()] : Array.isArray(v) ? v.map((x, i) => [String(i), x]) : []);

    const status = outOf(child('coord-status'));

    // 1. 확인·선택 창(busy·idle 가리지 않고 handle 이 있는 active 레인). 감지는 폴러의 화면 캐시가 신선하면 orca 를 부르지 않는다(prompt-watch).
    //    응답 직전 재판정(auto-answer)은 캐시를 쓰지 않고 늘 직접 읽는다.
    const activeLanes = [];
    try {
      for (const [k, v] of entries(J.index(readState(), 'lanes'))) {
        if (J.alt(J.index(v, 'state'), 'active') !== 'active') continue;
        if (J.alt(J.index(J.index(v, 'session'), 'handle'), '') === '') continue;
        activeLanes.push(k);
      }
    } catch (e) { if (!(e instanceof J.JqError)) throw e; }
    for (const L of activeLanes.join('\n').split(/[ \t\n]+/).filter((s) => s !== '')) {
      const pw = outOf(child('prompt-watch', [L])).split('\n')[0];
      if (!pw.startsWith('PROMPT')) continue;
      const kind = readFields(pw, 4)[2];
      if (answer) {
        const r = outOf(child('auto-answer', ['--lane', L, ...(dry ? ['--dry-run'] : [])])).split('\n')[0];
        if (!(r === '' || r.startsWith('NONE'))) emit(`${r} lane=${L}`);
      } else emit(`PROMPT ${L} ${kind}`);
    }

    // 2. idle·정지
    for (const ln of lines(outOf(child('idle-check')))) {
      const [kind, L, rest] = readFields(ln, 3);
      if (kind === 'IDLE' || kind === 'WAIT_USER' || kind === 'STALL?' || kind === 'GONE') emit(`${kind} ${L} ${rest}`);
    }
    for (const ln of lines(outOf(child('stall-check')))) {
      const [kind, L, rest] = readFields(ln, 3);
      if (kind === 'STALL') emit(`STALL ${L} ${rest}`);
    }

    // 3. 컨텍스트 임계(레인은 coord-status 의 ctx 칸, 창 크기별 임계)
    let cfgDoc = null;
    const thrFor = (win) => { // <window> → pct 임계(jq 식 `.compact as $c | (($c.by_window[$w].pct) // $c.threshold_pct // 40)` 의 글)
      try {
        if (cfgDoc === null) cfgDoc = J.parse(cfgAll(c));
        const cc = J.index(cfgDoc, 'compact');
        return J.tostring(J.alt(J.alt(J.index(J.index(J.index(cc, 'by_window'), win ?? ''), 'pct'), J.index(cc, 'threshold_pct')), 40));
      } catch { return ''; }
    };
    let cool = cfgSub(c, '.compact.cooldown_min'); if (cool === '') cool = '30';
    for (const ln of status.split('\n')) {
      if (!ln.startsWith('LANE ')) continue;
      const f = readFields(ln, 11);
      const L = f[1]; const ctxf = f[9];
      let pct = ctxf.startsWith('ctx=') ? ctxf.slice(4) : ctxf;
      if (pct.endsWith('%')) pct = pct.slice(0, -1);
      if (pct === '' || pct === '-' || /[^0-9]/.test(pct)) continue;
      let win = stripNl(laneGet(c, L, '.session.window').out);
      if (!(win !== '' && win !== 'null')) win = cfgSub(c, '.compact.default_window');
      const thr = thrFor(win);
      const ti = testInt(thr);
      if (ti === null || !(BigInt(pct) >= ti)) continue;
      const last = stripNl(isoToEpoch(c, stripNl(laneGet(c, L, '.compact.last_at').out)));
      if (last !== '') {
        const li = testInt(last); const ci = testInt(cool);
        if (li !== null && ci !== null && BigInt(Math.trunc((now - Number(li)) / 60)) < ci) continue;
      }
      emit(`CTX_OVER ${L} pct=${pct} thr=${thr}`);
    }
    let self = '';
    try { const v = J.index(J.index(J.index(readState(), 'run'), 'coordinator'), 'session_id'); self = v === null || v === undefined ? '' : J.tostring(v); } catch { /* 빈 값 */ }
    if (self !== '') {
      const cu = outOf(child('ctx-usage', [self])).split('\n')[0];
      if (cu.includes(' pct=')) {
        const pct = cu.replace(/^.* pct=([0-9]*).*$/, '$1');
        const win = cu.replace(/^.* window=([0-9]*).*$/, '$1');
        const thr = thrFor(win);
        const pi = testInt(pct); const ti = testInt(thr);
        if (pi !== null && ti !== null && pi >= ti) emit(`CTX_OVER_SELF pct=${pct} thr=${thr}`);
      }
    }

    // 4. 사용량 띠(바뀔 때 한 번)
    const ub = outOf(child('usage-band')).split('\n')[0];
    const band = readFields(ub, 3)[1];
    let old = 'UNKNOWN';
    try { old = J.tostring(J.alt(J.index(J.index(readState(), 'usage'), 'band'), 'UNKNOWN')); } catch { /* UNKNOWN */ }
    if (band !== '' && band !== 'UNKNOWN' && band !== old) {
      const five = ub.replace(/^.* five=([^ ]*).*$/, '$1');
      const week = ub.replace(/^.* week=([^ ]*).*$/, '$1');
      emit(`BAND_CHANGED ${old} ${band} five=${five} week=${week}`);
      coordStateCall(c, ['set', '.usage', JSON.stringify({ band, five: toNumOrNull(five), week: toNumOrNull(week), src: 'tick', at: nowIso(c) })]);
      drain();
    }

    // 5. load(두 틱 연속)
    const pcLine = status.split('\n').find((l) => l.startsWith('PC '));
    const pc = pcLine === undefined ? '' : pcLine.replace(/^.* per_core=([0-9.]*).*$/, '$1');
    if (pc !== '') {
      const soft = cfgSub(c, '.heavy.load_soft') || '1.2';
      const hard = cfgSub(c, '.heavy.load_hard') || '2.0';
      const rel = cfgSub(c, '.heavy.load_release') || '0.8';
      const lvl = awkGe(pc, hard) ? 'hard' : awkGe(pc, soft) ? 'soft' : awkLt(pc, rel) ? 'release' : 'mid';
      let prev = '';
      try { prev = stripNl(readFileSync(join(RD, 'ticks', 'load'), 'utf8')); } catch { /* 없음 */ }
      writeFileSync(join(RD, 'ticks', 'load'), `${lvl}\n`);
      if (lvl === prev) {
        if (lvl === 'hard') emit(`LOAD_HARD per_core=${pc}`);
        else if (lvl === 'soft') emit(`LOAD_SOFT per_core=${pc}`);
        else if (lvl === 'release') {
          // `[ "$(coord_state '.load.banned | length')" != 0 ]` — 읽기에 실패해 빈 글이어도 0 이 아니라 알린다
          let len = '';
          try {
            const b = J.index(J.index(readState(), 'load'), 'banned');
            len = b === null || b === undefined ? '0' : Array.isArray(b) ? String(b.length) : b instanceof Map ? String(b.size) : typeof b === 'string' ? String(Array.from(b).length) : typeof b === 'number' || b instanceof J.JNum ? J.numberText(Math.abs(J.toNumber(b))) : '';
          } catch { len = ''; }
          if (len !== '0') emit(`LOAD_RELEASE per_core=${pc}`);
        }
      }
    }

    // 6. 창 끝
    try {
      const w = J.index(readState(), 'windows');
      for (const [, v] of entries(w)) {
        const row = [J.index(v, 'kind'), J.alt(J.index(v, 'lane'), '-'), J.alt(J.index(v, 'until'), '')].map(tsvCell).join('\t');
        const [k, l, u] = readFields(row, 3, /\t+/);
        const ue = stripNl(isoToEpoch(c, u));
        const uei = testInt(ue);
        if (ue !== '' && uei !== null && BigInt(now) >= uei) emit(`WINDOW_DUE ${k} lane=${l === '' ? '-' : l} until=${u}`);
      }
    } catch (e) { if (!(e instanceof J.JqError)) throw e; }

    // 7. ack 없는 지시(cooldown 넘은 것)
    let ic = cfgSub(c, '.idle.cooldown_min'); if (ic === '') ic = '15';
    try {
      const ins = J.index(readState(), 'instrs');
      for (const [, v] of entries(ins)) {
        if (J.index(v, 'ack_at') !== null) continue;
        const row = [J.index(v, 'id'), J.index(v, 'lane'), J.index(v, 'sent_at')].map(tsvCell).join('\t');
        const [id, L, sent] = readFields(row, 3, /\t+/);
        const se = stripNl(isoToEpoch(c, sent));
        const sei = testInt(se);
        if (se === '' || sei === null) continue;
        const age = Math.trunc((now - Number(sei)) / 60);
        const ici = testInt(ic);
        if (ici !== null && BigInt(age) >= ici) emit(`UNACKED ${id} ${L} ${age}m`);
      }
    } catch (e) { if (!(e instanceof J.JqError)) throw e; }

    // 8. 처음 본 UNLINKED 세션
    const seen = join(RD, 'ticks', 'unlinked');
    if (!existsSync(seen)) writeFileSync(seen, ''); else { const t = new Date(); utimesSync(seen, t, t); }
    for (const ln of status.split('\n')) {
      if (!ln.startsWith('UNLINKED ')) continue;
      const [, nm, pidf] = readFields(ln, 4);
      if (!lines(readFileSync(seen, 'utf8')).includes(nm)) { appendFileSync(seen, `${nm}\n`); emit(`UNLINKED ${nm} ${pidf}`); }
    }

    // 9. 다른 조정 세션이 연 회차가 마감 표식 없이 살아 있는 레인을 둔 채 남음(contract §2.1·§3.3, 경고만 — 자동 마감하지 않는다).
    //    팀장 키는 조정 세션 단위라 같은 세션의 다른 열린 회차는 정상(팀장 칸 공유)이므로 알리지 않는다.
    let me8 = '';
    try { const d = readState(); me8 = d === null ? '' : sess8Of(d); } catch { me8 = ''; }
    for (const ln of lines(staleRuns(c, basename(RD)))) {
      const [rid, sid, s8, alive] = readFields(ln, 4, /\t+/);
      if (!(rid !== '' && s8 !== me8 && Number(alive === '' ? 0 : alive) > 0)) continue;
      const mt = statMtime(join(stateRoot(c), rid, 'state.json')) ?? '';
      let age = '-';
      // 조정 세션이 둘이면 서로의 회차가 늘 보이므로, state.json 이 STALE_MIN(120)분 넘게 조용한 회차만 알린다(mtime 을 모르면 알린다).
      if (mt !== '') {
        const m = Math.trunc((now - Number(mt)) / 60);
        if (!(m >= 120)) continue;
        age = `${m}m`;
      }
      emit(`STALE_RUN ${rid} session=${sid} idle=${age}`);
    }

    await new Promise((res) => process.stdout.write(out.length === 0 ? 'TICK quiet\n' : `${out.join('\n')}\n`, res));
    if (out.length > 0) { coordStateCall(c, ['event', 'tick', '-', JSON.stringify({ actions: out.length })]); c.errs.length = 0; }
    drain();
    // 에이전트 오피스 하트비트(팀장·살아 있는 레인 전원을 state.json 기준으로 재전송). 실패·dry-run 이어도 틱 출력은 그대로다.
    // 그 전에 틱 시각을 남긴다(팀장 자리 요약의 alive.last_tick_at — contract §4).
    if (!dry) {
      coordStateCall(c, ['set', '.run.last_tick_at', JSON.stringify(nowIso(c))]); c.errs.length = 0;
      quiet(c, 'office', ['beat']);
      // 회차 WBS 를 조용히 다시 만든다(실패·COORD_WBS_AUTO=0 이면 건너뜀 — 틱 출력 불변)
      if ((c.env.COORD_WBS_AUTO ?? '1') !== '0') quiet(c, 'wbs', ['--quiet']);
      // 오피스 콘솔 폴러가 죽었으면 다시 띄운다(이미 돌면 아무 일도 하지 않는다 — contract §4.1). COORD_CONSOLE_POLL=0 이면 건너뜀.
      if ((c.env.COORD_CONSOLE_POLL ?? '1') !== '0') quiet(c, 'console-poll', ['start']);
    }
    return 0;
  } catch (e) {
    if (e instanceof CoordDie) { drain(); process.stderr.write(`${e.message}\n`); return e.rc; }
    throw e;
  }
}

/** 출력을 모두 버리고 stdin 도 막은 채 부르는 자식(폴러가 떼어 낸 손자가 파이프를 붙잡아 틱이 멈추지 않게 stdio 를 닫는다). 실패는 무시 */
function quiet(c, name, args) {
  try {
    spawnSync(process.execPath, [join(scriptsDir(), `${name}.mjs`), ...args], { env: c.env, cwd: c.cwd, stdio: 'ignore', windowsHide: true });
  } catch { /* 틱 출력은 그대로 */ }
}

/** 도움말(= 옛 bash 판 머리말 2~19줄, 이름만 .mjs). -h 는 stdout 으로 낸다 */
const HELP = `# 감시 틱 한 번을 묶어 돌리고, 조정자가 행동해야 할 줄만 낸다. 정본: ../references/contract.md §3.3, ../SKILL.md 「틱 절차」
# 사용법: node tick.mjs [--no-answer] [--dry-run]
#   수집·판정을 모두 스크립트로 해서 조정자는 결과 몇 줄만 읽는다(조용한 틱은 \`TICK quiet\` 한 줄).
#   확인·선택 창은 판정표대로 바로 응답한다(auto-answer.mjs). --no-answer 면 PROMPT 줄만 낸다.
#   stdout(행동 줄만, 순서대로):
#     PROMPT <레인> <kind> · ANSWER/DENY/ESCALATE …(auto-answer 결과 그대로)
#     IDLE <레인> since=… · WAIT_USER <레인> <kind> · STALL? <레인> … · GONE <레인>     (idle-check)
#     STALL <레인> …                                                                    (stall-check)
#     CTX_OVER <레인> pct=<n> thr=<n> · CTX_OVER_SELF pct=<n> thr=<n>
#     BAND_CHANGED <이전> <지금> five=<n> week=<n>        (state.usage 를 지금 값으로 갱신해 한 번만 낸다)
#     LOAD_SOFT|LOAD_HARD|LOAD_RELEASE per_core=<f>      (두 틱 연속일 때만)
#     WINDOW_DUE <kind> lane=<레인|-> until=<iso>
#     UNACKED <instr-id> <레인> <분>m
#     UNLINKED <이름> pid=<pid>                          (처음 본 것만)
#     STALE_RUN <run-id> session=<id|-> idle=<분>m       (다른 조정 세션이 연 회차가 마감 표식 없이 살아 있는 레인을 둔 채 남음 — 경고만.
#                                                         같은 세션의 열린 회차는 팀장 칸을 공유하는 정상 상태라 알리지 않는다)
#     TICK quiet                                          (위 줄이 하나도 없을 때)
set -uo pipefail
`;

if (isMain(import.meta.url)) scriptMain(main);
