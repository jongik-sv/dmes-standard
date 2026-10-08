// console-input.sh 의 node 판. 입력 요청(확인·선택·질문 창) 판정·발췌·해시·잠금·기록. 정본 설명은 console-input.sh 머리말.
// CLI·스위치 대상: 공개 25함수(brief 8.5). 내부 `_ci_*` 는 이 파일 안에만 둔다. 계약: tests/js-parity/README.md.
//   · jq 로 돌던 두 프로그램(_CI_EXCERPT_JQ 발췌·_CI_FULL_JQ 창 판정)을 같은 순서·같은 규칙으로 옮겼다.
//     jq(Oniguruma) 의 `\s` 는 유니코드 공백(U+0085·NBSP·U+2000-200A…, 단 U+FEFF·U+200B·U+180E 제외)이라 WS 로 따로 정의한다.
//     길이·자르기는 코드포인트 단위(jq 문자열)이고, 입력은 UTF-8 로 읽는다(깨진 바이트는 U+FFFD).
//   · 가림은 console-redact.mjs(screenFilter) — awk 판과 바이트가 같다.
//   · 시계는 `COORD_JS_NOW_MS`(시험용 고정 시각, 없으면 Date.now) — 같은 값을 bash 판은 PATH 앞 가짜 `date` 로 받는다.
//   · 잠금 주인 pid 는 부른 셸의 $$ = env.COORD_JS_CALLER_PID (없으면 부모 pid).
//   · `_ci_timed`(jq 시간 상한) 대응: 판정이 COORD_CONSOLE_WINDOW_TIMEOUT_S(1~30, 기본 3초)를 넘으면 창 없음으로 닫는다(JS 는 훨씬 빨라 실제로는 걸리지 않는다).
//   · 외부 명령은 `date`(compat/common 경유)·`ps`(pstart)뿐. 파일 권한: 쓰는 기록·목록 600 / 새 폴더 700(umask 077 서브셸 대응),
//     표식·잠금 파일은 기본 umask. 윈도우에서는 모드 비트가 의미 없다(bash 판과 같다).
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Ctx, expand, isoToEpoch, pstart, screenPromptKind } from './common.mjs';
import { epochFmt, isWin, statMtime } from './compat.mjs';
import { screenFilter } from './console-redact.mjs';
import * as J from './jq-json.mjs';
import { cliMain, isMain } from './js-cli.mjs';

// ---------- 공통 ----------
const stripNl = (s) => s.replace(/\n+$/, '');
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const sleepMs = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const nowMs = (env) => { const f = env.COORD_JS_NOW_MS; return f != null && /^[0-9]+$/.test(f) ? Number(f) : Date.now(); };
const nowSec = (env) => Math.floor(nowMs(env) / 1000);
const callerPid = (env) => env.COORD_JS_CALLER_PID || String(process.ppid);
const sha256 = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
/** `coord_read1` — 파일 첫 줄(없거나 못 읽으면 빈 값) */
function read1(p) {
  let s;
  try { s = readFileSync(p, 'latin1'); } catch { return ''; }
  const i = s.indexOf('\n');
  return i < 0 ? s : s.slice(0, i);
}
const mk = (d) => { try { mkdirSync(d); return true; } catch { return false; } };
const rmd = (d) => { try { rmdirSync(d); return true; } catch { return false; } };
/** `coord_mkdirp` — 기본 umask */
function mkdirp(d) { if (isDir(d)) return; try { mkdirSync(d, { recursive: true }); } catch { /* 무시 */ } }
/** 바이트 단위 파일 쓰기 후 mv -f */
function writeMv(tmp, dest, data, mode) {
  writeFileSync(tmp, data, { mode });
  renameSync(tmp, dest);
}
/** 소문자 hex 64자 한 줄이면 참 */
export const hex64 = (s) => typeof s === 'string' && s.length === 64 && /^[0-9a-f]{64}$/.test(s);
/** 레인 이름·ref 형식 */
export function refOk(s) {
  s = s ?? '';
  return s !== '' && !s.startsWith('.') && /^[A-Za-z0-9._-]+$/.test(s) && s.length <= 64;
}
/** 기록 이름 `<kind>_<ref>` */
export function nameOk(n) {
  n = n ?? '';
  if (n === 'team_lead_lead') return refOk('lead');
  const m = /^(coord_lane|coord_lead)_([\s\S]+)$/.exec(n);
  return Boolean(m) && refOk(m[2]);
}
const ciDir = (env) => {
  const raw = env.DFLOW_CONSOLE_DIR;
  return expand((raw === '' || raw == null) ? `${env.HOME ?? ''}/.dflow/console` : raw, env);
};
/** bash 산술의 정수 읽기(앞 0 은 8진수). 못 읽으면 null */
function bashInt(s) {
  if (!/^[0-9]+$/.test(s)) return null;
  if (s.length > 1 && s.startsWith('0')) return /^[0-7]+$/.test(s) ? parseInt(s, 8) : null;
  return Number(s);
}
/** `read -r a b` (기본 IFS): 앞 공백 제거, 첫 칸 뒤 나머지(뒤 공백 제거) */
function readWs(line) {
  const s = line.replace(/^[ \t]+/, '');
  const m = /^([^ \t]*)[ \t]*([\s\S]*)$/.exec(s);
  return [m[1], m[2].replace(/[ \t]+$/, '')];
}

