// ctx-usage.mjs — 조정자 스크립트(node). 2026-10-09 W4 부터 이 파일이 유일한 구현이다(옛 bash 판은 backup/scripts/ctx-usage.sh 에 퇴역 보관).
//   사용법: ctx-usage.mjs <session-id> | --pid <pid> | --lane <레인>  [--window N]
//   stdout 한 줄: `CTX <session-id> tokens=<n> window=<n> pct=<n> src=transcript|dump at=<iso>` 또는 `CTX <id> unknown <사유>`.
//   덤프(<state_dir>/ctx/<sid>.json, 30분 안)가 먼저, 없으면 transcript 의 마지막 assistant 사용량. 읽기 전용.
// 옮길 때 bash 판이 기준이었고, 같게 만든 것:
//   · jq 의 `//`·tostring·@tsv·`+`(문자열·배열·객체도 더해진다)·`> 0`(문자열은 0 보다 큼) 과, 줄 하나가 오류면 그 줄만 건너뛰는 동작(jq -R fromjson?)
//   · tail -c 256KB → 2MB → 16MB → 전체 로 넓혀 가며 마지막 일치를 찾는다(잘린 첫 줄은 파싱이 실패하면 버려질 뿐 따로 자르지 않는다)
//   · awk printf "%d" · bash 3.2 의 $(( )) 앞 0 8진·오류(그 명령 전체를 버림), 글롭 순서는 C 순서(bash 판은 로캘 순서 — 의심 목록)
// node 18.17 이상, 외부 패키지 없음.
import { closeSync, fstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as J from './lib/jq-json.mjs';
import { CoordDie, Ctx, cfgSub, epochToIso, expand, hasRun, isoToEpoch, laneGet, nowEpoch, sessionFile, stateFile, stateRoot } from './lib/common.mjs';
import { ArithAbort, arithVal, awkAtof, awkInt, coordDefaultRepo, cutF, jqAdd, rawOut, step, stripNl, tsvEsc, tsvText, walk } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

/** 도움말(= bash 판 머리말 2~11줄, 이름만 .mjs). */
const HELP = `# 사용법: ctx-usage.mjs <session-id> | --pid <pid> | --lane <레인>  [--window N]   (정본: ../references/contract.md §3.3, 설계 §3.j-1)
# stdout 한 줄: \`CTX <session-id> tokens=<n> window=<n> pct=<n> src=transcript|dump at=<iso>\` 또는 \`CTX <id> unknown <사유>\`
# 읽는 순서
#   1) <state_dir>/ctx/<session-id>.json 덤프({at,session_id,context_window,rate_limits})가 30분 안이면 그것(src=dump)
#   2) transcript <claude_projects_dir>/<프로젝트 폴더>/<session-id>.jsonl 에서 isSidechain 이 아닌 마지막 assistant 메시지의
#      message.usage.input_tokens + cache_read_input_tokens + cache_creation_input_tokens (src=transcript).
#      파일 끝부분만 tail 로 읽고, 못 찾으면 범위를 넓혀 다시 읽는다. 프로젝트 폴더는 세션 cwd 의 / · . 를 - 로 바꾼 이름,
#      cwd 를 모르면 <claude_projects_dir>/*/<session-id>.jsonl 로 찾는다.
# 창 크기: --window → (덤프의 context_window_size) → state lanes.<레인>.session.window → compact.default_window.
set -uo pipefail
`;
const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = '사용법: ctx-usage.mjs <session-id> | --pid <pid> | --lane <레인> [--window N]';
const isnum = (s) => s !== '' && s !== 'null' && !/[^0-9]/.test(s);
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

/** `jq -r '<경로> // empty'` 를 텍스트(여러 문서 가능)에 적용한 글(오류는 그 문서만 건너뜀, 끝 줄바꿈은 $(…) 처럼 뗌) */
function jqRawAt(text, segs) {
  let out = '';
  for (const d of J.parseStreamPartial(text).values) {
    try {
      const a = J.alt(walk(d, segs), undefined);
      if (a !== undefined) out += `${rawOut(a)}\n`;
    } catch (e) { if (!(e instanceof J.JqError)) throw e; }
  }
  return stripNl(out);
}
const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };

/** 상태 파일에서 session_id 가 sid 인 레인의 .session.window 중 처음 null 이 아닌 값(`// empty`). 문서마다 오류면 그 문서는 출력 없음 */
function windowBySid(file, sid) {
  const text = readText(file);
  if (text === null) return '';
  let out = '';
  for (const d of J.parseStreamPartial(text).values) {
    try {
      const lanes = J.index(d, 'lanes');
      let items;
      if (lanes instanceof Map) items = [...lanes.values()];
      else if (Array.isArray(lanes)) items = lanes;
      else throw new J.JqError(`Cannot iterate over ${J.typeName(lanes)}`, 5);
      const wins = [];
      for (const e of items) {
        const s = walk(e, ['session', 'session_id']);
        if (s === sid) wins.push(walk(e, ['session', 'window']));
      }
      const first = wins.find((w) => w !== null);
      const a = J.alt(first, undefined);
      if (a !== undefined) out += `${rawOut(a)}\n`;
    } catch (e) { if (!(e instanceof J.JqError)) throw e; }
  }
  return stripNl(out);
}

