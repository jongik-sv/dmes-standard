#!/usr/bin/env node
// ag-grid-community 버전 맞춤 문서 조회 + 사용법 점검 도구.
//
// ag-grid.com 의 llms.txt · `.md` 는 **최신 메이저**만 제공한다. 설치 버전 문서는
// `/archive/{x.y.z}/{framework}-data-grid/{slug}/` HTML 로만 열리므로 텍스트로 바꿔 캐시한다.
// 슬러그 색인과 권장사항은 공식 스킬 ag-grid/skills(ag-dev) 의 references 를 쓴다.
//
//   node aggrid_docs.mjs version                    # 설치된 ag-grid-community / react 버전
//   node aggrid_docs.mjs search <단어...>            # 공식 슬러그 색인 검색
//   node aggrid_docs.mjs get <slug> [--section 제목] [--version x.y.z] [--latest]
//   node aggrid_docs.mjs types <이름>                # 설치 .d.ts 에서 옵션·인터페이스 정의 찾기
//   node aggrid_docs.mjs recommendations            # 공식 ag-dev 권장사항(LLM 흔한 실수)
//   node aggrid_docs.mjs audit <경로...>             # deprecated 옵션·금지 import 점검 + 화면 성능 정적 점검(P-*)
//   node aggrid_docs.mjs refresh                    # 캐시 비우기
//
// node 18.17 이상, 외부 의존성 없음. python 판(aggrid_docs.py)의 이식이며 원본은
// tests/golden/legacy/aggrid_docs.legacy.py 에 보관한다. 내부 함수 이름·정규식 원문은 python 판과 같게 두었다
// (정규식은 python 문법 그대로 적고 아래 `pyre` 가 JS 로 옮긴다).
//
// ── python 판과 달라진 점 ──────────────────────────────────────────────────────────────────────
//  1. 호출 표기: `python3 aggrid_docs.py …` → `node aggrid_docs.mjs …`, 안내 문구 속 `aggrid_docs.py` → `aggrid_docs.mjs`.
//  2. 인자 해석은 `_shared/node/args.mjs`(argparse 대응)를 쓴다. 오류는 종료 코드 2(stderr 문구는 한국어 `사용: …`),
//     `-h` 도움말 문구도 python argparse 와 다르다(종료 코드 0, 머리말의 사용 예 블록은 node 호출 형태로 보여 준다). 음수 `--limit -1` 은 python 처럼 받아들인다(= 로 바꿔 넘김).
//  3. audit 의 파일 열거 순서: python `rglob` 은 파일시스템 순서(비결정적), 여기는 경로 성분별 코드포인트 순으로 고정한다.
//     따라서 출력의 파일 순서만 다를 수 있고 파일 안의 줄 순서·내용은 같다. `audit-exceptions.json` 의 path 비교는
//     python 과 같게 `resolve().as_posix()` 끝 일치이며 윈도우 역슬래시 경로도 `/` 로 바꿔 비교한다.
//  4. audit 은 .tsx/.ts/.jsx 파일 이름의 폴더(`foo.ts/`)를 파일로 읽으려다 죽지 않고 건너뛴다(python 은 IsADirectoryError).
//  5. 네트워크: urllib → node 전역 fetch(`AbortSignal.timeout(60000)`), UA·캐시 폴더·TTL(7일, mtime)·캐시 파일 이름은 python 과 같아
//     두 판이 캐시를 공유한다. node 18 의 fetch ExperimentalWarning 은 이 호출에서만 억제한다. 연결 실패 때 `(…)` 안의 사유 문구는
//     python(urlopen error …)과 다르다.
//  6. 시험 전용 통로: 환경 변수 AGGRID_DOCS_SITE·AGGRID_DOCS_AGDEV_RAW 가 있으면 SITE·AGDEV_RAW 를 바꾼다(로컬 가짜 서버용).
//     평소에는 설정하지 않는다.
//  7. 환경 변수 AGGRID_DOCS_CACHE 가 빈 문자열이면 설정하지 않은 것으로 본다(python 은 Path("") = "." 이라 `refresh` 가 현재 폴더를 지운다).
//     `refresh` 는 심볼릭 링크·일반 파일인 CACHE 를 지우지 않는다(shutil.rmtree 가 오류를 무시하고 남기는 것과 같음).
//  8. path_norm 은 윈도우 UNC 경로(`\\srv\share\x`)의 앞 역슬래시 두 개를 보존한다(python PureWindowsPath 처럼).
//  9. 한계: audit 은 파일을 읽을 때 비 BMP 문자(이모지 등)를 한 칸짜리 자리표시자로 바꿔 python 의 코드포인트 단위 위치·길이와 맞춘다.
//     (비 BMP 글자·숫자로 된 식별자는 출력에서 다른 글자로 보일 수 있다 — 현실에 없다.)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCli, finish, OK, VIOLATION } from '../../_shared/node/args.mjs';
import { splitlinesPy, compareCodePoint } from '../../_shared/node/pytext.mjs';
import { toPosix, walkSorted } from '../../_shared/node/paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── python re → JS RegExp 변환층 ──────────────────────────────────────────────────────────────────
// python 문법 정규식 원문을 그대로 받아 같은 뜻의 JS 정규식으로 옮긴다(항상 u 플래그).
//  - `\w \W \d \D \s \S` 는 python 3 str 패턴처럼 유니코드(한글이 단어 문자), `\b` 는 그 \w 기준의 경계
//  - `^ $` 는 python 뜻(`$` 는 끝 또는 마지막 `\n` 앞, re.M 이면 줄 경계는 `\n` 만), `.` 은 `\n` 만 제외(re.S 면 전부)
//  - 선행 `(?i)` 인라인 플래그, `\"`·`\`` 같은 불필요 이스케이프(u 모드는 거부), 중괄호 리터럴, `(?P<n>)`
//  - `[\s\S]` → 모든 문자
const WORD = '\\p{L}\\p{N}_';
const PY_SPACE = '\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const WORD_BOUNDARY = `(?:(?<=[${WORD}])(?![${WORD}])|(?<![${WORD}])(?=[${WORD}]))`;
const SYNTAX_CHARS = '^$\\.*+?()[]{}|/';
const PY_SPACE_ONLY = new RegExp(`^[${PY_SPACE}]+$`, 'u');
const PY_LSTRIP = new RegExp(`^[${PY_SPACE}]+`, 'u');
const PY_RSTRIP = new RegExp(`[${PY_SPACE}]+$`, 'u');