// ---------- 문자 규칙 (jq 판과 같은 정의) ----------
const WS = '\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const CTRL_G = /[\u0000-\u001f\u007f-\u009f]/g;
const CTRL = /[\u0000-\u001f\u007f-\u009f]/;
const INVIS_G = /[­̀-ͯ​-‏‪-‮⁠-⁩﻿]/g;
const re = (src) => new RegExp(src);
const R_BODY = re(`^[${WS}│┃║|]*`);
const R_CORE_END = re(`[${WS}│┃║|]*$`);
const R_ISCUR = re(`^(?:❯|›|>)[${WS}]+[^${WS}]`);
const R_ISOPT = re(`^(?:(?:❯|›|>)[${WS}]*)?[0-9]+\\.(?:[${WS}]|$)`);
const R_ISHDR = /(?:Bash command|Edit file|Write file|Read file|Fetch|command)$/;
const R_NONWS = re(`[^${WS}]`);
const R_BLANK = re(`^[${WS}]*$`);
const R_RULE_A = re(`^[${WS}]*╭`);
const R_RULE_B = re(`^[${WS}─]*$`);
const R_HEAD_B = /^─[─ ]*$/;
const R_BCORE_S = re(`^[${WS}│┃║]*`);
const R_BCORE_E = re(`[${WS}│┃║]*$`);
const R_TOOL = /^(?:(?:Bash|Shell|PowerShell) command|(?:Edit|Write|Create|Overwrite|Read|Update) file|Edit notebook|Fetch|Web ?[Ss]earch|Tool use)(?: \([^()]*\))?$/;
const R_HINT = /Esc to cancel|Enter to select|to navigate|Tab to amend/;
const R_IND = re(`^[${WS}│┃║|]*`);
const R_FOLD_CUR = re(`^[${WS}│┃║|]*(?:❯|›|>)[${WS}]+[^${WS}]`);
const R_FOLD_SUB = re(`^([${WS}│┃║|]*)(?:❯|›|>)`);
const R_WSRUN = re(`[${WS}]+`);
const R_WSRUN_G = new RegExp(`[${WS}]+`, 'g');

const cpLen = (s) => (s.length < 2 ? s.length : Array.from(s).length);
const cpSlice = (s, n) => { if (s.length <= n) return s; const a = Array.from(s); return a.length <= n ? s : a.slice(0, n).join(''); };
const trimEndSp = (s) => s.replace(/ +$/, '');
const countCh = (s, ch) => { let n = 0; for (const c of s) if (c === ch) n++; return n; };

// ---------- 발췌 (_CI_EXCERPT_JQ) ----------
const body = (s) => s.replace(R_BODY, '');
const core = (s) => body(s).replace(R_CORE_END, '');
const iscur = (s) => R_ISCUR.test(body(s));
const isopt = (s) => R_ISOPT.test(body(s));
const ishdr = (s) => R_ISHDR.test(core(s));
const cleanLine = (s) => trimEndSp(cpSlice(trimEndSp(s.replace(CTRL_G, '')), 200));

/** 열쇠 줄 사슬 (맨 아래에서 위로, 사이 일반 줄 3줄 이하). 오름차순 */
function chain(K) {
  const rev = [...K].reverse();
  const ch = [rev[0]];
  for (const k of rev.slice(1)) { if (ch[ch.length - 1] - k - 1 <= 3) ch.push(k); else break; }
  return ch.reverse();
}
const byDist = (c) => (a, b) => (Math.abs(a - c) - Math.abs(b - c)) || (b - a);
const range = (a, b) => { const r = []; for (let i = a; i < b; i++) r.push(i); return r; };
const jsonBytes = (arr) => Buffer.byteLength(J.stringify(arr, { indent: 0 }), 'utf8');

