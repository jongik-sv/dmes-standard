#!/usr/bin/env node
// Mantine 9 LLM 문서 조회 + v9 사용법 점검 도구.
//
// mantine.dev 가 배포하는 llms.txt(인덱스) · 페이지별 .md · llms-full.txt 를
// ~/.cache/mantine-llms/ 에 캐시해 두고 필요한 부분만 꺼내 본다.
//
//   node mantine_docs.mjs version                  # 설치된 @mantine/* 버전
//   node mantine_docs.mjs search <단어...>          # 인덱스에서 페이지 찾기
//   node mantine_docs.mjs get <이름|slug> [--section Props]
//   node mantine_docs.mjs grep <정규식> [-C 3]      # llms-full.txt 전문 검색
//   node mantine_docs.mjs official <combobox|form|custom-components> [skill|api|patterns]
//   node mantine_docs.mjs audit <경로...>           # v8 이하 API·금지 패턴 점검
//   node mantine_docs.mjs refresh                  # 캐시 비우기
//
// ── python 판(tests/golden/legacy/mantine_docs.legacy.py)과 달라진 점 ──────────────────────────
//  - 실행: `python3 mantine_docs.py …` → `node mantine_docs.mjs …`(node 18.17 이상, 외부 의존성 없음). 안내 문구 속 파일 이름도 바뀐다.
//  - 네트워크: urllib 대신 node 전역 fetch(제한 60초). User-Agent `mantine-ui-skill`·캐시 폴더(MANTINE_LLMS_CACHE, 기본 ~/.cache/mantine-llms)·
//    파일 이름 규칙·TTL(7일, mtime 기준)은 같아서 두 판이 캐시를 공유한다. HTTP 오류·네트워크 오류 문구는 `HTTP Error 404: Not Found`·
//    `<urlopen error …>` 모양으로 맞췄지만 세부 원인 문구(DNS 오류 번호 등)는 다를 수 있다. node 18 의 fetch ExperimentalWarning 은 억제한다.
//  - 사용 오류(argparse): 종료 코드 2 는 같지만 stderr 문구는 공용 헬퍼(_shared/node/args.mjs)의 한국어 `사용: …`·`오류: …` 이다.
//    긴 옵션 약어(`--sec`)와 `--` 는 받지 않는다. `--limit -3`·`-C -1` 같은 옵션 값 자리의 음수는 python 처럼 받는다(glue_negative_numbers).
//    위치 인자 자리의 음수(`search -3`)는 받지 않는다. `--C`(긴 형태)는 python 에 없지만 여기서는 받는다.
//    -h/--help 는 종료 코드 0 이고, 머리말의 사용 예 블록(node 호출 형태)을 보여 준다(문구 나머지는 공용 헬퍼 형식).
//  - grep 의 정규식은 python re 문법을 JS 로 옮겨 쓴다(_shared pyRe + 이 파일의 pyReU: \s·\b·\w 는 python 처럼 유니코드 기준).
//    정규식이 잘못되었거나 옮길 수 없는 구문이면 python 은 Traceback(종료 1)이고 여기서는 한 줄 오류 + 종료 1 이다.
//  - audit: 파일 열거 순서는 python rglob(파일시스템 순서)이 아니라 경로 성분별 코드포인트 순으로 고정한다(결과 집합은 같다.
//    골든 비교는 파일 단위로 묶어 정렬해 맞춘다). 깨진 UTF-8 은 python errors="ignore" 처럼 해당 바이트를 버린다.
//  - 캐시 파일은 python read_text 처럼 CRLF·CR 을 LF 로 읽고 BOM 은 지우지 않는다. 쓸 때는 받은 내용 그대로(LF 고정) 쓴다.
//  - `refresh` 는 python shutil.rmtree(ignore_errors) 처럼 폴더가 아닌 것·심볼릭 링크는 지우지 않는다.
//  - 환경 변수 MANTINE_LLMS_CACHE 가 빈 문자열이면 설정하지 않은 것으로 본다(python 은 Path("") = "." 이라 `refresh` 가 현재 폴더 안을 지운다).
//  - 시험 전용 통로: 환경 변수 MANTINE_LLMS_BASE(기본 https://mantine.dev; 인덱스·llms-full·인덱스가 적은 페이지 URL 의 기준)·
//    MANTINE_OFFICIAL_RAW(공식 스킬 raw 주소)가 있으면 기준 URL 을 바꾼다(로컬 가짜 서버·닫힌 포트용, 평소에는 설정하지 않는다).
//  - 시험 전용 통로: export 한 `hooks`(get·out·err 교체)·`main(argv)`·`fetch_text()`·`http_get()`(실제 fetch 한 번). 명령줄 사용에는 영향이 없다.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCli, finish, OK, VIOLATION } from '../../_shared/node/args.mjs';
import { walkSorted } from '../../_shared/node/paths.mjs';
import { compareCodePoint, pyRe, splitlinesPy } from '../../_shared/node/pytext.mjs';