function convertPyRegex(src, { ml, dotall }) {
  const n = src.length;
  let out = '';
  let i = 0;
  let inClass = false;
  while (i < n) {
    const c = src[i];
    if (c === '\\') {
      const d = src[i + 1];
      if (d === undefined) throw new Error('pyre: 끝에 남은 역슬래시');
      i += 2;
      if (d === 'w') out += inClass ? WORD : `[${WORD}]`;
      else if (d === 'd') out += '\\p{Nd}';
      else if (d === 's') out += inClass ? PY_SPACE : `[${PY_SPACE}]`;
      else if (d === 'b') out += inClass ? '\\x08' : WORD_BOUNDARY;
      else if (d === 'W' || d === 'S' || d === 'D' || d === 'B') {
        if (inClass) throw new Error(`pyre: 클래스 안의 \\${d} 는 지원하지 않는다`);
        out += d === 'W' ? `[^${WORD}]` : d === 'S' ? `[^${PY_SPACE}]` : d === 'D' ? '\\P{Nd}' : `(?!${WORD_BOUNDARY})`;
      } else if (d === 'A') out += '(?<![^])';
      else if (d === 'Z') out += '(?![^])';
      else if (d === 'a') out += '\\x07';
      else if ('ntrfv'.includes(d) || /[0-9xu]/.test(d)) out += `\\${d}`;
      else if (/[A-Za-z]/.test(d)) throw new Error(`pyre: 알 수 없는 이스케이프 \\${d}`);
      else if (d === '-') out += inClass ? '\\-' : '-';
      else if (SYNTAX_CHARS.includes(d)) out += `\\${d}`;
      else out += d; // `\"` `\`` `\&` `\#` `\ ` 같은 리터럴 이스케이프
      continue;
    }
    if (inClass) {
      if (c === ']') { inClass = false; out += ']'; } else if (c === '[') out += '\\['; else out += c;
      i++;
      continue;
    }
    if (c === '[') {
      if (src.startsWith('[\\s\\S]', i) || src.startsWith('[\\S\\s]', i)) { out += '[^]'; i += 6; continue; }
      inClass = true;
      out += '[';
      i++;
      if (src[i] === '^') { out += '^'; i++; }
      if (src[i] === ']') { out += '\\]'; i++; }
      continue;
    }
    if (c === '(') {
      if (src[i + 1] !== '?') { out += '('; i++; continue; }
      if (src.startsWith('(?P<', i)) { out += '(?<'; i += 4; continue; }
      if (src.startsWith('(?P=', i)) {
        const j = src.indexOf(')', i);
        if (j < 0) throw new Error('pyre: (?P=name) 닫는 괄호 없음');
        out += `\\k<${src.slice(i + 4, j)}>`;
        i = j + 1;
        continue;
      }
      const mm = /^\(\?(?::|=|!|<=|<!)/.exec(src.slice(i, i + 4));
      if (mm) { out += mm[0]; i += mm[0].length; continue; }
      throw new Error(`pyre: 지원하지 않는 구문 ${src.slice(i, i + 6)}`);
    }
    if (c === '.') { out += dotall ? '[^]' : '[^\\n]'; i++; continue; }
    if (c === '^') { out += ml ? '(?<![^\\n])' : '(?<![^])'; i++; continue; }
    if (c === '$') { out += ml ? '(?![^\\n])' : '(?=\\n?(?![^]))'; i++; continue; }
    if (c === '{') {
      const q = /^\{(\d*)(?:(,)(\d*))?\}/.exec(src.slice(i));
      if (q && (q[1] !== '' || q[2])) { // `{n}` `{n,}` `{n,m}` `{,m}`(python 은 0 부터)
        out += q[2] ? `{${q[1] || '0'},${q[3]}}` : `{${q[1]}}`;
        i += q[0].length;
      } else { out += '\\{'; i++; }
      continue;
    }
    if (c === '}') { out += '\\}'; i++; continue; }
    if (c === ']') { out += '\\]'; i++; continue; }
    out += c;
    i++;
  }
  return out;
}

function withMatchApi(m) {
  m.start = () => m.index;
  m.end = () => m.index + m[0].length;
  m.group = (k = 0) => m[k];
  return m;
}

/** python `re.compile` 대응. search·match·fullmatch·finditer·findall·sub 를 제공한다. */
class PyRe {
  constructor(source, flags = '') {
    let src = source;
    const f = new Set();
    for (const c of flags) f.add(c);
    for (;;) {
      const m = /^\(\?([aiLmsux]+)\)/.exec(src);
      if (!m) break;
      for (const c of m[1]) {
        if (c === 'i' || c === 'm' || c === 's') f.add(c);
        else if (c !== 'a' && c !== 'u') throw new Error(`pyre: 지원하지 않는 인라인 플래그 ${c}`);
      }
      src = src.slice(m[0].length);
    }
    this.source = source;
    this.flagsArg = flags;
    this.js = convertPyRegex(src, { ml: f.has('m'), dotall: f.has('s') });
    this.flags = `${f.has('i') ? 'i' : ''}u`;
    this._g = new RegExp(this.js, `${this.flags}g`);
    this._y = new RegExp(this.js, `${this.flags}y`);
    this._f = new RegExp(`(?:${this.js})(?![^])`, `${this.flags}y`);
    this.groups = new RegExp(`${this.js}|`, `${this.flags}`).exec('').length - 1;
  }

  /** python `pattern.search(s, pos)` */
  search(s, pos = 0) {
    const r = this._g;
    r.lastIndex = pos;
    const m = r.exec(s);
    return m ? withMatchApi(m) : null;
  }

  /** python `pattern.match(s, pos)` — pos 에서 시작하는 일치만 */
  match(s, pos = 0) {
    const r = this._y;
    r.lastIndex = pos;
    const m = r.exec(s);
    return m ? withMatchApi(m) : null;
  }

  fullmatch(s) {
    const r = this._f;
    r.lastIndex = 0;
    const m = r.exec(s);
    return m ? withMatchApi(m) : null;
  }

  * finditer(s) {
    const r = new RegExp(this.js, `${this.flags}g`);
    for (;;) {
      const m = r.exec(s);
      if (!m) return;
      if (m[0] === '') r.lastIndex++;
      yield withMatchApi(m);
    }
  }

  /** python `findall`: 그룹이 없으면 전체 일치, 하나면 그 그룹(없으면 ''). */
  findall(s) {
    const out = [];
    for (const m of this.finditer(s)) out.push(this.groups === 0 ? m[0] : m[1] ?? '');
    return out;
  }

  /** python `re.sub(pattern, repl, s)` — repl 은 리터럴 문자열(템플릿 해석 없음) 또는 함수(match) */
  sub(repl, s) {
    let out = '';
    let last = 0;
    for (const m of this.finditer(s)) {
      out += s.slice(last, m.index) + (typeof repl === 'function' ? repl(m) : repl);
      last = m.index + m[0].length;
    }
    return out + s.slice(last);
  }
}

const rxCache = new Map();
/** 캐시되는 python 정규식 컴파일. flags 는 'i' 'm' 's' 조합. */
export function pyre(source, flags = '') {
  const key = `${flags}\u0000${source}`;
  let r = rxCache.get(key);
  if (!r) {
    r = new PyRe(source, flags);
    rxCache.set(key, r);
  }
  return r;
}

/** 지금까지 컴파일된 python 정규식 [원문, 플래그] 목록(시험이 python re 와 대조하는 데 쓴다). */
export function compiled_patterns() {
  return [...rxCache.values()].map((r) => [r.source, r.flagsArg]);
}
/** 모듈을 불러온 직후(함수를 부르기 전)에 컴파일돼 있는 정규식 목록 — 시간이 지나도 변하지 않는다. */
export const STATIC_PATTERNS = [];

/** python 3.7+ `re.escape` */
export function re_escape(s) {
  return s.replace(/[()[\]{}?*+\-|^$\\.&~# \t\n\r\v\f]/g, (c) => `\\${c}`);
}

// ── python 문자열 함수 ────────────────────────────────────────────────────────────────────────────
const pyIsSpaceStr = (s) => s.length > 0 && PY_SPACE_ONLY.test(s);
const pyLstrip = (s) => s.replace(PY_LSTRIP, '');
const pyRstrip = (s) => s.replace(PY_RSTRIP, '');
const pyStrip = (s) => pyRstrip(pyLstrip(s));

/** python `str.expandtabs(tabsize)` */
function expandtabs(s, tabsize = 8) {
  let out = '';
  let col = 0;
  for (const ch of s) {
    if (ch === '\t') {
      if (tabsize > 0) {
        const add = tabsize - (col % tabsize);
        out += ' '.repeat(add);
        col += add;
      }
    } else {
      out += ch;
      col = ch === '\n' || ch === '\r' ? 0 : col + 1;
    }
  }
  return out;
}

const cpLen = (s) => Array.from(s).length;

// ── 종료·출력 ────────────────────────────────────────────────────────────────────────────────────
class SysExit extends Error {
  constructor(msg, code) {
    super(typeof msg === 'string' ? msg : `exit ${code}`);
    this.sysMessage = typeof msg === 'string' ? msg : null;
    this.code = code ?? 1;
  }
}
/** python `sys.exit("문자열")` — stderr 에 문자열, 종료 코드 1 */
const sys_exit = (msg) => new SysExit(msg, 1);
const out = (s = '') => { process.stdout.write(`${s}\n`); };
const warn_stderr = (s) => { process.stderr.write(`${s}\n`); };

// ── 파일 읽기 ────────────────────────────────────────────────────────────────────────────────────
const VALID_UTF8 = /[\x00-\x7f]|[\xc2-\xdf][\x80-\xbf]|\xe0[\xa0-\xbf][\x80-\xbf]|[\xe1-\xec\xee\xef][\x80-\xbf]{2}|\xed[\x80-\x9f][\x80-\xbf]|\xf0[\x90-\xbf][\x80-\xbf]{2}|[\xf1-\xf3][\x80-\xbf]{3}|\xf4[\x80-\x8f][\x80-\xbf]{2}/g;

/** python `bytes.decode("utf-8", errors="ignore")`: 잘못된 바이트는 버린다. BOM 은 남긴다. */
function decodeUtf8Ignore(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
  } catch {
    const kept = buf.toString('latin1').match(VALID_UTF8);
    return Buffer.from(kept ? kept.join('') : '', 'latin1').toString('utf8');
  }
}

/** python `bytes.decode("utf-8")` (strict). 잘못된 바이트면 Error. BOM 은 남긴다. */
function decodeUtf8Strict(buf) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buf);
}

const universalNewlines = (s) => s.replace(/\r\n?/g, '\n');

/** python `Path.read_text(encoding="utf-8")` — 줄끝을 `\n` 으로(universal newlines), BOM 은 그대로 둔다. */
export function read_text(file, { ignoreErrors = false } = {}) {
  const buf = fs.readFileSync(file);
  return universalNewlines(ignoreErrors ? decodeUtf8Ignore(buf) : decodeUtf8Strict(buf));
}

const ASTRAL = /[\u{10000}-\u{10FFFF}]/gu;
/** audit 입력용 읽기: errors="ignore" + 비 BMP 문자를 한 칸으로(python 은 코드포인트 단위로 위치를 센다). */
function read_audit_text(file) {
  return read_text(file, { ignoreErrors: true }).replace(ASTRAL, (ch) => (/[\p{L}\p{N}]/u.test(ch) ? '\u00aa' : '\ue000'));
}

// ── 경로(python pathlib 흉내) ────────────────────────────────────────────────────────────────────
const WIN = process.platform === 'win32';
const SEP = WIN ? '\\' : '/';

/** python `Path.parts` 에서 이름 비교에 쓰는 성분들(루트·드라이브 표기는 빼고, 빈 성분·`.` 제외). */
export function path_parts(p, win = WIN) {
  return p.split(win ? /[\\/]+/ : /\/+/).filter((x) => x !== '' && x !== '.');
}
const path_name = (p, win = WIN) => {
  const parts = path_parts(p, win);
  return parts.length ? parts[parts.length - 1] : '';
};
/** python `Path.suffix` */
export function path_suffix(name) {
  const i = name.lastIndexOf('.');
  return i > 0 && i < name.length - 1 ? name.slice(i) : '';
}
const path_with_name = (p, name) => {
  const k = Math.max(p.lastIndexOf('/'), WIN ? p.lastIndexOf('\\') : -1);
  return k < 0 ? name : p.slice(0, k + 1) + name;
};
/** python `Path(arg)` 의 문자열: 빈 성분·`.` 제거, 끝 슬래시 제거(`..` 는 그대로). */
export function path_norm(arg, win = WIN) {
  if (win) {
    // UNC(`\\srv\share\x`): 서버·공유 이름이 드라이브 구실을 하므로 앞 역슬래시 두 개와 공유 뒤 구분자를 보존한다(python PureWindowsPath 처럼)
    const u = /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)(.*)$/s.exec(arg);
    if (u) return `\\\\${u[1]}\\${u[2]}\\${path_parts(u[3], true).join('\\')}`;
  }
  const abs = win ? /^([A-Za-z]:)?[\\/]/.test(arg) : arg.startsWith('/');
  const parts = path_parts(arg, win);
  let drive = '';
  if (win && /^[A-Za-z]:/.test(parts[0] ?? '')) drive = parts.shift();
  const sep = win ? '\\' : '/';
  const body = parts.join(sep);
  if (!abs) return drive ? drive + body : body === '' ? '.' : body;
  return `${drive}${sep}${body}`;
}
const path_join = (base, rel, sep = SEP) => (base === '.' ? rel : base.endsWith(sep) ? base + rel : base + sep + rel);

function real_path(p) {
  try { return fs.realpathSync.native(p); } catch { return path.resolve(p); }
}

// ── 설정 ─────────────────────────────────────────────────────────────────────────────────────────
const SITE = process.env.AGGRID_DOCS_SITE || 'https://www.ag-grid.com';
const AGDEV_RAW = process.env.AGGRID_DOCS_AGDEV_RAW || 'https://raw.githubusercontent.com/ag-grid/skills/HEAD/skills/ag-dev/references/grid';
export const CACHE = path_norm(process.env.AGGRID_DOCS_CACHE || path.join(os.homedir(), '.cache', 'aggrid-docs'));
const TTL_SECONDS = 7 * 24 * 3600;
// ag-grid.com 은 기본 UA 를 403 으로 막는다
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128 Safari/537.36';

class HttpError extends Error {
  constructor(code) {
    super(`HTTP Error ${code}`);
    this.code = code;
  }
}

/** node 18 의 fetch ExperimentalWarning 만 이 호출에서 억제한다. */
function quiet_http_get(url) {
  const orig = process.emitWarning;
  process.emitWarning = function emitWarning(warning, ...rest) {
    const text = typeof warning === 'string' ? warning : warning?.message ?? '';
    const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type ?? warning?.name;
    if (type === 'ExperimentalWarning' && /fetch/i.test(text)) return undefined;
    return orig.call(this, warning, ...rest);
  };
  try {
    return globalThis.fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  } finally {
    process.emitWarning = orig;
  }
}