/** 가린 화면 글(console_screen_filter 출력, 끝 개행 제거한 것 + "\n" 로 읽음) → 발췌 줄 배열 */
export function excerptLines(text) {
  const parts = text.split('\n');
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  const L = parts.map(cleanLine);
  const n = L.length;
  const K = range(0, n).filter((i) => iscur(L[i]) || isopt(L[i]));
  let sel, keys, cur, cmd;
  if (K.length === 0) { sel = range(Math.max(0, n - 10), n); keys = []; cur = -1; cmd = null; } else {
    const B = chain(K);
    const curs = B.filter((i) => iscur(L[i]));
    const c = curs.length > 0 ? curs[curs.length - 1] : B[B.length - 1];
    const f = B[0], l = B[B.length - 1];
    const e0 = Math.min(n - 1, l + 3);
    const hs = range(0, f).filter((i) => ishdr(L[i]));
    const h = hs.length ? hs[hs.length - 1] : null;
    let cm = null;
    if (h !== null) { const cs = range(h + 1, f).filter((i) => R_NONWS.test(core(L[i]))); cm = cs.length ? cs[0] : null; }
    let sel0;
    if (l - f + 1 <= 10) {
      const s = Math.max(0, Math.min(f, e0 - 9));
      const e = Math.min(e0, s + 9);
      sel0 = range(s, e + 1);
    } else sel0 = [...B].sort(byDist(c)).slice(0, 10).sort((a, b) => a - b);
    if (cm === null || sel0.includes(cm)) sel = sel0; else {
      const all = [c, cm, ...[...B].sort(byDist(c)), ...range(f, l + 1).filter((i) => !B.includes(i)), ...range(cm + 1, f), ...range(l + 1, e0 + 1)];
      const seen = [];
      for (const x of all) if (!seen.includes(x)) seen.push(x);
      sel = seen.slice(0, 10).sort((a, b) => a - b);
    }
    keys = B; cur = c; cmd = cm;
  }
  let items = sel.map((i) => ({ i, t: L[i] }));
  while (items.length > 0 && !R_NONWS.test(items[0].t)) items = items.slice(1);
  while (items.length > 0 && !R_NONWS.test(items[items.length - 1].t)) items = items.slice(0, -1);
  while (jsonBytes(items.map((x) => x.t)) > 2800 && items.length > 1) {
    const nk = items.map((x) => x.i).filter((i) => !keys.includes(i) && i !== cmd);
    let d;
    if (nk.length > 0) d = nk[0]; else {
      const rest = items.map((x) => x.i).filter((i) => i !== cur && i !== cmd).sort((a, b) => (Math.abs(b - cur) - Math.abs(a - cur)) || (a - b));
      d = rest.length ? rest[0] : cmd;
    }
    const next = items.filter((x) => x.i !== d);
    if (next.length === items.length) break;   // jq 판은 d 가 null 이면 끝없이 돈다(도달 불가 — 안전망)
    items = next;
  }
  return items.map((x) => x.t);
}