const SITE_BASE = 'https://mantine.dev';
// 시험 전용 통로: 환경 변수 MANTINE_LLMS_BASE·MANTINE_OFFICIAL_RAW 가 있으면 기준 URL 을 바꾼다(빈 값은 설정 안 한 것).
// 인덱스가 적어 둔 페이지 URL(https://mantine.dev/…)도 같은 기준으로 바꿔, 캐시에 없는 페이지가 실제 인터넷으로 나가지 않게 한다.
const BASE = process.env.MANTINE_LLMS_BASE || SITE_BASE;
const INDEX_URL = `${BASE}/llms.txt`;
const FULL_URL = `${BASE}/llms-full.txt`;
const OFFICIAL_RAW = process.env.MANTINE_OFFICIAL_RAW || 'https://raw.githubusercontent.com/mantinedev/skills/HEAD/skills';
const rebase = (url) => (BASE !== SITE_BASE && url.startsWith(SITE_BASE) ? BASE + url.slice(SITE_BASE.length) : url);
const TTL_SECONDS = 7 * 24 * 3600;
const USER_AGENT = 'mantine-ui-skill';

// ---------------------------------------------------------------------------
// python 호환 작은 도구
// ---------------------------------------------------------------------------

/** python str.isspace() 가 참인 문자(정규식 문자 클래스 안에 그대로 넣는 소스). */
const PY_WS = ' \\t\\n\\r\\f\\v\\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const WS_ENDS = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, 'g');
/** python str.strip() */
export const pyStrip = (s) => s.replace(WS_ENDS, '');

const WORD = '\\p{L}\\p{N}_';
const WORD_CHAR = new RegExp(`^[${WORD}]$`, 'u');
/** python 의 `\w` 와 같은 한 글자 판정(코드포인트 한 글자 문자열). */
export const isWordChar = (ch) => ch !== '' && WORD_CHAR.test(ch);
const BOUNDARY = `(?:(?<=[${WORD}])(?![${WORD}])|(?<![${WORD}])(?=[${WORD}]))`;
const NOT_BOUNDARY = `(?:(?<=[${WORD}])(?=[${WORD}])|(?<![${WORD}])(?![${WORD}]))`;
const SYNTAX = new Set('^$\\.*+?()[]{}|/');

/**
 * python re 문법 소스를 JS(u 플래그) RegExp 로 옮긴다. python 처럼 `\s`·`\w`·`\d`·`\b` 가 유니코드 기준이다.
 * `\"` 같은 불필요한 이스케이프는 문자로, 뜻이 있는 `{` `}` 만 수량자로 둔다. 나머지는 _shared pyRe 에 맡긴다.
 */
export function pyReU(source, flags = '') {
  let out = '';
  let i = 0;
  let inClass = false;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    if (c === '\\') {
      const d = source[i + 1];
      if (d === undefined) throw new Error('끝에 남은 역슬래시');
      i += 2;
      if (inClass) {
        if (d === 's') out += PY_WS;
        else if (d === 'b') out += '\\x08';
        else if (/[A-Za-z0-9]/.test(d) || SYNTAX.has(d) || d === '-') out += c + d;
        else out += d;
      } else if (d === 's') out += `[${PY_WS}]`;
      else if (d === 'S') out += `[^${PY_WS}]`;
      else if (d === 'b') out += BOUNDARY;
      else if (d === 'B') out += NOT_BOUNDARY;
      else if (/[A-Za-z0-9]/.test(d) || SYNTAX.has(d)) out += c + d;
      else out += d;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      out += c;
      i++;
      continue;
    }
    if (c === '[') {
      inClass = true;
      out += '[';
      i++;
      if (source[i] === '^') { out += '^'; i++; }
      if (source[i] === ']') { out += '\\]'; i++; }
      continue;
    }
    if (c === '{') {
      const rest = source.slice(i);
      let m = /^\{\d+(?:,\d*)?\}/.exec(rest);
      if (m) { out += m[0]; i += m[0].length; continue; }
      m = /^\{,(\d+)\}/.exec(rest);
      if (m) { out += `{0,${m[1]}}`; i += m[0].length; continue; }
      out += '\\{';
      i++;
      continue;
    }
    if (c === '}') { out += '\\}'; i++; continue; }
    out += c;
    i++;
  }
  return pyRe(out, flags, { unicode: true });
}