async function http_get_text(url) {
  const res = await quiet_http_get(url);
  if (!res.ok) {
    await res.arrayBuffer().catch(() => undefined);
    throw new HttpError(res.status);
  }
  return decodeUtf8Strict(Buffer.from(await res.arrayBuffer()));
}

const exists = (p) => fs.existsSync(p);

/** 성공하면 본문, 404 면 null. 네트워크 오류는 오래된 캐시로 대체한다. */
export async function fetch(url, dest, ttl = TTL_SECONDS) {
  if (exists(dest) && Date.now() / 1000 - fs.statSync(dest).mtimeMs / 1000 < ttl) {
    return read_text(dest);
  }
  let body;
  try {
    body = await http_get_text(url);
  } catch (exc) {
    if (exc instanceof HttpError) {
      if (exc.code === 404) return null;
      if (exists(dest)) return read_text(dest);
      throw sys_exit(`[error] ${url} 조회 실패: HTTP ${exc.code}`);
    }
    const why = exc?.cause?.code ? `${exc.message} (${exc.cause.code})` : String(exc?.message ?? exc);
    if (exists(dest)) {
      warn_stderr(`[warn] ${url} 조회 실패(${why}) — 오래된 캐시 사용`);
      return read_text(dest);
    }
    throw sys_exit(`[error] ${url} 조회 실패: ${why}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body, 'utf8');
  return body;
}

// ── 설치본 찾기 ──────────────────────────────────────────────────────────────────────────────────
/** cwd 에서 위로 올라가며 node_modules/<name> 을 찾고, 없으면 pnpm 저장소(.pnpm)를 본다. */
export function find_package(name, cwd = process.cwd()) {
  const here = real_path(cwd);
  const ancestors = [here];
  for (let a = here; path.dirname(a) !== a;) {
    a = path.dirname(a);
    ancestors.push(a);
  }
  const bases = [];
  for (const a of ancestors) bases.push(a, path.join(a, 'src', 'frontend'));
  for (const base of bases) {
    const direct = path.join(base, 'node_modules', name, 'package.json');
    if (exists(direct)) return path.dirname(direct);
    const pnpm = path.join(base, 'node_modules', '.pnpm');
    let isDir = false;
    try { isDir = fs.statSync(pnpm).isDirectory(); } catch { /* 없음 */ }
    if (isDir) {
      // python: sorted(pnpm.glob(f"{name}@*/node_modules/{name}/package.json")) 의 마지막(성분별 코드포인트 순)
      const dirs = fs.readdirSync(pnpm).filter((d) => d.startsWith(`${name}@`)).sort(compareCodePoint);
      const hits = dirs.map((d) => path.join(pnpm, d, 'node_modules', name, 'package.json')).filter(exists);
      if (hits.length) return path.dirname(hits[hits.length - 1]);
    }
  }
  return null;
}

const read_package_json = (pkg) => JSON.parse(read_text(path.join(pkg, 'package.json')));

export function installed_version() {
  const pkg = find_package('ag-grid-community');
  if (!pkg) throw sys_exit('[error] ag-grid-community 설치본을 찾지 못했다. src/frontend 안에서 실행하거나 --version 을 준다.');
  return read_package_json(pkg).version;
}

function cmd_version() {
  for (const name of ['ag-grid-community', 'ag-grid-react', 'ag-grid-enterprise']) {
    const pkg = find_package(name);
    out(`${name}: ${pkg ? read_package_json(pkg).version : '(없음)'}${pkg ? `  [${pkg}]` : ''}`);
  }
}

// ── 색인·검색 ────────────────────────────────────────────────────────────────────────────────────
/** ag-dev documentation-index.md 의 `- 설명 `slug`` 줄을 (slug, 설명) 으로 읽는다. */
export async function load_index() {
  const text = (await fetch(`${AGDEV_RAW}/documentation-index.md`, path.join(CACHE, 'agdev', 'documentation-index.md'))) || '';
  const rows = [];
  for (const line of splitlinesPy(text)) {
    const m = pyre('^\\s*-\\s*(.*?)`([a-z0-9-]+)`\\s*$').match(line);
    if (m) rows.push([m[2], pyStrip(m[1])]);
  }
  return rows;
}

async function cmd_search(args) {
  const terms = args.terms.map((t) => t.toLowerCase());
  const scored = [];
  for (const [slug, desc] of await load_index()) {
    const hay = `${slug} ${desc}`.toLowerCase();
    const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    if (score) scored.push([-score, slug, desc]);
  }
  scored.sort((a, b) => a[0] - b[0] || compareCodePoint(a[1], b[1]) || compareCodePoint(a[2], b[2]));
  for (const [neg, slug, desc] of scored.slice(0, args.limit)) {
    const mark = -neg === terms.length ? '' : `  (${-neg}/${terms.length} 단어)`;
    out(`${slug.padEnd(40)} ${desc}${mark}`);
  }
  if (!scored.length) out('일치 없음. 단어를 바꾸거나 `types` 로 설치 타입에서 찾는다.');
}

/** 최신 .md 머리말의 enterprise 표시. 기능의 Enterprise 여부는 버전이 바뀌어도 거의 유지된다. */
export async function enterprise_flag(slug, fw) {
  const md = await fetch(`${SITE}/${fw}-data-grid/${slug}.md`, path.join(CACHE, 'latest', fw, `${slug}.md`));
  if (md === null) return 'Enterprise: 판별 불가(최신 문서에 없음)';
  const head = md.startsWith('---') ? md.split('\n---')[0] : '';
  return pyre('^enterprise:\\s*true', 'm').search(head)
    ? 'Enterprise: **예** — DMES 사용 불가(ADR-0001)'
    : 'Enterprise: 아니오(community)';
}

// ── html.unescape ────────────────────────────────────────────────────────────────────────────────
let ENTITY_TABLES = null;
function entity_tables() {
  if (!ENTITY_TABLES) {
    const j = JSON.parse(fs.readFileSync(path.join(HERE, '_html5_entities.json'), 'utf8'));
    ENTITY_TABLES = {
      html5: new Map(Object.entries(j.html5)),
      invalidCharrefs: new Map(Object.entries(j.invalidCharrefs).map(([k, v]) => [Number(k), v])),
      invalidCodepoints: new Set(j.invalidCodepoints),
    };
  }
  return ENTITY_TABLES;
}

const CHARREF = pyre('&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\\t\\n\\f <&#;]{1,32};?)');

function replace_charref(s) {
  const t = entity_tables();
  if (s[0] === '#') {
    // numeric charref
    const digits = s[1] === 'x' || s[1] === 'X' ? s.slice(2).replace(/;+$/, '') : s.slice(1).replace(/;+$/, '');
    const num = s[1] === 'x' || s[1] === 'X' ? Number.parseInt(digits, 16) : Number.parseInt(digits, 10);
    if (t.invalidCharrefs.has(num)) return t.invalidCharrefs.get(num);
    if ((num >= 0xd800 && num <= 0xdfff) || num > 0x10ffff) return '\ufffd';
    if (t.invalidCodepoints.has(num)) return '';
    return String.fromCodePoint(num);
  }
  // named charref
  if (t.html5.has(s)) return t.html5.get(s);
  // find the longest matching name (as defined by the standard)
  const cps = Array.from(s);
  for (let x = cps.length - 1; x > 1; x--) {
    const head = cps.slice(0, x).join('');
    if (t.html5.has(head)) return t.html5.get(head) + cps.slice(x).join('');
  }
  return `&${s}`;
}

/** python `html.unescape` — HTML5 이름 참조 표(세미콜론 없는 이름 포함)와 숫자 참조 규칙을 그대로 따른다. */
export function html_unescape(s) {
  if (!s.includes('&')) return s;
  return CHARREF.sub((m) => replace_charref(m[1]), s);
}

// ── HTML → 텍스트 ───────────────────────────────────────────────────────────────────────────────
export function html_to_text(page) {
  const m = pyre('<main.*?</main>', 's').search(page);
  let s = m ? m[0] : page;
  s = pyre('<(script|style|svg|nav|button)[^>]*>.*?</\\1>', 's').sub('', s);
  s = pyre('<pre[^>]*>').sub('\n```\n', s).replaceAll('</pre>', '\n```\n');
  s = pyre('<h([1-6])[^>]*>').sub((h) => `\n${'#'.repeat(Number(h[1]))} `, s);
  s = pyre('<code[^>]*>').sub('`', s).replaceAll('</code>', '`');
  s = pyre('<br\\s*/?>|</p>|</li>|</h[1-6]>|</tr>|</div>').sub('\n', s);
  s = pyre('<li[^>]*>').sub('- ', s);
  s = pyre('<[^>]+>').sub('', s);
  s = html_unescape(s).replaceAll('Copy Link', '');
  // <pre> 안의 `code` 표시는 되돌린다
  s = pyre('```\\n`(.*?)`\\n```', 's').sub((c) => `\`\`\`\n${c[1]}\n\`\`\``, s);
  s = pyStrip(pyre('\\n\\s*\\n+').sub('\n\n', s));
  const h1 = pyre('^# ', 'm').search(s);
  return h1 ? s.slice(h1.index) : s;
}

// ── get ──────────────────────────────────────────────────────────────────────────────────────────
async function cmd_get(args) {
  const fw = args.framework;
  let text;
  let label;
  if (args.latest) {
    text = await fetch(`${SITE}/${fw}-data-grid/${args.slug}.md`, path.join(CACHE, 'latest', fw, `${args.slug}.md`));
    if (text === null) throw sys_exit(`[error] 최신 문서에도 '${args.slug}' 가 없다. \`search\` 로 slug 를 확인한다.`);
    label = '최신(llms .md)';
  } else {
    const ver = args.version || installed_version();
    const cache = path.join(CACHE, 'archive', ver, fw, `${args.slug}.txt`);
    if (exists(cache)) {
      text = read_text(cache);
    } else {
      const page = await fetch(`${SITE}/archive/${ver}/${fw}-data-grid/${args.slug}/`, path.join(CACHE, 'raw.html'), 0);
      if (page === null) {
        throw sys_exit(`[error] ${ver} 문서에 '${args.slug}' 가 없다. 이 버전에 없는 기능일 가능성이 크다.\n`
          + `        \`get ${args.slug} --latest\` 로 도입 버전을 확인하되, 설치 버전 API 로만 구현한다.`);
      }
      text = html_to_text(page);
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      fs.writeFileSync(cache, text, 'utf8');
    }
    label = `archive ${ver}`;
  }
  out(`<!-- source: ${label} / ${fw} / ${args.slug} | ${await enterprise_flag(args.slug, fw)} -->`);
  if (!args.section) {
    out(text);
    return;
  }
  const outLines = [];
  let depth = null;
  const wanted = args.section.toLowerCase();
  const heading = pyre('^(#{1,6})\\s+(.*)');
  for (const line of splitlinesPy(text)) {
    const h = heading.match(line);
    if (h && depth !== null && h[1].length <= depth) depth = null;
    if (h && depth === null && h[2].toLowerCase().includes(wanted)) depth = h[1].length;
    if (depth !== null) outLines.push(line);
  }
  out(outLines.length
    ? outLines.join('\n')
    : `'${args.section}' 제목 없음. 제목 목록:\n${splitlinesPy(text).filter((l) => l.startsWith('#')).join('\n')}`);
}

// ── types ────────────────────────────────────────────────────────────────────────────────────────
export function types_dir() {
  const pkg = find_package('ag-grid-community');
  if (!pkg) throw sys_exit('[error] ag-grid-community 설치본을 찾지 못했다.');
  return path.join(pkg, 'dist', 'types', 'src');
}

/** 옵션·인터페이스 이름으로 .d.ts 정의와 바로 위 JSDoc 을 보여 준다. */
function cmd_types(args) {
  const pat = pyre(`^\\s*(?:export\\s+)?(?:declare\\s+)?(?:interface|type|class|const|function|abstract\\s+class)?\\s*${re_escape(args.name)}\\b\\??\\s*[:<={(]`);
  const jsdoc = pyre('^\\s*(\\*|/\\*\\*)');
  let shown = 0;
  const base = types_dir();
  const files = walkSorted(base, { skipUnreadable: true }).filter((f) => path.basename(f).endsWith('.d.ts'));
  for (const f of files) {
    const lines = splitlinesPy(read_text(f));
    for (let i = 0; i < lines.length; i++) {
      if (pat.match(lines[i])) {
        let start = i;
        while (start > 0 && jsdoc.match(lines[start - 1])) start--;
        out(`--- ${path.relative(base, f)}:${i + 1}`);
        out(lines.slice(start, i + args.after + 1).join('\n'));
        shown++;
        if (shown >= args.limit) return;
      }
    }
  }
  if (!shown) out(`'${args.name}' 정의 없음 — 이 버전에 없는 API 일 수 있다.`);
}

async function cmd_recommendations() {
  const text = await fetch(`${AGDEV_RAW}/recommendations.md`, path.join(CACHE, 'agdev', 'recommendations.md'));
  out(text === null ? 'None' : text);
}

/** 설치 버전 GridOptions·ColDef 의 @deprecated 속성 → 안내문. */
export function deprecated_props() {
  const result = new Map();
  for (const name of ['entities/gridOptions.d.ts', 'entities/colDef.d.ts']) {
    const f = path.join(types_dir(), name);
    if (!exists(f)) continue;
    let note = null; // 직전 JSDoc 블록의 @deprecated 문구
    for (const line of splitlinesPy(read_text(f))) {
      if (pyStrip(line).startsWith('/**')) note = null;
      const d = pyre('@deprecated\\s+(.*)').search(line);
      if (d) {
        note = pyStrip(d[1].replaceAll('*/', ''));
        continue;
      }
      const p = pyre('^\\s*([a-zA-Z]+)\\??\\s*:').match(line);
      if (p) {
        if (note) result.set(p[1], note);
        note = null;
      }
    }
  }
  return result;
}

// ── audit 규칙 ───────────────────────────────────────────────────────────────────────────────────
const FIXED_RULES = [
  ['from [\'\\"]ag-grid-enterprise[\'\\"]|[\'\\"]ag-grid-enterprise[\'\\"]\\s*:', 'ag-grid-enterprise 금지 (DMES ADR-0001: community/MIT 만)'],
  ['from [\'\\"]@ag-grid-(?:community|enterprise)/', '@ag-grid-community/* 스코프 패키지는 v32 에서 끊김 → ag-grid-community 단일 패키지'],
  ['ag-grid-community/styles/ag-grid\\.css|ag-theme-\\w+\\.css[\'\\"]', '레거시 CSS 테마 import → v33 Theming API(DMES 는 grid.css 의 --ag-* 변수)'],
  ['\\bcolumnApi\\b|\\bgridOptions\\.api\\b|new Grid\\(', 'v31 이전 API(columnApi/new Grid) → GridApi · createGrid'],
  ['rowSelection=\\{?[\'\\"](?:single|multiple)[\'\\"]', 'rowSelection 문자열은 v32.2 deprecated → { mode: \'singleRow\'|\'multiRow\' }'],
];
const SCREEN_IMPORT = pyre('from [\'\\"](?:ag-grid-react|ag-grid-community)[\'\\"]');
// 데이터 목록은 공용 AgDataGrid 하나로 그린다(Part B §6). 머리행(<thead>)이 있는 원시 표는 데이터 목록이다.
// 라벨-값 폼 배치 표는 <thead> 가 없어 걸리지 않는다.
const SCREEN_TABLE_RULES = [
  [pyre('<thead\\b'), '화면에서 원시 <table> 데이터 목록 금지 → AgDataGrid (작은 목록은 height="auto", Part B §6)'],
];

// ── 화면 성능 정적 점검 (docs/guide/FrontEnd/Screen-Performance-Guide.md) ─────────────────────────────
// 정규식·괄호 짝 수준의 점검이다. 확실히 잡히는 것만 오류(종료 코드 1)로 두고, 화면 설계에 따라 정상일 수 있는 것은
// 경고(종료 코드 영향 없음)로 둔다. 메시지 앞의 [P-…] 코드로 항목을 가른다.
const PERF_GUIDE = 'Screen-Performance-Guide';
// 사용자 확인 공용 캐시 모듈 — 여기만 /api/auth/me 를 직접 부른다(K3, 75e84a2b).
const AUTH_ME_CACHE = ['portal-shell', 'current-user.ts'];
const PAIRS = { '(': ')', '[': ']', '{': '}' };

/** '…' / "…" 끝 다음 위치. 줄이 끝나도 안 닫히면 JSX 글자(아포스트로피)로 보고 따옴표 하나만 건너뛴다. */
function _skip_quote(s, j) {
  const q = s[j];
  let k = j + 1;
  while (k < s.length) {
    const c = s[k];
    if (c === '\\') { k += 2; continue; }
    if (c === q) return k + 1;
    if (c === '\n') return j + 1;
    k++;
  }
  return j + 1;
}

/** `…${…}…` 끝 다음 위치. */
function _skip_template(s, j) {
  let k = j + 1;
  while (k < s.length) {
    const c = s[k];
    if (c === '\\') { k += 2; continue; }
    if (c === '`') return k + 1;
    if (c === '$' && s.startsWith('${', k)) {
      const end = match_close(s, k + 1);
      if (end < 0) return s.length;
      k = end + 1;
      continue;
    }
    k++;
  }
  return s.length;
}

/** s[i] 의 ( [ { 에 짝인 닫는 괄호 위치(문자열·템플릿 안은 건너뜀). 못 찾으면 -1. */
export function match_close(s, i) {
  const stack = [PAIRS[s[i]]];
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === '\'' || c === '"') { j = _skip_quote(s, j); continue; }
    if (c === '`') { j = _skip_template(s, j); continue; }
    if (c in PAIRS) {
      stack.push(PAIRS[c]);
    } else if (c === ')' || c === ']' || c === '}') {
      stack.pop();
      if (!stack.length) return j;
    }
    j++;
  }
  return -1;
}