// ---------- 지문용 줄 정리·창 판정 (_CI_FULL_JQ) ----------
const ANSI1 = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const ANSI2 = /\u001b[\]PX^_][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const ANSI3 = /\u001b[ -/]*[0-~]/g;
function prep(line) {
  const long = line.length > 2000 && cpLen(line) > 2000;
  let s = long ? cpSlice(line, 2000) : line;
  s = s.replace(/\r{1,2}$/, '').replace(ANSI1, '').replace(ANSI2, '').replace(ANSI3, '').replace(/[\t ]/g, ' ');
  const cc = CTRL.test(s);
  return { s: s.replace(CTRL_G, '�').replace(INVIS_G, ''), b: long || cc };
}
const blank = (s) => R_BLANK.test(s);
const isrule = (s) => R_RULE_A.test(s) || (R_RULE_B.test(s) && countCh(s, '─') >= 10);
const ishead = (s) => s.startsWith('╭') || (R_HEAD_B.test(s) && countCh(s, '─') >= 10);
const bcore = (s) => s.replace(R_BCORE_S, '').replace(R_BCORE_E, '');
const vacant = (s) => bcore(s) === '';
const istool = (s) => R_TOOL.test(bcore(s));
const ishint = (s) => R_HINT.test(s);
const ind = (s) => cpLen(R_IND.exec(s)[0]);
function fold(s) {
  let t = s;
  if (R_FOLD_CUR.test(t)) t = t.replace(R_FOLD_SUB, (m, a) => `${a} `);
  return t.replace(R_WSRUN_G, ' ').replace(/^ /, '').replace(/ $/, '');
}
const last = (a) => (a.length ? a[a.length - 1] : null);
const first = (a) => (a.length ? a[0] : null);

/**
 * 화면 원문 글(끝 개행 하나 포함 가능) + kind → 창 결과 Map({text, perm, gen}) 또는 null(창 없음).
 * opts.deadline = 이 시각(ms) 이후면 창 없음.
 */
export function windowOf(text, k, opts = {}) {
  const parts = text.split('\n');
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  const P = parts.map(prep);
  if (opts.deadline != null && Date.now() > opts.deadline) return null;
  const L = P.map((p) => p.s), X = P.map((p) => p.b);
  const n = L.length;
  const K = range(0, n).filter((i) => iscur(L[i]) || isopt(L[i]));
  if (K.length === 0) return null;
  const B = chain(K);
  const f = B[0], l = B[B.length - 1];
  let w;
  if (k === 'permission') {
    const q = last(range(0, f).filter((i) => !vacant(L[i])));
    if (q === null) w = null; else {
      const h0 = last(range(0, q).filter((i) => ishead(L[i])));
      if (h0 === null) w = null; else {
        const t = first(range(h0 + 1, q).filter((i) => !vacant(L[i])));
        w = t !== null && istool(L[t]) ? { h: h0, t, q } : null;
      }
    }
  } else {
    const r = last(range(0, f).filter((i) => isrule(L[i])));
    if (r !== null) w = { h: r, hk: ishead(L[r]) ? 'rule0' : 'rule', b0: r + 1 }; else {
      const p = last(range(0, f).filter((i) => !blank(L[i])));
      if (p === null) w = null; else {
        const b = last(range(0, p + 1).filter((i) => blank(L[i])));
        const h0 = b === null ? 0 : b + 1;
        w = h0 === 0 && n >= 41 ? null : { h: h0, hk: 'para', b0: h0 };
      }
    }
  }
  if (w === null) return null;
  let e = l, go = true, cont = true;
  for (let j = l + 1; j < Math.min(l + 3, n - 1) + 1; j++) {
    if (!go) continue;
    if (ishint(L[j])) { e = j; go = false; } else if (blank(L[j])) cont = false; else if (cont && ind(L[j]) > ind(L[l])) e = j; else go = false;
  }
  for (let i = w.h; i < e + 1; i++) if (X[i]) return null;
  const textOut = [k, ...L.slice(w.h, e + 1).map(fold)].join('\n');
  const M = (pairs) => new Map(pairs);
  let perm = null;
  if (w.t !== undefined) {
    perm = M([
      ['tool', bcore(L[w.t])], ['tind', ind(L[w.t])], ['q', bcore(L[w.q])], ['qind', ind(L[w.q])],
      ['body', range(w.t + 1, w.q).filter((i) => !vacant(L[i])).map((i) => M([['t', bcore(L[i])], ['i', ind(L[i])]]))],
      ['opts', B.filter((i) => i > w.q).map((i) => bcore(L[i]))],
      ['rest', range(w.t + 1, e + 1).filter((i) => !vacant(L[i])).map((i) => bcore(L[i]))],
    ]);
  }
  let gen = null;
  if (k !== 'permission') {
    const hz = last(range(0, f).filter((i) => ishead(L[i])));
    const tz = hz === null ? null : first(range(hz + 1, f).filter((i) => !vacant(L[i])));
    const mi = Math.min(...B.map((i) => ind(L[i])));
    gen = M([
      ['hk', w.hk],
      ['ptool', tz !== null && istool(L[tz])],
      ['blk', range(f, l + 1).every((i) => B.includes(i) || blank(L[i]) || ind(L[i]) > mi)],
      ['pre', range(w.b0, f).filter((i) => !vacant(L[i])).map((i) => bcore(L[i]))],
      ['opts', B.map((i) => bcore(L[i]))],
      ['tail', range(f, e + 1).filter((i) => !vacant(L[i])).map((i) => bcore(L[i]))],
    ]);
  }
  return M([['text', textOut], ['perm', perm], ['gen', gen]]);
}

// ---------- 바이트 입력 → 글 ----------
/** `$(cat)` 처럼: NUL 제거·끝 개행 제거. 반환은 바이트(Buffer) */
function catSub(buf) {
  let b = buf;
  if (b.includes(0)) b = Buffer.from(b.filter((x) => x !== 0));
  let end = b.length;
  while (end > 0 && b[end - 1] === 0x0a) end--;
  return b.subarray(0, end);
}
const utf8 = (buf) => buf.toString('utf8');

// ---------- 공개: 발췌·해시·창 ----------
export function inputKind(buf) {
  const k = screenPromptKind(buf);
  return k === '' ? '' : `${k}\n`;
}
/** console_excerpt_json: {rc, out} */
export function excerptJson(buf) {
  const r = screenFilter(buf);
  if (r.rc !== 0) return { rc: 71 };
  const f = stripNl(utf8(r.out));   // $(…)
  return { rc: 0, out: `${J.stringify(excerptLines(`${f}\n`), { indent: 0 })}\n` };
}
export function excerptText(buf) {
  const j = excerptJson(buf);
  if (j.rc !== 0) return { rc: j.rc };
  const arr = excerptLines(`${stripNl(utf8(screenFilter(buf).out))}\n`);
  return { rc: 0, out: arr.map((x) => `${x}\n`).join('') };
}
const shaClean = (x) => trimEndSp(x.replace(CTRL_G, ''));
/** console_excerpt_sha: 줄들(stdin) → sha */
export function excerptSha(buf) {
  const parts = utf8(buf).split('\n');
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return `${sha256(parts.map(shaClean).join('\n'))}\n`;
}
/** JSON 값들 → jq -j 'map(…)|join("\n")' 출력 이어붙임의 sha. 값 하나가 배열/객체가 아니거나 원소가 글이 아니면 거기서 멈춘다 */
export function shaOfValues(values) {
  let out = '';
  for (const v of values) {
    let elems;
    if (Array.isArray(v)) elems = v; else if (v instanceof Map) elems = [...v.values()]; else break;
    if (elems.some((x) => typeof x !== 'string')) break;
    out += elems.map(shaClean).join('\n');
  }
  return `${sha256(out)}\n`;
}
export function excerptShaJson(buf) {
  const { values } = J.parseStreamPartial(utf8(buf));
  return shaOfValues(values);
}
function windowDeadline(env) {
  let t = env.COORD_CONSOLE_WINDOW_TIMEOUT_S ?? '3';
  if (!/^[0-9]+$/.test(t) || Number(t) < 1 || Number(t) > 30) t = '3';
  return Date.now() + Number(t) * 1000;
}
/** console_window_json: {rc, out} */
export function windowJson(buf, env = process.env) {
  const s = catSub(buf);
  const k = screenPromptKind(Buffer.concat([s, Buffer.from('\n')]));
  if (k === '') return { rc: 1 };
  const w = windowOf(`${utf8(s)}\n`, k, { deadline: windowDeadline(env) });
  if (w === null) return { rc: 1 };
  return { rc: 0, out: `${J.stringify(w, { indent: 0 })}\n` };
}
/** 창 JSON 한 줄 → 지문. 못 만들면 null */
export function fullOfWin(win) {
  let vals;
  try { vals = J.parseStream(win ?? ''); } catch { return null; }
  const outs = [];
  for (const d of vals) {
    try { const v = J.alt(J.index(d, 'text'), undefined); if (v !== undefined) outs.push(typeof v === 'string' ? v : J.tojson(v)); } catch { break; }
  }
  const t = stripNl(outs.join(''));
  if (t === '') return null;
  const h = sha256(t);
  return hex64(h) ? h : null;
}
export function fullSha(buf, env) {
  const w = windowJson(buf, env);
  if (w.rc !== 0) return { rc: 1 };
  const h = fullOfWin(stripNl(w.out));
  return h ? { rc: 0, out: `${h}\n` } : { rc: 1 };
}
/** console_input_snapshot: {rc, globals} */
export function snapshot(file, env) {
  const g = { CI_KIND: '', CI_EXC: '', CI_SHA: '', CI_FULL: '', CI_WIN: '' };
  let buf;
  try { buf = readFileSync(file); } catch { buf = null; }
  // `console_input_kind < file` — 파일을 못 열면 bash 는 리다이렉트 실패(빈 kind → rc 1)
  g.CI_KIND = buf === null ? '' : stripNl(inputKind(buf));
  if (g.CI_KIND === '') return { rc: 1, globals: g };
  const r = screenFilter(buf);
  if (r.rc !== 0) return { rc: 2, globals: g };
  const exc = stripNl(`${J.stringify(excerptLines(`${stripNl(utf8(r.out))}\n`), { indent: 0 })}\n`);
  if (!(exc.startsWith('[') && exc.endsWith(']'))) return { rc: 2, globals: g };
  g.CI_EXC = exc;
  const sha = stripNl(excerptShaJson(Buffer.from(exc, 'utf8')));
  if (!hex64(sha)) { g.CI_EXC = ''; return { rc: 2, globals: g }; }
  g.CI_SHA = sha;
  const w = windowJson(buf, env);
  g.CI_WIN = w.rc === 0 ? stripNl(w.out) : '';
  const full = fullOfWin(g.CI_WIN);
  if (full === null) { g.CI_FULL = ''; g.CI_WIN = ''; } else g.CI_FULL = full;
  return { rc: 0, globals: g };
}

// ---------- 시각 ----------
export function nowMsIso(env) { return new Date(nowMs(env)).toISOString(); }
const ISO_MS_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$/;
export function isoToMs(c, iso) {
  iso = iso ?? '';
  if (!ISO_MS_RE.test(iso)) return null;
  const e = stripNl(isoToEpoch(c, iso));
  if (e === '' || /[^0-9-]/.test(e)) return null;
  let fr = '';
  const dot = iso.indexOf('.');
  if (dot >= 0) { fr = iso.slice(dot + 1); const m = /[Z+-]/.exec(fr); if (m) fr = fr.slice(0, m.index); }
  fr = `${fr}000`.slice(0, 3);
  const en = Number(e);
  if (Number.isNaN(en)) return null;
  return en * 1000 + Number(fr);
}
export function msToIso(c, ms) {
  ms = ms ?? '';
  if (ms === '' || /[^0-9]/.test(ms)) return null;
  const v = bashInt(ms);
  if (v === null) return null;
  const s = Math.floor(v / 1000);
  const head = epochFmt(String(s), '%Y-%m-%dT%H:%M:%S', true, c.env) ?? '';
  return `${head}.${String(v % 1000).padStart(3, '0')}Z`;
}

// ---------- 레인 잠금·보낸 표식 ----------
function killZero(c, pid) {
  if (isWin(c.env)) return spawnSync('kill', ['-0', pid], { env: c.env, stdio: 'ignore', windowsHide: true }).status === 0;
  if (!/^-?[0-9]+$/.test(pid)) return false;
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}
function lockLive(c, d) {
  if (!isDir(d)) return false;
  const p = read1(`${d}/pid`);
  if (p === '') {
    const mt = statMtime(d) ?? '0';
    return nowSec(c.env) - Number(mt) < 5;
  }
  if (!killZero(c, p)) return false;
  const ps = read1(`${d}/pstart`);
  return ps === '' || ps === pstart(c, p);
}
function lockWrite(c, d) {
  const me = callerPid(c.env);
  try { writeFileSync(`${d}/pid`, `${me}\n`); } catch { /* 무시 */ }
  const ps = pstart(c, me);
  try { writeFileSync(`${d}/pstart`, ps === '' ? '' : `${ps}\n`); } catch { /* 무시 */ }
}
export function laneLock(c, lane, waitArg) {
  lane = lane ?? '';
  let wait = waitArg != null && waitArg !== '' ? waitArg : (c.env.COORD_CONSOLE_LANE_LOCK_WAIT_S || '10');
  if (!refOk(lane)) return 1;
  if (wait === '' || /[^0-9]/.test(wait)) wait = '10';
  const d = `${ciDir(c.env)}/lock/lane-${lane}`, m = `${d}.steal`;
  mkdirp(d.slice(0, d.lastIndexOf('/')));
  const n = (bashInt(wait) ?? 10) * 5;
  let i = 0;
  const me = callerPid(c.env);
  for (;;) {
    if (mk(d)) { lockWrite(c, d); return 0; }
    if (read1(`${d}/pid`) === me) return 0;
    if (!lockLive(c, d) && mk(m)) {
      if (!lockLive(c, d)) {
        const st = `${d}.stale.${me}`;
        try { renameSync(d, st); } catch { /* 무시 */ }
        try { rmSync(st, { recursive: true, force: true }); } catch { /* 무시 */ }
        if (mk(d)) { lockWrite(c, d); rmd(m); return 0; }
      }
      rmd(m);
    } else if (isDir(m) && nowSec(c.env) - Number(statMtime(m) ?? '0') >= 10) rmd(m);
    i += 1;
    if (i >= n) return 1;
    sleepMs(200);
  }
}
export function laneUnlock(c, lane) {
  if (!refOk(lane)) return 0;
  const d = `${ciDir(c.env)}/lock/lane-${lane}`;
  if (read1(`${d}/pid`) === callerPid(c.env)) { try { rmSync(d, { recursive: true, force: true }); } catch { /* 무시 */ } }
  return 0;
}
export function laneMarkSent(c, lane, sha) {
  if (!refOk(lane)) return 0;
  const d = `${ciDir(c.env)}/lock`;
  mkdirp(d);
  const tmp = `${d}/lane-${lane}.sent.tmp.${callerPid(c.env)}`;
  try { writeMv(tmp, `${d}/lane-${lane}.sent`, `${nowSec(c.env)} ${sha != null && sha !== '' ? sha : '-'}\n`, 0o666); return 0; } catch { return 1; }
}
export function laneRecentSend(c, lane, sha) {
  lane = lane ?? '';
  let g = c.env.COORD_CONSOLE_SENT_GRACE_S ?? '10';
  if (!refOk(lane)) return 1;
  if (g === '' || /[^0-9]/.test(g)) g = '10';
  let txt;
  try { txt = readFileSync(`${ciDir(c.env)}/lock/lane-${lane}.sent`, 'latin1'); } catch { return 1; }
  const nl = txt.indexOf('\n');
  if (nl < 0) return 1;   // read 가 개행 없이 끝나면 실패
  const [t, s] = readWs(txt.slice(0, nl));
  if (t === '' || /[^0-9]/.test(t)) return 1;
  const tv = bashInt(t);
  if (tv === null) return 1;
  if (!(nowSec(c.env) - tv < Number(g))) return 1;
  const want = sha ?? '';
  return s === '-' || (want === '' ? '-' : want) === '-' || s === want ? 0 : 1;
}

// ---------- 소비 목록 ----------
const consumedFile = (env, name) => `${ciDir(env)}/input/consumed/${name}.list`;
const consumedFullFile = (env, name) => `${ciDir(env)}/input/consumed/${name}.full`;
function listAdd(c, file, since, value) {
  const dir = file.slice(0, file.lastIndexOf('/'));
  if (!isDir(dir)) { try { mkdirSync(dir, { recursive: true, mode: 0o700 }); } catch { return 1; } if (!isDir(dir)) return 1; }
  const neu = `${since} ${value}`;
  const ls = [];
  if (isFile(file)) {
    let txt = '';
    try { txt = readFileSync(file, 'latin1'); } catch { /* 빈 것으로 */ }
    const rows = txt.split('\n');
    if (rows[rows.length - 1] === '') rows.pop();
    for (const l of rows) { if (l === neu) return 0; ls.push(l); }
  }
  ls.push(neu);
  const keep = ls.length > 20 ? ls.slice(ls.length - 20) : ls;
  const tmp = `${file}.tmp.${callerPid(c.env)}`;
  try { writeMv(tmp, file, Buffer.from(keep.map((x) => `${x}\n`).join(''), 'latin1'), 0o600); return 0; } catch { return 1; }
}
export function consumedAdd(c, name, since, sha, full) {
  if (!nameOk(name)) return 1;
  if (!hex64(sha ?? '')) return 1;
  if (isoToMs(c, since) === null) return 1;
  if (listAdd(c, consumedFile(c.env, name), since, sha) !== 0) return 1;
  if (full != null && full !== '') {
    if (!hex64(full)) return 1;
    if (listAdd(c, consumedFullFile(c.env, name), since, full) !== 0) return 1;
  }
  return 0;
}
const CANON_ISO = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
function listHas(c, file, want, val) {
  if (!isFile(file)) return false;
  let txt;
  try { txt = readFileSync(file, 'latin1'); } catch { return false; }
  const rows = txt.split('\n');
  rows.pop();   // `read` 는 개행으로 끝난 줄만 돈다(마지막 토막은 버린다)
  for (const row of rows) {
    const [s, h] = readWs(row);
    if (val !== '' && h !== val) continue;
    if (CANON_ISO.test(s)) { if (s === want) return true; } else {
      const ms = isoToMs(c, s);
      const back = ms === null ? null : msToIso(c, String(ms));
      if (back !== null && back === want) return true;
    }
  }
  return false;
}
function wantIso(c, since) {
  const ms = isoToMs(c, since);
  if (ms === null) return null;
  return msToIso(c, String(ms));
}
export function consumedHas(c, name, since, sha, full) {
  if (!nameOk(name)) return 1;
  const want = wantIso(c, since);
  if (want === null) return 1;
  if (listHas(c, consumedFile(c.env, name), want, sha ?? '')) return 0;
  if (full != null && full !== '' && listHas(c, consumedFullFile(c.env, name), want, full)) return 0;
  return 1;
}
export function consumedHasSince(c, name, since) {
  if (!nameOk(name)) return 1;
  const want = wantIso(c, since);
  if (want === null) return 1;
  return listHas(c, consumedFile(c.env, name), want, '') || listHas(c, consumedFullFile(c.env, name), want, '') ? 0 : 1;
}

// ---------- 기록 파일 ----------
export const inputFile = (env, name) => `${ciDir(env)}/input/${name}.json`;
export function recLock(c, name) {
  if (!nameOk(name)) return 1;
  const d = `${ciDir(c.env)}/input/.${name}.lock`;
  mkdirp(d.slice(0, d.lastIndexOf('/')));
  let i = 0;
  const t0 = Date.now();
  while (!mk(d)) {
    if (nowSec(c.env) - Number(statMtime(d) ?? '0') >= 10) { rmd(d); if (Date.now() - t0 > 30000) return 1; continue; }   // bash 판은 끝없이 돈다 — 안전 상한 30초(의심 목록)
    i += 1;
    if (i >= 30) return 1;
    sleepMs(100);
  }
  return 0;
}
export function recUnlock(c, name) {
  if (nameOk(name)) rmd(`${ciDir(c.env)}/input/.${name}.lock`);
  return 0;
}
export function inputWrite(c, name, json) {
  if (!nameOk(name)) return 1;
  const f = inputFile(c.env, name);
  const dir = f.slice(0, f.lastIndexOf('/'));
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${f}.tmp.${callerPid(c.env)}`;
    writeFileSync(tmp, `${json ?? ''}\n`, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, f);
    return 0;
  } catch { return 1; }
}
/** 처리 표시. {rc, globals:{CI_MH_REC, CI_MH_CONS}} */
export function markHandled(c, name, by, want) {
  const g = { CI_MH_REC: '', CI_MH_CONS: '1' };
  if (!nameOk(name)) return { rc: 4, globals: g };
  if (by !== 'coordinator' && by !== 'auto') return { rc: 4, globals: g };
  const f = inputFile(c.env, name);
  if (recLock(c, name) !== 0) return { rc: 4, globals: g };
  let cur = '';
  try { cur = stripNl(readFileSync(f, 'utf8')); } catch { cur = ''; }
  // jq -e 'type == "object"' — 끝까지 읽혀야 하고 마지막 값이 객체여야 한다
  const { values, error } = J.parseStreamPartial(cur);
  if (error || values.length === 0 || !(values[values.length - 1] instanceof Map)) { recUnlock(c, name); return { rc: 1, globals: g }; }
  const raw = (key) => stripNl(jqOutputsText(cur, (d) => { const v = J.alt(J.index(d, key), undefined); return v === undefined ? undefined : J.tostring(v); }));
  let full = raw('full');
  if (!hex64(full)) full = '';
  if (want != null && want !== '' && full !== want) { recUnlock(c, name); return { rc: 2, globals: g }; }
  const since = raw('since');
  const sha = stripNl(shaOfValues(valuesOf(cur, (d) => J.alt(J.index(d, 'excerpt'), []))));
  const at = nowMsIso(c.env);
  const news = stripNl(jqOutputsText(cur, (d) => {
    let m;
    if (d instanceof Map) m = new Map(d); else if (d === null) m = new Map(); else throw new J.JqError(`Cannot index ${J.typeName(d)} with "handled"`, 5);
    m.set('handled', new Map([['by', by], ['at', at]]));
    return J.stringify(m, { indent: 0 });
  }));
  if (news === '' || inputWrite(c, name, news) !== 0) { recUnlock(c, name); return { rc: 4, globals: g }; }
  if (consumedAdd(c, name, since, sha, full) !== 0) g.CI_MH_CONS = '0';
  recUnlock(c, name);
  g.CI_MH_REC = cur;
  return { rc: 0, globals: g };
}
/** 글 한 덩이에서 jqOutputs 처럼(오류 시 거기서 멈춤) 출력을 모아 줄로 잇는다 */
function jqOutputsText(text, fn) {
  const outs = [];
  const { values } = J.parseStreamPartial(text);
  for (const d of values) {
    try { const r = fn(d); if (r !== undefined) outs.push(r); } catch (e) { if (e instanceof J.JqError) break; throw e; }
  }
  return outs.join('\n');
}
function valuesOf(text, fn) {
  const out = [];
  const { values } = J.parseStreamPartial(text);
  for (const d of values) {
    try { out.push(fn(d)); } catch (e) { if (e instanceof J.JqError) break; throw e; }
  }
  return out;
}
export function inputNotify(c, name) {
  if (!nameOk(name)) return 1;
  const d = `${ciDir(c.env)}/input/.notify`;
  mkdirp(d);
  if (!isDir(d)) return 1;
  try { writeFileSync(`${d}/${name}`, ''); return 0; } catch { return 1; }
}

// ---------- CLI ----------
const wrap = (fn, { stdin = false } = {}) => ({
  stdin,
  run: ({ args, stdin: buf, env, cwd }) => { const c = new Ctx(env, cwd); const r = fn(c, args, buf) ?? {}; return { ...r, err: c.err }; },
});
const rcOnly = (fn) => wrap((c, a) => ({ rc: fn(c, ...a) }));
export const functions = {
  console_input_ref_ok: { run: ({ args }) => ({ rc: refOk(args[0] ?? '') ? 0 : 1 }) },
  console_input_kind: wrap((c, a, buf) => ({ out: inputKind(buf) }), { stdin: true }),
  console_excerpt_json: wrap((c, a, buf) => excerptJson(buf), { stdin: true }),
  console_excerpt: wrap((c, a, buf) => excerptText(buf), { stdin: true }),
  console_excerpt_sha: wrap((c, a, buf) => ({ out: excerptSha(buf) }), { stdin: true }),
  console_excerpt_sha_json: wrap((c, a, buf) => ({ out: excerptShaJson(buf) }), { stdin: true }),
  console_window_json: wrap((c, a, buf) => windowJson(buf, c.env), { stdin: true }),
  console_full_sha: wrap((c, a, buf) => fullSha(buf, c.env), { stdin: true }),
  console_input_snapshot: wrap((c, a) => snapshot(a[0] ?? '', c.env)),
  console_now_ms_iso: wrap((c) => ({ out: nowMsIso(c.env) })),
  console_iso_to_ms: wrap((c, a) => { const v = isoToMs(c, a[0] ?? ''); return v === null ? { rc: 1 } : { out: `${v}\n` }; }),
  console_ms_to_iso: wrap((c, a) => { const v = msToIso(c, a[0] ?? ''); return v === null ? { rc: 1 } : { out: `${v}\n` }; }),
  console_lane_lock: wrap((c, a) => ({ rc: laneLock(c, a[0], a[1]) })),
  console_lane_unlock: rcOnly((c, lane) => laneUnlock(c, lane)),
  console_lane_mark_sent: rcOnly((c, lane, sha) => laneMarkSent(c, lane, sha)),
  console_lane_recent_send: rcOnly((c, lane, sha) => laneRecentSend(c, lane, sha)),
  console_consumed_add: rcOnly((c, name, since, sha, full) => consumedAdd(c, name, since, sha, full)),
  console_consumed_has: rcOnly((c, name, since, sha, full) => consumedHas(c, name, since, sha, full)),
  console_consumed_has_since: rcOnly((c, name, since) => consumedHasSince(c, name, since)),
  console_input_file: wrap((c, a) => ({ out: inputFile(c.env, a[0] ?? '') })),
  console_input_rec_lock: rcOnly((c, name) => recLock(c, name)),
  console_input_rec_unlock: rcOnly((c, name) => recUnlock(c, name)),
  console_input_write: rcOnly((c, name, json) => inputWrite(c, name, json)),
  console_input_mark_handled: wrap((c, a) => markHandled(c, a[0] ?? '', a[1] ?? '', a[2] ?? '')),
  console_input_notify: rcOnly((c, name) => inputNotify(c, name)),
};
if (isMain(import.meta.url)) cliMain(functions);