/** python `re.search(rf"\b{re.escape(name)}\b", text)` 와 같은 판정(글자 그대로 찾고 양끝 경계를 본다). */
export function hasWordBounded(text, name) {
  if (name === '') return new RegExp(`[${WORD}]`, 'u').test(text); // \b\b: 글자가 하나라도 있으면 경계가 있다
  const first = [...name][0];
  const lastCh = [...name].pop();
  let from = 0;
  for (;;) {
    const at = text.indexOf(name, from);
    if (at < 0) return false;
    const before = at > 0 ? lastCodePoint(text.slice(Math.max(0, at - 2), at)) : '';
    const afterIdx = at + name.length;
    const after = afterIdx < text.length ? String.fromCodePoint(text.codePointAt(afterIdx)) : '';
    if (isWordChar(before) !== isWordChar(first) && isWordChar(lastCh) !== isWordChar(after)) return true;
    from = at + 1;
  }
}
function lastCodePoint(s) {
  const a = [...s];
  return a.length ? a[a.length - 1] : '';
}

// pathlib(posix) 이 경로 문자열을 정리하는 규칙: 빈 성분·`.` 제거, 맨 앞 `//` 두 개만 유지.
function splitPyPath(p) {
  if (process.platform === 'win32') {
    const q = p.replace(/\//g, '\\');
    const m = /^(?:([A-Za-z]:)|\\\\([^\\]+)\\([^\\]+))?(\\)?/.exec(q);
    let anchor = '';
    if (m[1]) anchor = m[1] + (m[4] ?? '');
    else if (m[2]) anchor = `\\\\${m[2]}\\${m[3]}\\`;
    else if (m[4]) anchor = '\\';
    const parts = q.slice(m[0].length).split('\\').filter((x) => x !== '' && x !== '.');
    return { anchor, parts };
  }
  let anchor = '';
  if (p.startsWith('/')) anchor = p.startsWith('//') && !p.startsWith('///') ? '//' : '/';
  return { anchor, parts: p.split('/').filter((x) => x !== '' && x !== '.') };
}
const joinPy = (anchor, parts) => anchor + parts.join(path.sep) || '.';
/** python str(Path(p)) */
export const pyPathStr = (p) => { const { anchor, parts } = splitPyPath(p); return joinPy(anchor, parts); };

/** python Path.read_text(encoding="utf-8"): universal newlines(CRLF·CR → LF), BOM 은 그대로 둔다. */
export const readPy = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');

const pad = (s, w) => { const len = [...s].length; return len >= w ? s : s + ' '.repeat(w - len); };

// ---------------------------------------------------------------------------
// 입출력·네트워크 통로 (시험에서 교체한다)
// ---------------------------------------------------------------------------

/** python sys.exit("문자열") 에 해당: 문자열을 stderr 에 쓰고 종료 코드 1. */
export class Die extends Error {}

/** get(url) → Promise<{status:number, statusText?:string, body:Buffer}>. null 이면 전역 fetch 를 쓴다. */
export const hooks = {
  get: null,
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
};
const print = (s = '') => hooks.out(`${s}\n`);

const HTTP_REASONS = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found',
  303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
  408: 'Request Timeout', 410: 'Gone', 429: 'Too Many Requests', 500: 'Internal Server Error',
  501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};

export async function http_get(url) {
  // node 18 의 fetch 는 처음 쓸 때 ExperimentalWarning 을 stderr 에 찍는다. python 판과 stderr 를 맞추려고 그 경고만 막는다.
  const orig = process.emitWarning;
  process.emitWarning = function emitWarning(w, ...rest) {
    const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type;
    if (type === 'ExperimentalWarning' && /fetch/i.test(String(w?.message ?? w))) return undefined;
    return orig.call(process, w, ...rest);
  };
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
    return { status: res.status, statusText: res.statusText, body: Buffer.from(await res.arrayBuffer()) };
  } finally {
    process.emitWarning = orig;
  }
}

function describeError(err) {
  const cause = err && err.cause;
  return `<urlopen error ${(cause && (cause.code || cause.message)) || err.message}>`;
}