// 줄 주석과 블록 주석을 같은 길이의 공백으로 바꾼다(줄 번호 유지). 문자열·템플릿 안은 그대로 둔다.
export function mask_comments(s) {
  const parts = [];
  let last = 0;
  let j = 0;
  while (j < s.length) {
    const c = s[j];
    if (c === '\'' || c === '"') {
      j = _skip_quote(s, j);
    } else if (c === '`') {
      j = _skip_template(s, j);
    } else if (s.startsWith('//', j)) {
      let end = s.indexOf('\n', j);
      end = end < 0 ? s.length : end;
      parts.push(s.slice(last, j), ' '.repeat(end - j));
      last = end;
      j = end;
    } else if (s.startsWith('/*', j)) {
      let end = s.indexOf('*/', j + 2);
      end = end < 0 ? s.length : end + 2;
      parts.push(s.slice(last, j), s.slice(j, end).replace(/[^\n]/g, ' '));
      last = end;
      j = end;
    } else {
      j++;
    }
  }
  parts.push(s.slice(last));
  return parts.join('');
}

/** s 의 최상위 [ … ] 구간들. */
function _top_level_brackets(s) {
  const found = [];
  let j = 0;
  while (j < s.length) {
    const c = s[j];
    if (c === '\'' || c === '"') { j = _skip_quote(s, j); continue; }
    if (c === '`') { j = _skip_template(s, j); continue; }
    if (c in PAIRS) {
      const end = match_close(s, j);
      if (end < 0) break;
      if (c === '[') found.push([j, end]);
      j = end + 1;
      continue;
    }
    j++;
  }
  return found;
}

