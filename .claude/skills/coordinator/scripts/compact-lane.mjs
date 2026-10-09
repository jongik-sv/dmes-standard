// scripts/compact-lane.sh 의 node 판(스위치 COORD_JS_COMPACT_LANE — js-bridge.sh _jsb_exec).
//   사용법: compact-lane.mjs <레인> [--force-no-memo] [--over-draft] [--dry-run]
//   레인 세션에 /compact 를 안전하게 넣고 끝날 때까지 확인한다. stdout: `COMPACT_REFUSED <레인> <사유>` · `COMPACT_DONE <레인> before=<n|-> after=<n|->` · `COMPACT_TIMEOUT <레인>`.
// bash 판이 정답이다. 다른 스크립트(term-send-safe.sh · ctx-usage.sh · coord-state.sh)는 import 하지 않고 spawn 한다.
//   · 화면 판정(Compacting·ctx %·Compacted)은 lib/compact-screen.mjs 의 함수, 터미널은 term.mjs 어댑터
//   · jq 식은 같은 뜻으로 JS 에 옮겼다(`// empty`, `.windows[]?`, `tonumber? // null`). $(( )) 오류는 그 복합 명령(if)만 버리고 계속
// node 18.17 이상, 외부 패키지 없음.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './lib/jq-json.mjs';
import { CoordDie, Ctx, cfgSub, hasRun, isoToEpoch, laneGet, nowEpoch, nowIso, stateFile } from './lib/common.mjs';
import { compacted, ctxPct } from './lib/compact-screen.mjs';
import { functions as termFns } from './lib/term.mjs';
import { ArithAbort, arithVal, coordStateCall, jqAdd, rawOut, runSync, stripNl } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readDocs = (file) => { try { return J.parseStreamPartial(readFileSync(file, 'utf8')).values; } catch { return []; } };
const SP = /^[ \t\n\v\f\r]*$/;
const lstrip = (s) => s.replace(/^[ \t\n\v\f\r]+/, '');

/** jq -r '<식> // empty' 를 문서마다 적용해 줄로 모은 글(오류 난 문서는 건너뜀, 끝 줄바꿈은 $(…) 처럼 뗌) */
function rawAt(docs, fn) {
  let out = '';
  for (const d of docs) {
    try { const v = J.alt(fn(d), undefined); if (v !== undefined) out += `${rawOut(v)}\n`; } catch (e) { if (!(e instanceof J.JqError)) throw e; }
  }
  return stripNl(out);
}
const path = (d, ...keys) => { let v = d; for (const k of keys) v = J.index(v, k); return v; };