async function download(url) {
  let res;
  try {
    res = await (hooks.get ?? http_get)(url);
  } catch (err) {
    throw new Error(err && err.pyMessage ? err.pyMessage : describeError(err));
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP Error ${res.status}: ${HTTP_REASONS[res.status] ?? res.statusText ?? ''}`);
  }
  // python decode("utf-8") 처럼 깨진 바이트가 있으면 오류, BOM 은 그대로 둔다
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(res.body);
}

/** python fetch(): 캐시가 TTL 안이면 그대로, 아니면 내려받아 저장. 실패하면 오래된 캐시라도 쓴다. */
export async function fetch_text(url, dest, ttl = TTL_SECONDS) {
  let st = null;
  try { st = fs.statSync(dest); } catch { /* 없음 */ }
  if (st && (Date.now() - st.mtimeMs) / 1000 < ttl) return readPy(dest);
  let body;
  try {
    body = await download(url);
  } catch (exc) { // 네트워크가 막혀도 오래된 캐시는 쓴다
    if (st) {
      hooks.err(`[warn] ${url} 조회 실패(${exc.message}) — 오래된 캐시 사용\n`);
      return readPy(dest);
    }
    throw new Die(`[error] ${url} 조회 실패: ${exc.message}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body, 'utf8');
  return body;
}

function cacheDir() {
  const env = process.env.MANTINE_LLMS_CACHE;
  return env ? pyPathStr(env) : path.join(os.homedir(), '.cache', 'mantine-llms');
}

// ---------------------------------------------------------------------------
// 색인
// ---------------------------------------------------------------------------

const INDEX_LINE = new RegExp(`^- \\[([^\\]]+)\\]\\(([^)]+)\\)(?::[${PY_WS}]*(.*))?$`);