const FORM_STATE = pyre('const\\s*\\[\\s*(\\w+)\\s*,\\s*(set\\w+)\\s*\\]\\s*=\\s*useState\\b(\\s*<[^>(]*>)?');
const GRID_MEMO = pyre('const\\s+(\\w+)\\s*(:[^=]+)?=\\s*useMemo\\b');
const GRID_MEMO_NAME = pyre('(?i)(columns|columndefs|coldefs|rows|rowdata|griddata)$');
const INPUT_TAG = pyre('<(Input|Textarea|TextInput|NumberInput|InputNumber|SelectOrInput)\\b');
const API_SEARCH_CALL = pyre('(?<![\\w.$])(search[A-Z]\\w*)\\s*\\(');
const AUTH_ME_FETCH = pyre('\\bfetch\\s*\\(\\s*[`\'\\"][^`\'\\"\\n]*/auth/me\\b');
const WIDGET_TIMER = pyre('(?<![\\w.$])(?:window\\.)?(setInterval)\\s*\\(|(?<![\\w.$])(?:window\\.)?(setTimeout)\\s*\\(');
// P-R8: 행 클릭·선택 처리 함수 이름(handleRowClick·chooseDetail·selectRow·pickXxx 등)과 행 이벤트 props
const ROW_HANDLER_NAME = pyre('(?i)^(?:handle|on)?(?:row(?:click|select)\\w*|choose\\w*|select(?:row|item)\\w*)$');
const ROW_EVENT_PROP = pyre('\\bon(?:RowClicked|RowSelected|SelectionChanged|RowClick|RowSelect)\\s*=\\s*\\{');
const FN_DEF = pyre(
  '\\bconst\\s+(\\w+)\\s*(?::[^=\\n]+)?=\\s*(?:async\\s+)?(?:(?:React\\.)?useCallback\\s*(?:<[^\\n]*?>)?\\s*\\(|\\([^)]*\\)\\s*(?::[^=\\n]+)?=>|\\w+\\s*=>)'
  + '|\\bfunction\\s+(\\w+)\\s*\\(',
);
const VISIBILITY_TRACE = pyre('visibilityState|visibilitychange|IntersectionObserver|useTabPage|\\bisActive\\b');
const SYNC_STORE = pyre('useSyncExternalStore\\s*\\(\\s*[\\w.$]+\\s*,\\s*(\\(\\s*\\)\\s*=>\\s*[\\w.$()]+|[\\w$]+)');
const TAB_ACTIVATED = pyre('addEventListener\\s*\\(\\s*[`\'\\"]portal-tab-activated');
const EMPTY_TERNARY = pyre('\\.length\\s*(===?\\s*0|<\\s*1|>\\s*0|!==?\\s*0)[^?;{}]*?\\?\\s*\\(');
// {rows.length > 0 && (<AgDataGrid …/>)} — 0건이면 그리드를 내리는 && 조건부 렌더(빈 상태 <p> 는 형제로 따로 둔다)
const EMPTY_AND = pyre('\\.length\\s*(?:>\\s*0|>=\\s*1|!==?\\s*0)?\\s*&&\\s*(?:!?[\\w.$?]+\\s*&&\\s*)*');
const EMPTY_SIBLING = pyre('\\.length\\s*(?:===?\\s*0|<\\s*1)[^;{}]*?&&\\s*\\(?\\s*<p\\b');
// 목록 행 타입에 본문·긴 글 열이 있는지 — types.ts 의 `CONTENT: string`, `body?: string` 류
const BIG_TEXT_FIELD = pyre('^\\s*(?:readonly\\s+)?[\\"\']?(\\w*(?:content|body|cntn|clob)\\w*)[\\"\']?\\??\\s*:\\s*string\\b(?!\\s*\\[)', 'im');
const BIG_TEXT_SKIP = pyre('(?i)format|type|kind|length|size|status');
// 호출 결과를 쥐는 setter 이름 — 콤보 옵션용(옵션·LoV·역할)인지, 그리드 데이터용인지 가른다
const OPTION_SETTER = pyre('(?i)options?|lov|roles?|choices');
// 피커 검색 래퍼 — `async function searchXxxPicks(kw): Promise<IdPickRow[]>`
const PICKER_WRAPPER = pyre('(?:async\\s+function\\s+\\w+|const\\s+\\w+\\s*=\\s*async)\\s*\\([^)]*\\)\\s*:\\s*Promise<\\w*PickRows?\\[\\]>\\s*(?:=>\\s*)?\\{');
// 사람이 판정해 둔 예외 — 파일·호출·사유·level(exempt=숨김, info=정보성 출력). 정적 분석이 못 보는 서버 상태·규모 근거를 적는다
const EXCEPTIONS_FILE = path.join(HERE, 'audit-exceptions.json');

const _is_form_state = (name, generic) => Boolean(pyre('(?:^form|Form)$').search(name)) || Boolean(generic && pyre('Form\\b').search(generic));

/** export default 함수 컴포넌트의 (이름, 본문 { 위치, } 위치). */
export function _root_component_body(t) {
  let m = pyre('export\\s+default\\s+function\\s*(\\w*)\\s*\\(').search(t);
  if (!m) {
    const d = pyre('export\\s+default\\s+(\\w+)\\s*;').search(t);
    if (!d) return null;
    m = pyre(`function\\s+(${d[1]})\\s*\\(`).search(t) || pyre(`const\\s+(${d[1]})\\s*=\\s*(?:\\w+\\()?\\s*\\(`).search(t);
    if (!m) return null;
  }
  const paramsEnd = match_close(t, m.end() - 1);
  if (paramsEnd < 0) return null;
  const b = t.indexOf('{', paramsEnd);
  const e = b >= 0 ? match_close(t, b) : -1;
  return e > 0 ? [m[1] || 'default', b, e] : null;
}

/** 본문의 `const H = …` / `function H(…)` 선언 → 선언 텍스트(괄호 짝 기준). */
export function _decl_segments(body) {
  const segs = new Map();
  const nextDecl = pyre('\\n\\s*(const|let|function|return|useEffect|useLayoutEffect)\\b');
  for (const m of pyre('(?:const\\s+(\\w+)\\s*(?::[^=]+)?=|function\\s+(\\w+)\\s*\\()').finditer(body)) {
    const name = m[1] || m[2];
    // 선언 첫 여는 괄호부터 짝 맞춤을 이어 가며 `;`·줄 끝 최상위까지를 선언으로 본다
    let j = m.end();
    let end = body.length;
    while (j < body.length) {
      const c = body[j];
      if (c in PAIRS) {
        const k = match_close(body, j);
        if (k < 0) break;
        j = k + 1;
        continue;
      }
      if (c === '\'' || c === '"') { j = _skip_quote(body, j); continue; }
      if (c === '`') { j = _skip_template(body, j); continue; }
      if (c === ';' || (c === '\n' && m[2])) { end = j; break; }
      if (c === '\n' && nextDecl.match(body, j)) { end = j; break; }
      j++;
    }
    segs.set(name, body.slice(m.start(), end));
  }
  return segs;
}

/** `<Tag` 부터 태그 끝(최상위 `>`)까지의 속성 텍스트. */
export function _tag_attrs(t, start) {
  let j = start + 1;
  while (j < t.length) {
    const c = t[j];
    if (c === '{') {
      const k = match_close(t, j);
      if (k < 0) break;
      j = k + 1;
      continue;
    }
    if (c === '\'' || c === '"') { j = _skip_quote(t, j); continue; }
    if (c === '>') return t.slice(start, j);
    j++;
  }
  return t.slice(start, j);
}

/** 위젯 파일 판정. f 는 경로 문자열. */
export function _is_widget_file(f, win = WIN) {
  const parts = path_parts(f, win);
  return parts.includes('widgets') || parts.includes('widget-types') || Boolean(pyre('widget|^renderer\\.', 'i').search(path_name(f, win)));
}

/** setTimeout 의 첫 인자가 부르는 함수가, 그 함수 자신의 본문 안에서 setTimeout 을 다시 거는 위치(재귀 타이머). */
function* _recursive_timeouts(t) {
  const cbRx = pyre('\\s*(?:\\(\\s*\\)\\s*=>\\s*)?([A-Za-z_$][\\w$]*)\\s*(?:\\(|,|\\))');
  for (const m of WIDGET_TIMER.finditer(t)) {
    if (!m[2]) continue;
    const cb = cbRx.match(t, m.end());
    if (!cb) continue;
    const name = re_escape(cb[1]);
    for (const d of pyre(`(?:function\\s+${name}\\s*\\(|const\\s+${name}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?\\()`).finditer(t)) {
      const pe = match_close(t, d.end() - 1);
      const bs = pe > 0 ? t.indexOf('{', pe) : -1;
      const be = bs >= 0 ? match_close(t, bs) : -1;
      if (be > 0 && bs < m.start() && m.start() < be) {
        yield m.start();
        break;
      }
    }
  }
}

/** useSyncExternalStore 호출 중 getSnapshot 이 상태 객체 전체인 것 [(pos, 이름)] 과 필드 단위 호출 수. */
export function _whole_state_getters(t) {
  const whole = [];
  let fields = 0;
  for (const m of SYNC_STORE.finditer(t)) {
    const g = pyStrip(m[1]);
    let body = null;
    if (g.startsWith('(')) {
      body = pyre('^\\(\\s*\\)\\s*=>\\s*').sub('', g);
    } else {
      const eg = re_escape(g);
      const d = pyre(`const\\s+${eg}\\s*(?::[^=]+)?=\\s*\\(\\s*\\)\\s*(?::[^=>]+)?=>\\s*([^;\\n]+)`).search(t)
        || pyre(`function\\s+${eg}\\s*\\(\\s*\\)[^{]*\\{\\s*return\\s+([^;}\\n]+)`).search(t);
      body = d ? pyStrip(d[1]) : null;
    }
    if (body === null) { fields++; continue; }
    const ident = pyre('[A-Za-z_$][\\w$]*').fullmatch(body);
    const eb = re_escape(body);
    if (ident && pyre(`(?:let|const|var)\\s+${eb}\\b\\s*(?::[^=;]+)?=\\s*\\{|(?:let|const|var)\\s+${eb}\\s*:\\s*\\w*(?:State|Snapshot|Store)\\b`).search(t)) {
      whole.push([m.start(), g]);
    } else {
      fields++;
    }
  }
  return [whole, fields];
}

let EXCEPTIONS_CACHE = null;
export function load_exceptions() {
  if (EXCEPTIONS_CACHE === null) {
    try {
      EXCEPTIONS_CACHE = JSON.parse(read_text(EXCEPTIONS_FILE));
    } catch {
      EXCEPTIONS_CACHE = [];
    }
  }
  return EXCEPTIONS_CACHE;
}

/** 이미 `/` 로 바꾼 절대 경로 posix 로 예외 목록을 찾는다(윈도우 역슬래시 경로는 호출 쪽이 toPosix 로 바꿔 넘긴다). */
export function exception_level_for_posix(posix, rule, call = null, exceptions = load_exceptions()) {
  for (const e of exceptions) {
    if (e.rule === rule && posix.endsWith(`/${e.path ?? '\0'}`) && (e.call == null || e.call === call)) {
      return e.level ?? 'exempt';
    }
  }
  return null;
}

/** audit-exceptions.json 에 이 파일·규칙(·호출)이 있으면 그 level(exempt|info), 없으면 null. */
function _exception_level(f, rule, call = null) {
  return exception_level_for_posix(toPosix(real_path(f)), rule, call);
}

/** opener 로 시작해 닫히는 블록(`{…}`) 중 pos 를 감싸는 것의 본문. 없으면 null. */
function _enclosing_block(t, pos, opener) {
  for (const m of opener.finditer(t)) {
    const bs = m.end() - 1;
    const be = match_close(t, bs);
    if (be > pos && pos > bs) return t.slice(bs, be);
  }
  return null;
}

const BODY_EXCLUDE_PARAM = pyre('(?:include|with)(?:content|body)[\\"\']?\\s*:\\s*false|exclude(?:content|body)[\\"\']?\\s*:\\s*true', 'i');