const atOf = (v) => {
  if (typeof v === 'number' || v instanceof J.JNum) {
    const n = Number(v);
    return Math.floor(n > 100000000000 ? Math.floor(n / 1000) : n);
  }
  return v;
};
/** 덤프 문서 하나 → TSV 행(jq 프로그램 그대로). 오류는 JqError */
export function dumpRow(d) {
  const at = atOf(walk(d, ['at']));
  const cw = J.alt(walk(d, ['context_window']), new Map());
  const cu = J.alt(step(cw, 'current_usage'), null);
  const sz = J.alt(step(cw, 'context_window_size'), null);
  let tok = null;
  if (cu !== null) {
    const g = (k) => J.alt(step(cu, k), 0);
    tok = jqAdd(jqAdd(g('input_tokens'), g('cache_read_input_tokens')), g('cache_creation_input_tokens'));
  } else {
    const up = step(cw, 'used_percentage');
    if (up !== null && sz !== null) {
      const isN = (x) => typeof x === 'number' || x instanceof J.JNum;
      if (!isN(up) || !isN(sz)) throw new J.JqError('cannot be multiplied/divided', 5);
      tok = Math.floor((Number(up) * Number(sz)) / 100);
    }
  }
  const ts = (v) => J.tostring(v);
  return [at === undefined ? 'null' : ts(at === null ? null : at), ts(tok === null ? '' : tok), ts(J.alt(sz, ''))].map(tsvEsc).join('\t');
}

function dumpRows(text) {
  const rows = [];
  for (const d of J.parseStreamPartial(text).values) {
    try { rows.push(dumpRow(d)); } catch (e) { if (!(e instanceof J.JqError)) throw e; }
  }
  return rows.join('\n');
}

/** 파일 끝 n 바이트(n = 0 이거나 크기 이상이면 전체)를 latin1 글로 */
function readTail(path, n, size) {
  if (n === 0 || n >= size) return readFileSync(path, 'latin1');
  const fd = openSync(path, 'r');
  try {
    const len = Math.min(n, fstatSync(fd).size);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, fstatSync(fd).size - len);
    return buf.toString('latin1');
  } finally { closeSync(fd); }
}

/** 줄 하나(transcript)에서 `[timestamp, 토큰합] | @tsv` 행 또는 null(걸러짐·오류) */
export function transcriptRow(line) {
  let o;
  try { o = J.parse(line); } catch (e) { if (e instanceof J.JqError) return null; throw e; }
  if (!(o instanceof Map) || o.get('type') !== 'assistant') return null;
  if (J.index(o, 'isSidechain') === true) return null;
  const msg = J.index(o, 'message');
  let u;
  try { u = J.index(msg, 'usage'); } catch (e) { if (e instanceof J.JqError) return null; throw e; }   // `.message.usage?` — 오류는 빈 결과
  if (u === null) return null;
  if (J.alt(J.index(msg, 'model'), '') === '<synthetic>') return null;
  try {
    const g = (k) => J.alt(J.index(u, k), 0);
    const sum = jqAdd(jqAdd(g('input_tokens'), g('cache_read_input_tokens')), g('cache_creation_input_tokens'));
    const positive = typeof sum === 'number' ? sum > 0 : true;   // jq 정렬: 문자열·배열·객체는 0 보다 크다
    if (!positive) return null;
    return `${tsvText(J.index(o, 'timestamp'))}\t${tsvText(sum)}`;
  } catch (e) { if (e instanceof J.JqError) return null; throw e; }
}

function lastUsageRow(tf) {
  let size;
  try { size = statSync(tf).size; } catch { return ''; }
  for (const n of [262144, 2097152, 16777216, 0]) {
    let text;
    try { text = readTail(tf, n, size); } catch { text = ''; }
    let last = '';
    for (const line of text.split('\n')) {
      const r = transcriptRow(line);
      if (r !== null) last = r;
    }
    if (last !== '') return last;
    if (n === 0 || n >= size) break;
  }
  return '';
}