export async function load_index() {
  const text = await fetch_text(INDEX_URL, path.join(cacheDir(), 'llms.txt'));
  let section = '';
  const rows = [];
  for (const line of splitlinesPy(text)) {
    if (line.startsWith('## ')) {
      section = pyStrip(line.slice(3));
      continue;
    }
    const m = INDEX_LINE.exec(pyStrip(line));
    if (m && m[2].includes('/llms/')) {
      let slug = m[2].slice(m[2].lastIndexOf('/') + 1);
      if (slug.endsWith('.md')) slug = slug.slice(0, -3);
      rows.push({ section, title: m[1], slug, url: m[2], desc: pyStrip(m[3] ?? '') });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 명령
// ---------------------------------------------------------------------------

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function fileExists(p) {
  try { fs.statSync(p); return true; } catch { return false; }
}
function readDirNames(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

export function cmd_version() {
  const here = fs.realpathSync(process.cwd());
  const ancestors = [];
  for (let a = here; ; ) {
    ancestors.push(a);
    const up = path.dirname(a);
    if (up === a) break;
    a = up;
  }
  const bases = [];
  for (const a of ancestors) bases.push(a, path.join(a, 'src', 'frontend'));
  for (const base of bases) {
    const nm = path.join(base, 'node_modules');
    const scope = path.join(nm, '@mantine');
    let pkgs = [];
    if (isDir(scope)) {
      pkgs = readDirNames(scope).sort(compareCodePoint)
        .filter((d) => isDir(path.join(scope, d)) && fileExists(path.join(scope, d, 'package.json')))
        .map((d) => path.join(scope, d, 'package.json'));
    }
    const pnpm = path.join(nm, '.pnpm');
    if (pkgs.length === 0 && isDir(pnpm)) {
      const found = [];
      for (const d1 of readDirNames(pnpm)) {
        if (!/^@mantine\+.*@/s.test(d1)) continue;
        const sc = path.join(pnpm, d1, 'node_modules', '@mantine');
        if (!isDir(path.join(pnpm, d1, 'node_modules')) || !isDir(sc)) continue;
        for (const d4 of readDirNames(sc)) {
          if (isDir(path.join(sc, d4)) && fileExists(path.join(sc, d4, 'package.json'))) found.push([d1, d4, path.join(sc, d4, 'package.json')]);
        }
      }
      found.sort((a, b) => compareCodePoint(a[0], b[0]) || compareCodePoint(a[1], b[1]));
      pkgs = found.map((x) => x[2]);
    }
    if (pkgs.length) {
      const seen = new Map();
      for (const pj of pkgs) {
        const meta = JSON.parse(readPy(pj));
        if (meta.name === undefined || meta.version === undefined) throw new Error(`KeyError: ${pj}`);
        if (!seen.has(meta.name)) seen.set(meta.name, new Set());
        seen.get(meta.name).add(meta.version);
      }
      for (const name of [...seen.keys()].sort(compareCodePoint)) {
        print(`${name} ${[...seen.get(name)].sort(compareCodePoint).join(', ')}`);
      }
      print(`[${nm}]`);
      return OK;
    }
  }
  print('node_modules 에서 @mantine/* 를 찾지 못했다. 저장소 안에서 실행하거나 package.json 을 확인한다.');
  return OK;
}

export async function cmd_search(args) {
  const terms = args.terms.map((t) => t.toLowerCase());
  let hits = (await load_index()).filter((r) => {
    const hay = `${r.title} ${r.slug} ${r.desc}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  if (args.section) hits = hits.filter((r) => r.section.toLowerCase() === args.section.toLowerCase());
  for (const r of hits.slice(0, args.limit)) {
    print(`[${r.section}] ${pad(r.title, 28)} ${pad(r.slug, 40)} ${r.desc}`);
  }
  if (hits.length === 0) print('일치 없음. 단어를 줄이거나 `grep` 으로 전문 검색한다.');
  return OK;
}

export async function resolve(name) {
  const rows = await load_index();
  let key = name.toLowerCase();
  if (key.endsWith('.md')) key = key.slice(0, -3);
  const preds = [
    (r) => r.slug === key,
    (r) => r.title.toLowerCase() === key,
    (r) => [`core-${key}`, `hooks-${key}`, `dates-${key}`, `x-${key}`].includes(r.slug),
  ];
  for (const pred of preds) {
    const match = rows.filter(pred);
    if (match.length) return match[0];
  }
  throw new Die(`[error] '${name}' 페이지를 인덱스에서 찾지 못했다. \`search ${name}\` 로 slug 를 확인한다.`);
}

const HEADING = new RegExp(`^(#{1,6})[${PY_WS}]+(.*)`);

export async function cmd_get(args) {
  const row = await resolve(args.name);
  const text = await fetch_text(rebase(row.url), path.join(cacheDir(), 'pages', `${row.slug}.md`));
  if (!args.section) {
    print(text);
    return OK;
  }
  // 지정한 제목(## / ###)부터 같은 수준 이상의 다음 제목 전까지만 출력
  const out = [];
  let depth = null;
  const want = args.section.toLowerCase();
  const lines = splitlinesPy(text);
  for (const line of lines) {
    const h = HEADING.exec(line);
    if (h && depth !== null && h[1].length <= depth) depth = null;
    if (h && depth === null && h[2].toLowerCase().includes(want)) depth = h[1].length;
    if (depth !== null) out.push(line);
  }
  print(out.length ? out.join('\n')
    : `'${args.section}' 제목 없음. 제목 목록:\n${lines.filter((l) => l.startsWith('#')).join('\n')}`);
  return OK;
}

export async function cmd_grep(args) {
  const lines = splitlinesPy(await fetch_text(FULL_URL, path.join(cacheDir(), 'llms-full.txt')));
  let pat;
  try {
    pat = pyReU(args.pattern, 'i');
  } catch (err) {
    throw new Die(`[error] 정규식을 해석하지 못했다: ${err.message}`);
  }
  let shown = 0;
  for (let i = 0; i < lines.length; i++) {
    if (pat.test(lines[i])) {
      const lo = Math.max(0, i - args.C);
      const hi = Math.min(lines.length, i + args.C + 1);
      print(`--- L${i + 1}`);
      print(lines.slice(lo, hi).join('\n'));
      shown++;
      if (shown >= args.limit) {
        print(`... ${args.limit}건에서 중단 (--limit 로 조정)`);
        break;
      }
    }
  }
  return OK;
}

export async function cmd_official(args) {
  const rel = args.part === 'skill' ? 'SKILL.md' : `references/${args.part}.md`;
  const name = `mantine-${args.name}`;
  print(await fetch_text(`${OFFICIAL_RAW}/${name}/${rel}`, path.join(cacheDir(), 'official', name, ...rel.split('/'))));
  return OK;
}

// (정규식, 설명). JSX 태그는 여러 줄에 걸칠 수 있으므로 파일 전체에 DOTALL 로 건다.
// 정규식 소스는 python 원본 글자 그대로 둔다(pyReU 가 JS 로 옮긴다).
const tag = (name) => String.raw`<${name}\b(?:[^<>]|=>)*?`;
export const V9_RULES = [
  [tag('(?:Text|Anchor)') + String.raw`\scolor=`, 'Text/Anchor `color` 제거 → `c`'],
  [tag('Collapse') + String.raw`\sin=`, 'Collapse `in` → `expanded`'],
  [tag('Spoiler') + String.raw`\sinitialState=`, 'Spoiler `initialState` → `defaultExpanded`'],
  [tag('Grid') + String.raw`\sgutter=`, 'Grid `gutter` → `gap` (rowGap/columnGap 도 있음)'],
  [tag('Grid') + String.raw`\soverflow=`, 'Grid `overflow="hidden"` 불필요(네이티브 gap)'],
  [String.raw`\bTypographyStylesProvider\b`, 'TypographyStylesProvider → Typography'],
  [String.raw`\bpositionDependencies\b`, 'Popover/Tooltip `positionDependencies` 제거(자동 계산)'],
  [String.raw`\b(?:zod|yup|joi|superstruct)Resolver\b`, '@mantine/form 은 `schemaResolver`(Standard Schema) 사용'],
  [String.raw`(?:const|let)\s+\w+\s*=\s*useHeadroom\(`, 'useHeadroom 은 `{ pinned, scrollProgress }` 객체 반환'],
  [String.raw`\b(?:UseScrollSpyReturnType|StateHistory)\b`, 'hooks 타입명 변경(…ReturnValue / UseStateHistoryValue)'],
  // v7 이전 API — 학습 데이터에 흔히 섞여 나온다
  [String.raw`\bcreateStyles\b|\bsx=\{`, 'v6 `createStyles`/`sx` 없음 → CSS modules · style props · Styles API'],
  [tag('(?:Group|Stack|SimpleGrid)') + String.raw`\sspacing=`, '`spacing` → `gap`(Group/Stack) · SimpleGrid 는 `spacing`/`verticalSpacing` 확인'],
  [tag('Group') + String.raw`\sposition=`, 'Group `position` → `justify`'],
  [tag('Group') + String.raw`\snoWrap\b`, 'Group `noWrap` → `wrap="nowrap"`'],
  [tag(String.raw`\w+`) + String.raw`\s(?:leftIcon|rightIcon)=`, '`leftIcon/rightIcon` → `leftSection/rightSection`'],
  [tag('(?:TextInput|Select|MultiSelect|NumberInput|PasswordInput|Autocomplete|DateInput)') + String.raw`\sicon=`, 'input `icon` → `leftSection`'],
  [String.raw`<MediaQuery\b`, 'MediaQuery 컴포넌트 없음 → hiddenFrom/visibleFrom 또는 CSS'],
  [String.raw`from ['\"]@emotion/`, 'Mantine 7+ 는 emotion 을 쓰지 않는다'],
];

const CSS_COLOR_SRC = String.raw`#[0-9a-fA-F]{3,8}\b(?![\w-])|\brgba?\(`;
const MANTINE_IMPORT_SRC = String.raw`from ['\"]@mantine/`;
const SKIP_PARTS = new Set(['node_modules', '.next', 'dist', 'build']);
const AUDIT_SUFFIXES = new Set(['.tsx', '.ts', '.jsx', '.css']);

/** python Path.suffix */
function pySuffix(name) {
  const i = name.lastIndexOf('.');
  return i > 0 && i < name.length - 1 ? name.slice(i) : '';
}

/** python read_text(encoding="utf-8", errors="ignore"): 깨진 바이트는 버린다(BOM 은 남긴다). 줄끝은 universal newlines. */
export function decodeIgnore(buf) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
  } catch {
    text = decodeLenient(buf);
  }
  return text.replace(/\r\n?/g, '\n');
}

function decodeLenient(buf) {
  const parts = [];
  const n = buf.length;
  let i = 0;
  let runStart = 0;
  const flush = (end) => { if (end > runStart) parts.push(buf.toString('utf8', runStart, end)); };
  const cont = (k, lo = 0x80, hi = 0xbf) => k < n && buf[k] >= lo && buf[k] <= hi;
  while (i < n) {
    const b = buf[i];
    let len = 0;
    let ok = false;
    if (b < 0x80) { i++; continue; }
    if (b >= 0xc2 && b <= 0xdf) {
      len = 2;
      if (cont(i + 1)) ok = true;
      else len = 1;
    } else if (b >= 0xe0 && b <= 0xef) {
      const lo = b === 0xe0 ? 0xa0 : 0x80;
      const hi = b === 0xed ? 0x9f : 0xbf;
      if (cont(i + 1, lo, hi)) {
        if (cont(i + 2)) { len = 3; ok = true; } else len = 2;
      } else len = 1;
    } else if (b >= 0xf0 && b <= 0xf4) {
      const lo = b === 0xf0 ? 0x90 : 0x80;
      const hi = b === 0xf4 ? 0x8f : 0xbf;
      if (cont(i + 1, lo, hi)) {
        if (cont(i + 2)) {
          if (cont(i + 3)) { len = 4; ok = true; } else len = 3;
        } else len = 2;
      } else len = 1;
    } else {
      len = 1; // 0x80-0xc1, 0xf5-0xff: 시작 바이트가 될 수 없음
    }
    if (ok) { i += len; continue; }
    flush(i); // 정상 구간을 내보내고 깨진 바이트(최대 일치 부분)는 버린다
    i += len;
    runStart = i;
  }
  flush(n);
  return parts.join('');
}

function pathPartsOf(p) {
  return splitPyPath(p).parts;
}

/** audit 대상 파일 목록: python 의 `for p in paths: is_dir → rglob / exists → 그대로` 와 같은 모양. */
function collectAuditFiles(paths) {
  const files = []; // {display, parts, full, name}
  for (const raw of paths) {
    const norm = pyPathStr(raw);
    const { anchor, parts } = splitPyPath(raw);
    if (isDir(norm)) {
      // python 은 경로 성분 전체(주어진 경로 포함)에 node_modules·.next·dist·build 가 있으면 걸러 낸다
      if (parts.some((x) => SKIP_PARTS.has(x))) continue;
      const found = walkSorted(norm, { includeDirs: true, skipDirs: [...SKIP_PARTS], skipUnreadable: true });
      for (const full of found) {
        const rel = path.relative(norm, full).split(path.sep);
        const name = rel[rel.length - 1];
        if (!AUDIT_SUFFIXES.has(pySuffix(name))) continue;
        files.push({ display: joinPy(anchor, [...parts, ...rel]), parts: [...parts, ...rel], full, name });
      }
    } else if (fileExists(norm)) {
      files.push({ display: norm, parts, full: norm, name: parts[parts.length - 1] ?? '' });
    }
  }
  return files;
}

function lineCounter(text) {
  const nl = [];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) nl.push(i);
  // 위치 pos 앞(0..pos-1)의 개행 수 + 1
  return (pos) => {
    let lo = 0;
    let hi = nl.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (nl[mid] < pos) lo = mid + 1; else hi = mid;
    }
    return lo + 1;
  };
}

function* finditer(rx, text) {
  const g = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : `${rx.flags}g`);
  let m;
  while ((m = g.exec(text)) !== null) {
    yield m;
    if (m[0] === '') g.lastIndex++;
  }
}