/** P-R1b 오탐 제거: 목록 조회가 본문 제외 파라미터(includeContent:false 등)를 넘기면 True.
 *  호출 인자에 있거나, 같은 폴더 api.ts 의 해당 search* 함수 본문에 있으면 인정한다. */
function _list_call_drops_body(f, t, call) {
  const end = match_close(t, call.end() - 1);
  if (end > 0 && BODY_EXCLUDE_PARAM.search(t.slice(call.end(), end))) return true;
  const api = path_with_name(f, 'api.ts');
  if (exists(api) && api !== f) {
    const a = mask_comments(read_audit_text(api));
    const m = pyre(`function\\s+${re_escape(call[1])}\\b`).search(a);
    if (m) {
      const nxt = pyre('\\n(?:export\\s|/\\*\\*)').search(a.slice(m.end()));
      return Boolean(BODY_EXCLUDE_PARAM.search(a.slice(m.end(), m.end() + (nxt ? nxt.index : 3000))));
    }
  }
  return false;
}

/** P-R1 에서 조건 있는 조회·옵션 조회로 볼 수 있는 호출의 사유. 없으면 null. 'info:' 로 시작하면 정보성만 남긴다. */
export function _p_r1_exclusion(t, pos, end, name, call_args) {
  // 피커 검색 래퍼(IdPicker·DomainField 의 search prop) — 입력값이 조건이다. 클라이언트에서 자르면 서버 무제한이 남을 수 있어 정보성
  const body = _enclosing_block(t, pos, PICKER_WRAPPER);
  if (body !== null) {
    return pyre('\\.slice\\(|_LIMIT\\b').search(body) ? 'info:피커 검색 래퍼, 클라이언트 상한(서버 응답 한도 확인)' : '피커 검색 래퍼';
  }
  // makeXxxSearch(...) 에 콜백으로 넘기는 검색 — DomainField 부모 후보 찾기 등
  for (const m of pyre('(?<![\\w.$])make\\w*Search\\s*\\(').finditer(t)) {
    const c = match_close(t, m.end() - 1);
    if (c > pos && pos > m.end()) return 'makeXxxSearch 콜백';
  }
  // 첫 인자가 비면 일찍 반환한 뒤 부르는 조건 검색(typeahead·onChange 핸들러)
  const tok = pyre('\\s*([A-Za-z_$][\\w$]*)\\s*(?:,|$)').match(call_args);
  if (tok) {
    const window = t.slice(Math.max(0, pos - 800), pos);
    const n = re_escape(tok[1]);
    const g = pyre(`^([ \\t]*)if\\s*\\(\\s*(?:!\\s*${n}|${n}\\s*===?\\s*[\\"']{2})\\s*\\)\\s*\\{?[\\s\\S]{0,300}?\\breturn\\b`, 'm');
    let last = null;
    for (const gm of g.finditer(window)) last = gm;
    if (last) {
      // 가드와 호출 사이에 가드보다 얕은 들여쓰기 줄(다른 함수 선언)이 있으면 같은 함수가 아니다
      const ind = cpLen(expandtabs(last[1], 2));
      const between = window.slice(last.start()).split('\n').slice(1);
      if (between.every((ln) => !pyStrip(ln) || cpLen(ln) - cpLen(pyLstrip(ln)) >= ind)) return '빈 값이면 일찍 반환하는 조건 검색';
    }
  }
  // 결과를 콤보 옵션 상태에만 담는다(그리드 data 로 가지 않음)
  const setters = pyre('\\bset([A-Z]\\w*)\\s*\\(').findall(t.slice(end, end + 400))
    .filter((x) => !pyre('(?i)error|busy|loading|searching|failed|message|open').search(x)); // 상태 표시용 setter 는 뺀다
  if (setters.length && setters.every((x) => OPTION_SETTER.search(x))) {
    // 옵션 이름이어도 그 상태가 그리드 data 로 가면 목록 조회다
    if (!setters.some((x) => pyre(`data\\s*=\\s*\\{[^}]*\\b${x[0].toLowerCase() + x.slice(1)}\\b`).search(t))) return '콤보 옵션 전용 조회';
  }
  return null;
}

/** 행 클릭·선택 처리 함수(이름 규칙 또는 행 이벤트 props)에서 onSnapshotChange 로 이어지는 위치. 없으면 null.
 *  onSnapshotChange 를 부르는 함수를 불러 내려가며(헬퍼 → 처리 함수, 최대 4단) 찾는다. */
export function _row_snapshot_write(t) {
  const bodies = new Map();
  for (const m of FN_DEF.finditer(t)) {
    const name = m[1] || m[2];
    const text = m[0];
    let body;
    if (pyRstrip(text).endsWith('(') && (m[2] || text.includes('useCallback'))) {
      const p = m.end() - 1;
      const end = match_close(t, p);
      if (end < 0) continue;
      body = t.slice(p, end);
      if (m[2]) { // function 선언: 매개변수 뒤의 { } 가 본문
        const q = t.indexOf('{', end);
        const qe = q >= 0 ? match_close(t, q) : -1;
        if (qe < 0) continue;
        body = t.slice(q, qe);
      } else { // useCallback: 끝의 의존성 배열은 본문이 아니다
        body = pyre(',\\s*\\[[^\\[\\]]*\\]\\s*$').sub('', body);
      }
    } else { // 화살표 함수
      let q = m.end();
      while (q < t.length && pyIsSpaceStr(t[q])) q++;
      if (q < t.length && t[q] === '{') {
        const qe = match_close(t, q);
        body = qe > 0 ? t.slice(q, qe) : '';
      } else {
        const semi = t.indexOf(';', q);
        body = t.slice(q, semi > 0 ? semi : q + 400);
      }
    }
    bodies.set(name, [m.start(), body]);
  }
  const touching = new Set();
  for (const [n, [, b]] of bodies) if (b.includes('onSnapshotChange')) touching.add(n);
  for (let r = 0; r < 4; r++) {
    const grown = new Set();
    for (const [n, [, b]] of bodies) {
      if (!touching.has(n) && [...touching].some((x) => pyre(`\\b${re_escape(x)}\\b`).search(b))) grown.add(n);
    }
    if (!grown.size) break;
    for (const n of grown) touching.add(n);
  }
  for (const n of [...touching].sort(compareCodePoint)) {
    if (ROW_HANDLER_NAME.match(n)) return bodies.get(n)[0];
  }
  for (const m of ROW_EVENT_PROP.finditer(t)) {
    const end = match_close(t, m.end() - 1);
    const body = end > 0 ? t.slice(m.end(), end) : '';
    if (body.includes('onSnapshotChange') || [...touching].some((x) => pyre(`\\b${re_escape(x)}\\b`).search(body))) return m.start();
  }
  return null;
}