/** main — 종료 코드. {env, cwd, now} 는 맥락(now 는 epoch 초) */
export async function main(argv, { env = process.env, cwd = process.cwd(), now } = {}) {
  const c = new Ctx({ ...env }, cwd);
  const flush = () => { if (c.errs.length) process.stderr.write(c.err); };
  const outLine = (s) => { flush(); process.stdout.write(s); return 0; };
  try {
    coordDefaultRepo(c);
    let sid = '', pid = '', lane = '', win = '';
    const usage = () => { throw new CoordDie(2, USAGE); };
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--pid') { pid = argv[i + 1] ?? ''; if (pid === '') usage(); i++; }
      else if (a === '--lane') { lane = argv[i + 1] ?? ''; if (lane === '') usage(); i++; }
      else if (a === '--window') { win = argv[i + 1] ?? ''; if (win === '' || /[^0-9]/.test(win)) usage(); i++; }
      else if (a === '-h' || a === '--help') {
        process.stderr.write(HELP);
        return 0;
      } else if (a.startsWith('-')) usage();
      else { if (sid !== '') usage(); sid = a; }
    }
    if (`${sid}${pid}${lane}` === '') usage();

    let stateWin = '', sfile = '';
    if (lane !== '') {
      if (!hasRun(c)) throw new CoordDie(3, '현재 회차가 없다(--lane 은 회차가 필요하다)');
      const lg = (sub) => stripNl(laneGet(c, lane, sub).out ?? '');
      sid = lg('.session.session_id');
      pid = lg('.session.pid');
      stateWin = lg('.session.window');
      sfile = sessionFile(c, pid, sid) ?? '';
    } else if (pid !== '') {
      sfile = sessionFile(c, pid, '') ?? '';
      if (sfile === '') return outLine(`CTX pid:${pid} unknown no-session-file\n`);
    } else {
      sfile = sessionFile(c, '', sid) ?? '';
    }
    if (sfile !== '') {
      const t = readText(sfile);
      const s = t === null ? '' : jqRawAt(t, ['sessionId']);
      if (s !== '') sid = s;
    }
    if (sid === '' || sid === 'null') return outLine(`CTX ${lane !== '' ? lane : `pid:${pid}`} unknown no-session-id\n`);
    if (stateWin === '' && hasRun(c)) stateWin = windowBySid(stateFile(c, ''), sid);
    if (!isnum(stateWin)) stateWin = '';
    let defWin = cfgSub(c, '.compact.default_window');
    if (!isnum(defWin)) defWin = '200000';
    const nowS = now ?? Number(nowEpoch());

    const emit = (tokens, w, src, atEpoch) => {
      const wn = Number(w);
      const pct = awkInt(wn > 0 ? (awkAtof(tokens) * 100) / wn + 0.5 : 0);
      return outLine(`CTX ${sid} tokens=${tokens} window=${w} pct=${pct} src=${src} at=${epochToIso(c, atEpoch)}\n`);
    };

    // 1) 덤프
    const dump = `${stateRoot(c)}/ctx/${sid}.json`;
    if (isFile(dump)) {
      const text = readText(dump) ?? '';
      const row = dumpRows(text);
      let dAt = cutF(row, 1);
      const dTok = cutF(row, 2), dSz = cutF(row, 3);
      if (!isnum(dAt)) dAt = stripNl(isoToEpoch(c, dAt));
      try {
        if (isnum(dAt) && isnum(dTok) && BigInt.asIntN(64, BigInt(nowS) - arithVal(dAt)) <= 1800n) {
          let w = win;
          if (!isnum(w)) w = dSz;
          if (!isnum(w)) w = stateWin;
          if (!isnum(w)) w = defWin;
          return emit(dTok, w, 'dump', dAt);
        }
      } catch (e) { if (!(e instanceof ArithAbort)) throw e; c.log(`bash: ${e.message}`); }   // $(( )) 오류: 이 if 명령을 버리고 transcript 로
    }

    // 2) transcript
    const proj = expand(cfgSub(c, '.claude_projects_dir'), c.env);
    let tf = '';
    if (sfile !== '') {
      const t = readText(sfile);
      const cwdS = t === null ? '' : jqRawAt(t, ['cwd']);
      if (cwdS !== '') {
        const cand = `${proj}/${cwdS.replace(/[/.]/g, '-')}/${sid}.jsonl`;
        if (isFile(cand)) tf = cand;
      }
    }
    if (tf === '') {
      let names;
      try { names = readdirSync(proj === '' ? '/' : proj).filter((n) => !n.startsWith('.')).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))); } catch { names = []; }
      for (const n of names) {
        const cand = `${proj}/${n}/${sid}.jsonl`;
        if (isFile(cand)) { tf = cand; break; }
      }
    }
    if (tf === '') return outLine(`CTX ${sid} unknown no-transcript\n`);
    const last = lastUsageRow(tf);
    if (last === '') return outLine(`CTX ${sid} unknown no-usage\n`);
    const tAt = stripNl(isoToEpoch(c, cutF(last, 1)));
    const tTok = cutF(last, 2);
    let w = win;
    if (!isnum(w)) w = stateWin;
    if (!isnum(w)) w = defWin;
    return emit(tTok, w, 'transcript', tAt !== '' ? tAt : String(nowS));
  } catch (e) {
    flush();
    if (e instanceof CoordDie) { process.stderr.write(`${e.message}\n`); return e.rc; }
    throw e;
  }
}
if (isMain(import.meta.url)) scriptMain(main);