export function cmd_audit(args) {
  const files = collectAuditFiles(args.paths);
  const compiled = V9_RULES.map(([rx, msg]) => [pyReU(rx, 's'), msg]);
  const cssColor = pyReU(CSS_COLOR_SRC, 's');
  const mantineImport = pyReU(MANTINE_IMPORT_SRC, 's');
  const simpleGridOk = /^<SimpleGrid(?![\p{L}\p{N}_])/u;
  let issues = 0;
  for (const f of files) {
    const text = decodeIgnore(fs.readFileSync(f.full));
    const lineAt = lineCounter(text);
    const inScreen = f.parts.some((part) => part.startsWith('m-'));
    if (pySuffix(f.name) === '.css') {
      // DMES: 화면 CSS 는 의미 토큰만 쓴다(UI-Visual-Standard §3). var(--x, #fallback) 폴백도 금지.
      if (inScreen) {
        for (const m of finditer(cssColor, text)) {
          print(`${f.display}:${lineAt(m.index)}: 화면 CSS 에 색 값 직접 사용 → 의미 토큰 var(--color-*) (UI-Visual-Standard §3)`);
          issues++;
        }
      }
      continue;
    }
    // DMES: 화면 모듈(m-*)은 @mantine/* 를 직접 import 하지 않는다(Part B §4-2·§17). 호스트 root layout 은 예외.
    if (inScreen && f.name !== 'layout.tsx') {
      for (const m of finditer(mantineImport, text)) {
        print(`${f.display}:${lineAt(m.index)}: 화면에서 @mantine/* 직접 import 금지 → @dk-oasis/shared/* (Part B §17)`);
        issues++;
      }
    }
    for (const [rx, msg] of compiled) {
      for (const m of finditer(rx, text)) {
        if (msg.startsWith('`spacing`') && simpleGridOk.test(m[0])) continue; // SimpleGrid 는 v9 에도 spacing 이 있다
        print(`${f.display}:${lineAt(m.index + m[0].length)}: ${msg}`);
        issues++;
      }
    }
  }
  print(`\n${files.length}개 파일 점검, 의심 ${issues}건${issues ? '' : ' — 통과'}`);
  return issues ? VIOLATION : OK;
}