/** 화면 성능 가이드에서 정적으로 잡히는 항목. error(pos, msg)·warn(pos, msg)·info(pos, msg) 로 낸다. f 는 경로 문자열. */
export function perf_audit(f, raw, in_shared, error, warn, info = null) {
  info = info || warn;
  const parts = path_parts(f);
  const name = path_name(f);
  if (parts.includes('tests') || parts.includes('__tests__') || parts.includes('e2e') || pyre('\\.(test|spec)\\.[jt]sx?$').search(name)) return;
  const t = mask_comments(raw);

  // P-K: /api/auth/me 직접 호출 — 공용 캐시(getCurrentUser) 를 거치지 않으면 진입마다 요청이 는다(R9·K3)
  if (parts.slice(-2).join('\0') !== AUTH_ME_CACHE.join('\0')) {
    for (const m of AUTH_ME_FETCH.finditer(t)) {
      error(m.start(), '[P-K] /api/auth/me 직접 호출 → getCurrentUser()·useCurrentUserId() '
        + `(@dk-oasis/shared/portal-shell) 를 쓴다 (${PERF_GUIDE} R9·K3)`);
    }
  }

  // P-R10: 전역 탭 활성화 이벤트로 다시 읽으면서 자기 탭인지 보지 않는다
  if (TAB_ACTIVATED.search(t) && !t.includes('tabId')) {
    const m = TAB_ACTIVATED.search(t);
    warn(m.start(), '[P-R10 경고] portal-tab-activated 를 받으며 tabId 비교가 없다 → 어느 탭이 활성화돼도 다시 조회한다. '
      + `useTabPage().tabId 와 detail.tabId 를 비교한다 (${PERF_GUIDE} R10·K5)`);
  }

  // P-R14: 위젯의 타이머가 탭 활성·표시 여부를 보지 않는다 — 숨은 탭에서도 계속 조회한다(R14)
  if (_is_widget_file(f) && !VISIBILITY_TRACE.search(t)) {
    let hit = null;
    for (const m of WIDGET_TIMER.finditer(t)) {
      if (m[1]) { hit = m; break; }
    }
    let pos;
    if (hit) pos = hit.start();
    else {
      const nx = _recursive_timeouts(t).next();
      pos = nx.done ? null : nx.value;
    }
    if (pos !== null) {
      const lvl = _exception_level(f, 'P-R14');
      if (lvl !== 'exempt') {
        (lvl === 'info' ? info : warn)(pos, `[P-R14 ${lvl === 'info' ? '정보' : '경고'}] 위젯 파일에 setInterval·재귀 setTimeout 이 있는데 표시 확인(visibilityState·visibilitychange·`
          + 'IntersectionObserver·useTabPage·isActive)이 없다 → 숨은 탭·접힌 위젯도 계속 조회한다. '
          + `자동 새로 고침은 틀(refreshSec)에 맡기거나 표시 여부와 연동한다 (${PERF_GUIDE} R14)`);
      }
    }
  }

  // P-R16: 외부 스토어를 통째 상태로만 구독 — 필드 훅이 없으면 한 필드만 바뀌어도 모든 구독자가 다시 그려진다(R16)
  const [whole, fields] = _whole_state_getters(t);
  if (whole.length && !fields && pyre('export\\s+(?:function|const)\\s+use\\w+').search(t)) {
    warn(whole[0][0], `[P-R16 경고] useSyncExternalStore 가 상태 객체 전체(\`${whole[0][1]}\`)만 돌려주고 필드 단위 훅이 없다 `
      + `→ 한 필드만 바뀌어도 구독자가 모두 다시 그려진다. 필드별 훅(getSnapshot 이 그 필드만 돌려줌)을 내보낸다 (${PERF_GUIDE} R16)`);
  }

  // P-R8: 행 클릭·선택 처리가 onSnapshotChange 를 부른다 — 선택 행은 snapshot 에 넣지 않는다(R8, 2026-10-05 사용자 결정)
  if (t.includes('onSnapshotChange')) {
    const pos = _row_snapshot_write(t);
    if (pos !== null) {
      error(pos, '[P-R8] 행 클릭·선택 처리에서 onSnapshotChange 를 부른다 → 클릭마다 포털 셸이 다시 렌더된다. '
        + `선택 행은 탭 snapshot 에 넣지 않는다(조회 조건이 바뀔 때만 부른다) (${PERF_GUIDE} R8)`);
    }
  }

  if (in_shared) return;
  const states = [];
  for (const m of FORM_STATE.finditer(t)) if (_is_form_state(m[1], m[3])) states.push([m, m[1], m[2]]);

  // P-R12: 그리드 열·행 useMemo deps 에 폼 객체 전체
  for (const m of GRID_MEMO.finditer(t)) {
    const gname = m[1];
    const annot = m[2] || '';
    let k = m.end();
    let generic = '';
    if (t.startsWith('<', k)) { // useMemo<GridColumn[]>(
      let depth = 0;
      let j = k;
      while (j < t.length) {
        depth += { '<': 1, '>': -1 }[t[j]] ?? 0;
        if (depth === 0) break;
        j++;
      }
      generic = t.slice(k, j + 1);
      k = j + 1;
    }
    const p = t.indexOf('(', k);
    if (p < 0 || !(GRID_MEMO_NAME.search(gname) || pyre('GridColumn|ColDef').search(annot + generic))) continue;
    const end = match_close(t, p);
    if (end < 0) continue;
    const inner = t.slice(p + 1, end);
    const brackets = _top_level_brackets(inner);
    if (!brackets.length) continue;
    const last = brackets[brackets.length - 1];
    const deps = inner.slice(last[0], last[1] + 1);
    for (const [, sname] of states) {
      if (pyre(`(?<![\\w.$])${sname}(?![\\w$]|\\s*\\??\\.)`).search(deps)) {
        error(m.start(), `[P-R12] 그리드 useMemo \`${gname}\` deps 에 폼 상태 \`${sname}\` 전체 → 입력 한 글자마다 그리드 참조가 `
          + `새로 생겨 셀이 다시 그려진다. 쓰는 값만 deps 에 두거나 셀 렌더러가 ref 로 읽는다 (${PERF_GUIDE} R12)`);
      }
    }
  }

  // P-R12b: 화면 루트의 폼 state 를 입력 onChange 가 매 글자 바꾼다
  const suffix = path_suffix(name);
  const root = suffix === '.tsx' || suffix === '.jsx' ? _root_component_body(t) : null;
  if (root) {
    const [rname, b, e] = root;
    const body = t.slice(b, e);
    let segs = null;
    for (const [m, sname, setter] of states) {
      if (!(b < m.start() && m.start() < e)) continue;
      segs = segs !== null ? segs : _decl_segments(body);
      const via = new Set([setter]);
      for (const [h, seg] of segs) if (h !== setter && pyre(`\\b${setter}\\b`).search(seg)) via.add(h);
      const viaRx = pyre(`\\b(${[...via].sort(compareCodePoint).map(re_escape).join('|')})\\b`);
      for (const tag of INPUT_TAG.finditer(body)) {
        const attrs = _tag_attrs(body, tag.start());
        const oc = pyre('\\bonChange\\s*=\\s*\\{').search(attrs);
        if (oc && viaRx.search(attrs.slice(oc.end() - 1, match_close(attrs, oc.end() - 1) + 1))) {
          warn(m.start(), `[P-R12b 경고] 화면 루트 \`${rname}\` 의 폼 상태 \`${sname}\` 를 <${tag[1]}> onChange 가 매 글자 바꾼다 `
            + `→ 글자마다 화면 루트 전체가 다시 렌더된다. 상세 폼을 별도 컴포넌트로 나누고 state 를 그 안에 둔다 (${PERF_GUIDE} R12)`);
          break;
        }
      }
    }
  }

  // P-R1: import 한 목록 조회 API 에 첫 조회 상한이 없고 GridLimitNotice 도 없다.
  // 목록을 그리는 파일(page.tsx 또는 AgDataGrid·GridPanel 을 쓰는 파일)만 본다 — 입력 자동완성·Lookup 피커는 입력값이
  // 조건이라 대상이 아니다. 인자에 limit·size·max·page(상한·페이징)가 있으면 통과.
  const lists_rows = name === 'page.tsx' || pyre('<(AgDataGrid|GridPanel)\\b').search(t);
  const afterKeyword = pyre('(function|import|as)\\s*$');
  if (name !== 'api.ts' && lists_rows && !t.includes('GridLimitNotice')) {
    const imported = new Set();
    for (const imp of pyre('import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from').finditer(t)) {
      for (const n of pyre('\\b(search[A-Z]\\w*)\\b').findall(imp[1])) imported.add(n);
    }
    for (const m of API_SEARCH_CALL.finditer(t)) {
      if (!imported.has(m[1]) || afterKeyword.search(t.slice(Math.max(0, m.start() - 20), m.start()))) continue;
      const end = match_close(t, m.end() - 1);
      const call_args = end > 0 ? t.slice(m.end(), end) : '';
      // 상위 키(…Id·…Code·key)로 묶인 조회(마스터-디테일 하위·단건·중복 확인)는 조건이 있는 조회다. 검색 조건 객체의
      // 칸(filters.unitCode 등)은 비어 있을 수 있으므로 키로 치지 않는다.
      const keyed = pyre('[A-Za-z_$][\\w$.]*').findall(call_args).some((tok) => {
        const lastSeg = tok.split('.').pop();
        return pyre('(?i)(id|code|key)$|^token$').search(lastSeg) && !pyre('(filters?|f|cond|conditions?|query|params)\\.').match(tok);
      });
      if (end > 0 && !keyed && !pyre('(?i)limit|size|max|\\bpage\\b').search(call_args)) {
        const lvl = _exception_level(f, 'P-R1', m[1]);
        if (lvl === 'exempt') continue;
        const why = lvl === null ? _p_r1_exclusion(t, m.start(), end, m[1], call_args) : null;
        if (why && !why.startsWith('info:')) continue;
        if (lvl === 'info' || why) {
          info(m.start(), `[P-R1 정보] 목록 조회 \`${m[1]}(…)\` 에 첫 조회 상한이 없다`
            + (why ? ` — ${why.slice(5)}` : ' — 예외 목록(audit-exceptions.json)에 정보성으로 올라 있다'));
          continue;
        }
        warn(m.start(), `[P-R1 경고] 목록 조회 \`${m[1]}(…)\` 에 첫 조회 상한(limit)이 없고 화면에 GridLimitNotice 가 없다 `
          + `→ 조건 없는 조회면 전체 행을 받는다. 필수 조건을 두거나 FIRST_SEARCH_LIMIT 를 넘기고 잘리면 `
          + `GridLimitNotice 를 보인다 (${PERF_GUIDE} R1)`);
      }
    }
  }

  // P-R1b: 목록을 그리는 파일이 search* 를 부르는데 같은 폴더 types.ts 의 행 타입에 본문 열이 있다 — 행마다 본문을 실어 보낼 수 있다
  if (lists_rows && name !== 'api.ts' && (suffix === '.tsx' || suffix === '.ts') && _exception_level(f, 'P-R1b') !== 'exempt') {
    const tf = path_with_name(f, 'types.ts');
    let call = null;
    for (const m of API_SEARCH_CALL.finditer(t)) {
      if (!afterKeyword.search(t.slice(Math.max(0, m.start() - 20), m.start()))) { call = m; break; }
    }
    if (call && exists(tf) && tf !== f) {
      const cols = [...new Set(BIG_TEXT_FIELD.findall(read_audit_text(tf)).filter((n) => !BIG_TEXT_SKIP.search(n)))].sort(compareCodePoint);
      if (cols.length && !_list_call_drops_body(f, t, call)) {
        (_exception_level(f, 'P-R1b') === 'info' ? info : warn)(call.start(), `[P-R1b 경고] 목록 조회 \`${call[1]}(…)\` 를 쓰는 화면의 types.ts 에 본문·긴 글 열(${cols.join(', ')})이 있다 `
          + '→ 목록 응답이 행마다 본문을 실으면 누적될 때 수 MB 가 된다. 목록에는 그리드에 보이는 열만 싣고 '
          + `본문은 행 선택 때 상세 조회로 받는다 (${PERF_GUIDE} R1)`);
      }
    }
  }

  // P-R6: 0건이면 AgDataGrid 를 언마운트하는 3항
  if (suffix === '.tsx' || suffix === '.jsx') {
    const elseRx = pyre('\\s*:\\s*\\(');
    for (const m of EMPTY_TERNARY.finditer(t)) {
      const a_end = match_close(t, m.end() - 1);
      if (a_end < 0) continue;
      const rest = elseRx.match(t, a_end + 1);
      if (!rest) continue;
      const b_start = rest.end() - 1;
      const b_end = match_close(t, b_start);
      const then_b = t.slice(m.end(), a_end);
      const else_b = t.slice(b_start, b_end);
      const cond = pyLstrip(m[1]);
      const empty_first = !(cond.startsWith('>') || cond.startsWith('!'));
      const [grid_b, other_b] = empty_first ? [else_b, then_b] : [then_b, else_b];
      if (grid_b.includes('<AgDataGrid') && !other_b.includes('<AgDataGrid')) {
        warn(m.start(), '[P-R6 경고] 0건이면 AgDataGrid 를 내린다 → 조회마다 그리드를 새로 만든다. '
          + `그리드를 늘 두고 빈 상태는 emptyMessage 로 보인다 (${PERF_GUIDE} R6)`);
      }
    }
    // && 조건부 렌더: {rows.length > 0 && (<AgDataGrid/>)} — 3항과 같은 언마운트
    for (const m of EMPTY_AND.finditer(t)) {
      const k = m.end();
      let grid;
      if (t.startsWith('(', k)) {
        const e = match_close(t, k);
        grid = e > 0 && t.slice(k, e).includes('<AgDataGrid');
      } else {
        grid = t.startsWith('<AgDataGrid', k);
      }
      // 빈 상태 <p> 가 형제로 따로 있는 쌍만 본다 — 0건 안내를 그리드 밖에 두는 구조라 0↔N 전환에 그리드가 내려간다
      const sibling = grid && EMPTY_SIBLING.search(t.slice(Math.max(0, m.start() - 900), m.start()) + t.slice(k, k + 1200));
      if (grid && sibling) {
        warn(m.start(), '[P-R6 경고] 행이 있을 때만(`&&`) AgDataGrid 를 그린다 → 0건이면 그리드를 내리고 조회마다 새로 만든다. '
          + `그리드를 늘 두고 빈 상태는 emptyMessage 로 보인다 (${PERF_GUIDE} R6)`);
      }
    }
  }
}