/** main — 종료 코드. {env, cwd} 는 맥락 */
export async function main(argv, { env = process.env, cwd = process.cwd() } = {}) {
  const c = new Ctx({ ...env }, cwd);
  const out = [];
  const flush = () => {
    if (c.errs.length) process.stderr.write(c.err);
    if (out.length) process.stdout.write(`${out.join('\n')}\n`);
  };
  try {
    let lane = '', force = false, dry = false, over = false;
    for (const a of argv) {
      if (a === '--force-no-memo') force = true;
      else if (a === '--over-draft') over = true;
      else if (a === '--dry-run') dry = true;
      else if (a === '-h' || a === '--help') {
        const ls = readFileSync(join(HERE, 'compact-lane.sh'), 'latin1').split('\n').slice(1, 8);
        process.stdout.write(Buffer.from(`${ls.join('\n')}\n`, 'latin1'));
        return 0;
      } else if (a.startsWith('-')) throw new CoordDie(2, `모르는 옵션: ${a}`);
      else lane = a;
    }
    if (lane === '') throw new CoordDie(2, '사용법: compact-lane.sh <레인> [--force-no-memo] [--over-draft] [--dry-run]');
    if (dry) c.env.COORD_DRY = '1';
    if (!hasRun(c)) throw new CoordDie(3, '현재 회차가 없다');
    const SF = stateFile(c, '');
    const docs = readDocs(SF);
    const typ = [];
    for (const d of docs) { try { typ.push(J.typeName(path(d, 'lanes', lane))); } catch (e) { if (!(e instanceof J.JqError)) throw e; } }
    if (typ.join('\n') !== 'object') throw new CoordDie(2, `상태에 없는 레인: ${lane}`);
    const LP = `.lanes["${lane}"]`;

    const refuse = (reason, msg) => { out.push(`COMPACT_REFUSED ${lane} ${reason}`); if (msg) c.log(msg); flush(); return 0; };
    const lg = (sub) => stripNl(laneGet(c, lane, sub).out ?? '');

    const kind = lg('.session.kind');
    if (!['claude', 'glm', ''].includes(kind)) return refuse('unsupported-kind', `kind=${kind} 는 /compact 대상이 아니다(설계 §3.j-6)`);
    const h = lg('.session.handle');
    if (h === '') return refuse('no-handle', 'handle 이 상태에 없다 — 신원 보고를 다시 받을 것');
    const sid = lg('.session.session_id');

    // j-3 머지 중·측정 레인
    if (rawAt(docs, (d) => path(d, 'merge', 'in_flight', 'lane')) === lane) return refuse('merge-in-flight');
    let measure = '';
    for (const d of docs) {
      try {
        const w = J.index(d, 'windows');
        const els = Array.isArray(w) ? w : w instanceof Map ? [...w.values()] : [];
        for (const e of els) if (J.index(e, 'kind') === 'measure' && J.index(e, 'lane') === lane) measure += 'measure\n';
      } catch (e) { if (!(e instanceof J.JqError)) throw e; }
    }
    if (stripNl(measure) !== '') return refuse('measure-lane');

    // j-4 준비·쿨다운
    const pre = lg('.compact.pre_compact');
    if (pre === '' && !force) return refuse('no-memo', `정본 갱신 요청 → 답의 「남은 일 3줄」을 ${LP}.compact.pre_compact 에 먼저 적을 것`);
    const last = lg('.compact.last_at');
    let cool = cfgSub(c, '.compact.cooldown_min');
    if (cool === '') cool = '30';
    const now0 = Number(nowEpoch());
    if (last !== '') {
      const le = stripNl(isoToEpoch(c, last));
      try {
        if (le !== '' && BigInt.asIntN(64, BigInt(now0) - arithVal(le)) < BigInt.asIntN(64, arithVal(cool) * 60n)) return refuse('cooldown', `마지막 compact ${last} (간격 ${cool}분)`);
      } catch (e) { if (!(e instanceof ArithAbort)) throw e; c.log(`bash: ${e.message}`); }
    }

    // 보낼 글(한 줄, ! 없음)
    const memo = lg('.memo');
    const cname = rawAt(docs, (d) => path(d, 'run', 'coordinator', 'name'));
    const caddr = rawAt(docs, (d) => path(d, 'run', 'coordinator', 'addr'));
    const nextLine = `${pre}\n`.split('\n').slice(0, -1).filter((l) => !SP.test(l))[0] ?? '';
    const next = lstrip(nextLine);
    let text = `/compact ${lane} 진행 중. 정본은 ${memo !== '' ? memo : '-'}. 조정 세션 ${cname !== '' ? cname : '-'}(${caddr !== '' ? caddr : '-'}). 다음 단계: ${next !== '' ? next : '-'}`;
    text = text.replace(/[\n\r\t]/g, ' ').replace(/\n+$/, '');
    if (text.includes('!')) { text = text.split('!').join(''); c.log('글의 ! 를 지웠다(셸 모드 방지)'); }

    const SD = HERE;
    const ctxTokens = () => {
      if (sid === '' || !readable(join(SD, 'ctx-usage.sh'))) return '-';
      const o = (runSync('bash', [join(SD, 'ctx-usage.sh'), sid], { env: c.env, cwd: c.cwd }).out.toString('utf8').split('\n')[0] ?? '');
      const i = o.indexOf(' tokens=');
      if (i < 0) return '-';
      const rest = o.slice(i + ' tokens='.length);
      const sp = rest.indexOf(' ');
      return sp < 0 ? rest : rest.slice(0, sp);
    };
    const before = ctxTokens();

    const sargs = [join(SD, 'term-send-safe.sh'), '--handle', h, '--text', text, '--timeout-ms', '300000'];
    if (dry) sargs.push('--dry-run');
    if (over) sargs.push('--over-draft');
    const sr = runSync('bash', sargs, { env: c.env, cwd: c.cwd });
    const sres = stripNl(sr.out.toString('utf8'));
    if (sres.startsWith('REFUSED ')) return refuse(sres.slice(sres.lastIndexOf(' ') + 1));
    if (sres.startsWith('DRY SENT ')) {
      c.log(`DRY 이어서: Compacting 나타남(최대 60초)·사라짐(10초 간격, 최대 ${cfgSub(c, '.compact.wait_max_min')}분) 확인 → after 측정 → 상태·이벤트 기록`);
      out.push(`DRY COMPACT_DONE ${lane} before=${before} after=-`);
      flush();
      return 0;
    }
    if (!sres.startsWith('SENT ')) throw new CoordDie(4, `term-send-safe 실패(rc=${sr.rc}): ${sres}`);
    coordStateCall(c, ['event', 'compact-sent', lane, J.stringify(new Map([['text', text], ['before', before]]), { indent: 0 })]);

    const readScreen = () => Buffer.from(termFns.term_read_screen.run({ args: [h, '40'], env: c.env, cwd: c.cwd }).out ?? '').toString('latin1');
    const hasCompacting = () => `${readScreen()}`.split('\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).slice(-20).some((l) => l.includes('Compacting'));
    for (let i = 0; i < 12; i++) { if (hasCompacting()) break; await sleep(5000); }
    let maxm = cfgSub(c, '.compact.wait_max_min');
    if (maxm === '') maxm = '10';
    let end;
    try { end = BigInt(Number(nowEpoch())) + arithVal(maxm) * 60n; } catch (e) { if (!(e instanceof ArithAbort)) throw e; c.log(`bash: ${e.message}`); end = 0n; }
    while (hasCompacting()) {
      if (BigInt(Number(nowEpoch())) >= end) {
        out.push(`COMPACT_TIMEOUT ${lane}`);
        coordStateCall(c, ['event', 'compact-timeout', lane, `{"wait_max_min":${maxm}}`]);
        flush();
        return 0;
      }
      await sleep(10000);
    }
    let after = ctxTokens();
    if (after === before || after === '-') {
      const scr = stripNl(readScreen());
      const sbuf = Buffer.from(`${scr}\n`, 'latin1');
      const pct = stripNl(ctxPct(sbuf).out ?? '');
      if (pct !== '') {
        let win = lg('.session.window');
        if (win === '') win = cfgSub(c, '.compact.default_window');
        if (win === '') win = '200000';
        try {
          const v = (arithVal(pct) * arithVal(win)) / 100n;
          after = String(BigInt.asIntN(64, v));
          c.log(`COMPACT_NOTE ${lane} transcript 가 아직 갱신되지 않아 화면 ctx ${pct}% 로 after 를 어림했다(약 ${after} 토큰, 창 ${win})`);
        } catch (e) { if (!(e instanceof ArithAbort)) throw e; c.log(`bash: ${e.message}`); }
      } else if (compacted(sbuf).rc === 0) {
        after = '-';
        c.log(`COMPACT_NOTE ${lane} transcript 가 아직 갱신되지 않아 화면 Compacted 문구로만 확인했다(after=-)`);
      } else {
        after = '-';
        c.log(`COMPACT_NOTE ${lane} 재측정이 직전 값과 같은데 화면에서도 ctx %·Compacted 를 찾지 못했다(after=-). 화면을 직접 확인할 것`);
      }
    }

    const now = stripNl(nowIso(c));
    // hist = jq -c '.lanes[$l].compact.history // []'
    let hist = '[]';
    {
      let o = '';
      for (const d of docs) {
        try { const v = J.alt(path(d, 'lanes', lane, 'compact', 'history'), []); o += `${J.tojson(v)}\n`; } catch (e) { if (!(e instanceof J.JqError)) throw e; }
      }
      hist = stripNl(o);
    }
    const num = (s) => (/^[0-9]+$/.test(s) ? J.parse(String(BigInt(s))) : null);
    const rec = new Map([['at', now], ['before_tokens', num(before)], ['after_tokens', num(after)]]);
    let added = '';
    try { added = J.tojson(jqAdd(J.parse(hist), [rec])); } catch (e) { if (!(e instanceof J.JqError)) throw e; added = ''; }
    coordStateCall(c, ['set', `${LP}.compact.history`, added]);
    coordStateCall(c, ['set', `${LP}.compact.last_at`, `"${now}"`]);
    coordStateCall(c, ['set', `${LP}.compact.pending`, 'false']);
    coordStateCall(c, ['event', 'compact-done', lane, J.tojson(rec)]);
    out.push(`COMPACT_DONE ${lane} before=${before} after=${after}`);
    c.log('다음: 레인에 「재개 확인: 정본을 읽고 남은 일 3줄로 답한 뒤 이어서 진행해 달라.」 를 보내 pre_compact 와 대조');
    flush();
    return 0;
  } catch (e) {
    flush();
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc; }
    throw e;
  }
}
function readable(p) { try { readFileSync(p); return true; } catch { return false; } }
if (isMain(import.meta.url)) scriptMain(main);