export function cmd_refresh() {
  const cache = cacheDir();
  try {
    const st = fs.lstatSync(cache);
    if (st.isDirectory()) fs.rmSync(cache, { recursive: true, force: true });
  } catch { /* ignore_errors */ }
  print(`캐시 삭제: ${cache}`);
  return OK;
}

// ---------------------------------------------------------------------------
// 진입점
// ---------------------------------------------------------------------------

// -h/--help 에 보이는 설명. python 판은 머리말(docstring)을 그대로 보여 줬다(RawDescriptionHelpFormatter) — 사용 예는 node 호출 형태로 옮겼다.
const DESCRIPTION = `Mantine 9 LLM 문서 조회 + v9 사용법 점검 도구.

mantine.dev 가 배포하는 llms.txt(인덱스) · 페이지별 .md · llms-full.txt 를
~/.cache/mantine-llms/ 에 캐시해 두고 필요한 부분만 꺼내 본다.

  node mantine_docs.mjs version                  # 설치된 @mantine/* 버전
  node mantine_docs.mjs search <단어...>          # 인덱스에서 페이지 찾기
  node mantine_docs.mjs get <이름|slug> [--section Props]
  node mantine_docs.mjs grep <정규식> [-C 3]      # llms-full.txt 전문 검색
  node mantine_docs.mjs official <combobox|form|custom-components> [skill|api|patterns]
  node mantine_docs.mjs audit <경로...>           # v8 이하 API·금지 패턴 점검
  node mantine_docs.mjs refresh                  # 캐시 비우기`;