const SF_FORM_IMPORT = pyre('import\\s*\\{[^}]*\\b(?:Input|Select|DatePicker|DateTimePicker)\\b[^}]*\\}\\s*from\\s*[\"\']@dk-oasis/shared/form[\"\']');
const SF_SEARCH_BUTTON = pyre('<(?:Button|button)\\b[^>]*>\\s*조회\\s*</(?:Button|button)>');
const SF_DIALOG_FILE = pyre('(?:Pop|Modal|Dialog|Popup)\\w*\\.tsx$|role=[\"\']dialog[\"\']|<Modal\\b');

/** P-S1: 화면이 SearchArea 없이 shared/form 입력 칸과 [조회] 단추로 자체 조회 폼을 그린다 — 조회 기본값(설정 아이콘)이 빠진다.
 *  서버 조회 조건이 아닌 빠른 찾기(조회 단추 없이 이미 받은 목록만 좁히는 칸)와 대화 상자는 대상이 아니다. warn(pos, msg) 로 낸다. */
export function search_form_audit(f, raw, in_shared, warn) {
  if (in_shared || path_suffix(path_name(f)) !== '.tsx') return;
  const parts = path_parts(f);
  const name = path_name(f);
  if (parts.includes('tests') || parts.includes('__tests__') || parts.includes('e2e') || pyre('\\.(test|spec)\\.[jt]sx?$').search(name)) return;
  if (!parts.includes('pages') && !parts.includes('page-components')) return;
  if (_exception_level(f, 'P-S1') === 'exempt') return;
  const t = mask_comments(raw);
  if (t.includes('<SearchArea') || SF_DIALOG_FILE.search(f) || SF_DIALOG_FILE.search(t)) return;
  if (!SF_FORM_IMPORT.search(t)) return;
  const m = SF_SEARCH_BUTTON.search(t);
  if (!m) return;
  warn(m.start(), '[P-S1 경고] SearchArea 없이 shared/form 입력 칸과 [조회] 단추로 자체 조회 폼을 그린다 → 조회 기본값(설정 아이콘)이 빠진다. '
    + '목록 조회 조건은 SearchArea·SearchField 로 만들고 칸마다 name 또는 defaultKey 를 단다 (대화 상자 안은 예외, search-area.md)');
}

const SKIP_DIRS = ['node_modules', '.next', 'dist', 'build'];

/** audit 대상 파일 열거. 폴더는 재귀(.tsx/.ts/.jsx, 제외 폴더 이름이 경로 성분에 있으면 제외), 파일은 그대로. 표시 경로는 python Path 문자열. */
export function collect_audit_files(paths) {
  const files = [];
  for (const arg of paths) {
    const p = path_norm(arg);
    let st = null;
    try { st = fs.statSync(p); } catch { /* 없음 */ }
    if (st && st.isDirectory()) {
      const root = path.resolve(p);
      for (const full of walkSorted(root, { skipDirs: SKIP_DIRS, skipUnreadable: true })) {
        const rel = path.relative(root, full).split(path.sep).join(SEP);
        const disp = path_join(p, rel);
        if (['.tsx', '.ts', '.jsx'].includes(path_suffix(path_name(disp))) && !path_parts(disp).some((x) => SKIP_DIRS.includes(x))) files.push(disp);
      }
    } else if (st) {
      files.push(p);
    }
  }
  return files;
}

function countNewlines(text, pos) {
  let n = 0;
  for (let i = text.indexOf('\n'); i >= 0 && i < pos; i = text.indexOf('\n', i + 1)) n++;
  return n;
}

function cmd_audit(args) {
  const files = collect_audit_files(args.paths);
  const deprecated = deprecated_props();
  const dep_rx = deprecated.size
    ? pyre(`\\b(${[...deprecated.keys()].sort((a, b) => cpLen(b) - cpLen(a)).join('|')})\\b\\s*[:=]`)
    : null;
  const fixed = FIXED_RULES.map(([rx, msg]) => [pyre(rx), msg]);
  let issues = 0;
  let warnings = 0;
  let infos = 0;

  const emit = (f, text, pos, msg) => out(`${f}:${countNewlines(text, pos) + 1}: ${msg}`);
  const report = (f, text, pos, msg) => { emit(f, text, pos, msg); issues++; };
  const report_warn = (f, text, pos, msg) => { emit(f, text, pos, msg); warnings++; };
  const report_info = (f, text, pos, msg) => { emit(f, text, pos, msg); infos++; };

  for (const f of files) {
    const text = read_audit_text(f);
    const uses_grid = text.includes('ag-grid') || text.includes('AgGridReact') || text.includes('ColDef');
    const fparts = path_parts(f);
    const in_shared = fparts.includes('shared') && fparts.includes('src');
    for (const [rx, msg] of fixed) {
      for (const m of rx.finditer(text)) report(f, text, m.start(), msg);
    }
    if (!in_shared) {
      for (const m of SCREEN_IMPORT.finditer(text)) report(f, text, m.start(), '화면에서 ag-grid 직접 import 금지 → @dk-oasis/shared/grid (Part B §6)');
      const suffix = path_suffix(path_name(f));
      if (suffix === '.tsx' || suffix === '.jsx') {
        for (const [rx, msg] of SCREEN_TABLE_RULES) {
          for (const m of rx.finditer(text)) report(f, text, m.start(), msg);
        }
      }
    }
    if (dep_rx && uses_grid) {
      for (const m of dep_rx.finditer(text)) {
        const name = m[1];
        const note = deprecated.get(m[1]);
        // `rowSelection.isRowSelectable` 처럼 같은 이름으로 옮겨 간 속성은 객체 키(`name:`)로 쓰면 정상이다
        const moved_same_name = pyre(`\`\\w+\\.${name}\\b`).search(note);
        if (moved_same_name && pyRstrip(m[0]).endsWith(':')) continue;
        report(f, text, m.start(), `\`${name}\` deprecated: ${note}`);
      }
    }
    perf_audit(f, text, in_shared,
      (pos, msg) => report(f, text, pos, msg),
      (pos, msg) => report_warn(f, text, pos, msg),
      (pos, msg) => report_info(f, text, pos, msg));
    search_form_audit(f, text, in_shared, (pos, msg) => report_warn(f, text, pos, msg));
  }
  out(`\n${files.length}개 파일 점검, 의심 ${issues}건 (deprecated 기준: 설치본 ${deprecated.size}개 속성)`
    + (warnings ? `, 성능 경고 ${warnings}건(종료 코드 무관)` : '')
    + (infos ? `, 정보 ${infos}건` : '')
    + (issues ? '' : ' — 통과'));
  throw new SysExit(null, issues ? VIOLATION : OK);
}

function cmd_refresh() {
  try {
    const st = fs.lstatSync(CACHE);
    if (st.isDirectory()) fs.rmSync(CACHE, { recursive: true, force: true });
  } catch { /* shutil.rmtree(ignore_errors=True) */ }
  out(`캐시 삭제: ${CACHE}`);
}

// ── 명령줄 ───────────────────────────────────────────────────────────────────────────────────────
// -h/--help 에 보이는 설명. python 판은 머리말(docstring)을 그대로 보여 줬다(RawDescriptionHelpFormatter) — 사용 예는 node 호출 형태로 옮겼다.
const DESCRIPTION = `ag-grid-community 버전 맞춤 문서 조회 + 사용법 점검 도구.

ag-grid.com 의 llms.txt · \`.md\` 는 **최신 메이저**만 제공한다. 설치 버전 문서는
\`/archive/{x.y.z}/{framework}-data-grid/{slug}/\` HTML 로만 열리므로 텍스트로 바꿔 캐시한다.
슬러그 색인과 권장사항은 공식 스킬 ag-grid/skills(ag-dev) 의 references 를 쓴다.

  node aggrid_docs.mjs version                    # 설치된 ag-grid-community / react 버전
  node aggrid_docs.mjs search <단어...>            # 공식 슬러그 색인 검색
  node aggrid_docs.mjs get <slug> [--section 제목] [--version x.y.z] [--latest]
  node aggrid_docs.mjs types <이름>                # 설치 .d.ts 에서 옵션·인터페이스 정의 찾기
  node aggrid_docs.mjs recommendations            # 공식 ag-dev 권장사항(LLM 흔한 실수)
  node aggrid_docs.mjs audit <경로...>             # deprecated 옵션·금지 import 점검 + 화면 성능 정적 점검(P-*)
  node aggrid_docs.mjs refresh                    # 캐시 비우기`;
export const CLI_SPEC = {
  prog: 'aggrid_docs.mjs',
  description: DESCRIPTION,
  commands: {
    version: {},
    search: { options: { limit: { type: 'int', default: 30 } }, positionals: [{ name: 'terms', variadic: true }] },
    get: {
      options: {
        section: { type: 'string' },
        version: { type: 'string' },
        framework: { type: 'string', default: 'react', choices: ['react', 'javascript', 'angular', 'vue'] },
        latest: { type: 'boolean' },
      },
      positionals: [{ name: 'slug' }],
    },
    types: {
      options: { after: { type: 'int', default: 3 }, limit: { type: 'int', default: 5 } },
      positionals: [{ name: 'name' }],
    },
    recommendations: {},
    audit: { positionals: [{ name: 'paths', variadic: true }] },
    refresh: {},
  },
};

/** argparse 는 `--limit -5` 의 -5 를 값으로 받는다(음수 모양 인자). util.parseArgs 는 못 받으니 `=` 로 붙여 준다. */
function glue_negative_numbers(argv) {
  const res = [];
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--limit' || argv[i] === '--after') && /^-\d+$/.test(argv[i + 1] ?? '')) {
      res.push(`${argv[i]}=${argv[i + 1]}`);
      i++;
    } else {
      res.push(argv[i]);
    }
  }
  return res;
}

export async function main(argv = process.argv.slice(2)) {
  const cli = parseCli(glue_negative_numbers(argv), CLI_SPEC);
  if (!cli) return;
  const args = { ...cli.values, ...cli.positionals };
  try {
    switch (cli.command) {
      case 'version': cmd_version(); break;
      case 'search': await cmd_search(args); break;
      case 'get': await cmd_get(args); break;
      case 'types': cmd_types(args); break;
      case 'recommendations': await cmd_recommendations(); break;
      case 'audit': cmd_audit(args); break;
      case 'refresh': cmd_refresh(); break;
      default: break;
    }
  } catch (e) {
    if (e instanceof SysExit) {
      if (e.sysMessage !== null) process.stderr.write(`${e.sysMessage}\n`);
      finish(e.code);
      return;
    }
    process.stderr.write(`[error] ${e?.stack ?? e}\n`);
    finish(VIOLATION);
  }
}

STATIC_PATTERNS.push(...compiled_patterns());

function isMain() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) await main();