const SPEC = {
  prog: 'mantine_docs.mjs',
  description: DESCRIPTION,
  commands: {
    version: {},
    search: {
      options: { section: { type: 'string' }, limit: { type: 'int', default: 30 } },
      positionals: [{ name: 'terms', variadic: true }],
    },
    get: { options: { section: { type: 'string' } }, positionals: [{ name: 'name' }] },
    grep: {
      options: { C: { type: 'int', short: 'C', default: 3 }, limit: { type: 'int', default: 20 } },
      positionals: [{ name: 'pattern' }],
    },
    official: {
      positionals: [
        { name: 'name', choices: ['combobox', 'form', 'custom-components'] },
        { name: 'part', required: false, default: 'skill', choices: ['skill', 'api', 'patterns'] },
      ],
    },
    audit: { positionals: [{ name: 'paths', variadic: true }] },
    refresh: {},
  },
};

/**
 * argparse 는 `--limit -3`·`-C -1` 의 -3·-1 을 값으로 받는다(음수 모양 인자). util.parseArgs 는 못 받으니
 * `--limit=-3`·`-C-1` 처럼 붙여 준다. (위치 인자 자리의 음수 `search -3` 은 받지 않는다.)
 */
export function glue_negative_numbers(argv) {
  const res = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1] ?? '';
    if (/^-\d+$/.test(next) && (a === '--limit' || a === '--C')) {
      res.push(`${a}=${next}`);
      i++;
    } else if (/^-\d+$/.test(next) && a === '-C') {
      res.push(`-C${next}`);
      i++;
    } else {
      res.push(a);
    }
  }
  return res;
}

/** 명령줄 인자(= process.argv.slice(2))를 처리하고 종료 코드를 돌려준다. */
export async function main(argv) {
  const cli = parseCli(glue_negative_numbers(argv), SPEC);
  if (!cli) return process.exitCode ?? OK;
  const args = { ...cli.values, ...cli.positionals };
  try {
    switch (cli.command) {
      case 'version': return cmd_version();
      case 'search': return await cmd_search(args);
      case 'get': return await cmd_get(args);
      case 'grep': return await cmd_grep(args);
      case 'official': return await cmd_official(args);
      case 'audit': return cmd_audit(args);
      case 'refresh': return cmd_refresh();
      default: return VIOLATION;
    }
  } catch (err) {
    if (err instanceof Die) {
      hooks.err(`${err.message}\n`);
      return VIOLATION;
    }
    throw err;
  }
}

function isMain() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  finish(await main(process.argv.slice(2)));
}
