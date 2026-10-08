// jq 1.7.1 과 글자 하나까지 같게 JSON 을 읽고 쓰는 최소 구현. coordinator 의 JS 이식이 state.json·설정을 jq 와 같은 모양으로 다루게 한다.
//   · 객체는 Map(삽입 순서 유지 — JS 객체는 "1000000" 같은 정수 꼴 키를 앞으로 당겨 jq 와 순서가 달라진다), 배열은 Array,
//     문자열·true/false/null 은 그대로, 숫자는 읽은 글 그대로 보존하는 JNum(jq 1.7 의 숫자 리터럴 보존) 또는 계산으로 생긴 JS number.
//   · stringify(v, {indent: 2|0}) = jq `.`(2칸 들여쓰기)·`-c`(compact). 키 순서는 삽입 순서, 문자열 이스케이프는 jq 와 같다
//     (\" \\ \b \f \n \r \t, 그 밖의 U+0000~U+001F 와 DEL(U+007F)은 \u00XX 소문자 16진, 나머지 비 ASCII 는 그대로).
//   · 숫자 출력: JNum 은 decNumber 의 to-scientific-string(1.0→1.0, 1e3→1E+3, 0.10→0.10), JS number 는 jq 의 dtoa 꼴(1e+17, 1e-05).
//   · 읽기 오류는 JqError(message) 를 던진다(jq 종료 코드 2 에 해당). 접근 오류(Cannot index …)는 JqError(code 5).
// node 18.17 이상, 외부 패키지 없음.

export class JqError extends Error {
  constructor(message, code = 2) { super(message); this.name = 'JqError'; this.code = code; }
}

/** 읽은 숫자 글을 그대로 가진 숫자. valueOf 로 계산에 쓴다. */
export class JNum {
  constructor(lit) { this.lit = lit; }
  valueOf() { return Number(this.lit); }
  toString() { return numberText(this); }
}

const NUM_RE = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/** decNumber to-scientific-string (jq 1.7.1 이 리터럴을 낼 때 쓰는 꼴) */
function decText(lit) {
  const m = NUM_RE.exec(lit);
  if (!m) return lit;
  const [, sign, ip, fp = '', ex = '0'] = m;
  let digits = (ip + fp).replace(/^0+(?=\d)/, '');
  let exp = Number(ex) - fp.length;
  const nd = digits.length;
  const adj = exp + nd - 1;
  let body;
  if (exp <= 0 && adj >= -6) {
    if (exp === 0) body = digits;
    else if (nd > -exp) body = `${digits.slice(0, nd + exp)}.${digits.slice(nd + exp)}`;
    else body = `0.${'0'.repeat(-exp - nd)}${digits}`;
  } else {
    body = `${digits[0]}${nd > 1 ? `.${digits.slice(1)}` : ''}E${adj >= 0 ? '+' : '-'}${Math.abs(adj)}`;
  }
  return sign + body;
}

/** jq 가 계산으로 생긴 double 을 낼 때의 꼴(David Gay g_fmt 변형: 유효 숫자 최단, 지수 2자리 이상) */
function dtoaText(x) {
  if (Number.isNaN(x)) return 'null';
  if (!Number.isFinite(x)) return x > 0 ? '1.7976931348623157e+308' : '-1.7976931348623157e+308';
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  const sign = x < 0 ? '-' : '';
  const [mant, e] = Math.abs(x).toExponential().split('e');
  const digits = mant.replace('.', '');
  const nd = digits.length;
  const decpt = Number(e) + 1;
  let body;
  if (decpt <= -4 || decpt > nd + 15) {
    const ex = decpt - 1;
    body = `${digits[0]}${nd > 1 ? `.${digits.slice(1)}` : ''}e${ex < 0 ? '-' : '+'}${String(Math.abs(ex)).padStart(2, '0')}`;
  } else if (decpt <= 0) body = `0.${'0'.repeat(-decpt)}${digits}`;
  else if (decpt >= nd) body = digits + '0'.repeat(decpt - nd);
  else body = `${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
  return sign + body;
}

export function numberText(n) { return n instanceof JNum ? decText(n.lit) : dtoaText(n); }

// ---------- 읽기 ----------
class Parser {
  constructor(text) { this.s = text; this.i = 0; }
  ws() { const s = this.s; while (this.i < s.length) { const c = s.charCodeAt(this.i); if (c === 32 || c === 9 || c === 10 || c === 13) this.i++; else break; } }
  fail(msg) { throw new JqError(`parse error: ${msg} at offset ${this.i}`); }
  value() {
    this.ws();
    const s = this.s, c = s[this.i];
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === '"') return this.string();
    if (c === 't' && s.startsWith('true', this.i)) { this.i += 4; return true; }
    if (c === 'f' && s.startsWith('false', this.i)) { this.i += 5; return false; }
    if (c === 'n' && s.startsWith('null', this.i)) { this.i += 4; return null; }
    if (c === '-' || (c >= '0' && c <= '9')) return this.number();
    return this.fail(this.i >= s.length ? 'Unfinished JSON term' : 'Invalid literal');
  }
  number() {
    const m = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    m.lastIndex = this.i;
    const r = m.exec(this.s);
    if (!r) this.fail('Invalid numeric literal');
    this.i = m.lastIndex;
    return new JNum(r[0]);
  }
  string() {
    const s = this.s;
    let i = this.i + 1, out = '';
    for (;;) {
      if (i >= s.length) { this.i = i; this.fail('Unfinished string'); }
      const c = s.charCodeAt(i);
      if (c === 34) { this.i = i + 1; return out; }
      if (c < 32) { this.i = i; this.fail('Invalid string: control characters from U+0000 through U+001F must be escaped'); }
      if (c === 92) {
        const e = s[i + 1];
        i += 2;
        switch (e) {
          case '"': out += '"'; break; case '\\': out += '\\'; break; case '/': out += '/'; break;
          case 'b': out += '\b'; break; case 'f': out += '\f'; break; case 'n': out += '\n'; break; case 'r': out += '\r'; break; case 't': out += '\t'; break;
          case 'u': {
            const h = s.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(h)) { this.i = i; this.fail('Invalid escape'); }
            let cp = parseInt(h, 16);
            i += 4;
            if (cp >= 0xd800 && cp < 0xdc00) {   // 높은 서로게이트는 \uXXXX 낮은 서로게이트가 바로 이어져야 한다
              const l = s.slice(i, i + 6);
              if (/^\\u[dD][c-fC-F][0-9a-fA-F]{2}$/.test(l)) { cp = 0x10000 + ((cp - 0xd800) << 10) + (parseInt(l.slice(2), 16) - 0xdc00); i += 6; }
              else { this.i = i; this.fail('Invalid \\uXXXX\\uXXXX surrogate pair escape'); }
            } else if (cp >= 0xdc00 && cp < 0xe000) { this.i = i; this.fail('Invalid \\uXXXX\\uXXXX surrogate pair escape'); }
            out += String.fromCodePoint(cp);
            break;
          }
          default: this.i = i; this.fail('Invalid escape');
        }
        continue;
      }
      let j = i + 1;
      while (j < s.length) { const d = s.charCodeAt(j); if (d === 34 || d === 92 || d < 32) break; j++; }
      out += s.slice(i, j);
      i = j;
    }
  }
  array() {
    this.i++;
    const a = [];
    this.ws();
    if (this.s[this.i] === ']') { this.i++; return a; }
    for (;;) {
      a.push(this.value());
      this.ws();
      const c = this.s[this.i++];
      if (c === ',') continue;
      if (c === ']') return a;
      this.i--; this.fail('Expected separator between values');
    }
  }
  object() {
    this.i++;
    const m = new Map();
    this.ws();
    if (this.s[this.i] === '}') { this.i++; return m; }
    for (;;) {
      this.ws();
      if (this.s[this.i] !== '"') this.fail('Object keys must be strings');
      const k = this.string();
      this.ws();
      if (this.s[this.i++] !== ':') { this.i--; this.fail('Objects must consist of key:value pairs'); }
      m.set(k, this.value());
      this.ws();
      const c = this.s[this.i++];
      if (c === ',') continue;
      if (c === '}') return m;
      this.i--; this.fail('Expected separator between values');
    }
  }
}

/** 글 전체가 JSON 값 하나여야 한다. */
export function parse(text) {
  const p = new Parser(text);
  const v = p.value();
  p.ws();
  if (p.i < text.length) p.fail('Unexpected extra JSON values');
  return v;
}

/** `jq -s` 처럼 이어 붙은 JSON 값 여러 개(공백이 없어도 됨)를 배열로. 값이 없으면 빈 배열. */
export function parseStream(text) {
  const p = new Parser(text);
  const out = [];
  for (;;) {
    p.ws();
    if (p.i >= text.length) return out;
    out.push(p.value());
  }
}

// ---------- 쓰기 ----------
const ESC = { 8: '\\b', 9: '\\t', 10: '\\n', 12: '\\f', 13: '\\r', 34: '\\"', 92: '\\\\' };
function strText(s) {
  let out = '"', last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 34 || c === 92 || c === 127) {
      out += s.slice(last, i) + (ESC[c] || `\\u${c.toString(16).padStart(4, '0')}`);
      last = i + 1;
    }
  }
  return out + s.slice(last) + '"';
}

/** jq 출력과 같은 글. indent 2(기본)=`jq .`, 0=`jq -c`. 끝 줄바꿈은 붙이지 않는다. */
export function stringify(v, { indent = 2 } = {}) {
  const w = (x, depth) => {
    if (x === null || x === undefined) return 'null';
    if (x === true) return 'true';
    if (x === false) return 'false';
    if (typeof x === 'string') return strText(x);
    if (typeof x === 'number' || x instanceof JNum) return numberText(x);
    const nl = indent ? `\n${' '.repeat(indent * (depth + 1))}` : '';
    const end = indent ? `\n${' '.repeat(indent * depth)}` : '';
    if (Array.isArray(x)) {
      if (!x.length) return '[]';
      return `[${nl}${x.map((e) => w(e, depth + 1)).join(`,${nl}`)}${end}]`;
    }
    if (x instanceof Map) {
      if (!x.size) return '{}';
      const kv = [];
      for (const [k, e] of x) kv.push(`${strText(k)}:${indent ? ' ' : ''}${w(e, depth + 1)}`);
      return `{${nl}${kv.join(`,${nl}`)}${end}}`;
    }
    throw new JqError(`stringify: 지원하지 않는 값 ${typeof x}`);
  };
  return w(v, 0);
}

// ---------- jq 연산 흉내(필요한 것만) ----------
export const typeName = (v) => (v === null ? 'null' : typeof v === 'boolean' ? 'boolean' : typeof v === 'string' ? 'string' : typeof v === 'number' || v instanceof JNum ? 'number' : Array.isArray(v) ? 'array' : 'object');

/** `.key` — null 이면 null, 객체면 값(없으면 null), 그 밖은 jq 와 같은 오류 */
export function index(v, key) {
  if (v === null || v === undefined) return null;
  if (v instanceof Map) return v.has(key) ? v.get(key) : null;
  throw new JqError(`Cannot index ${typeName(v)} with "${key}"`, 5);
}
/** `a // b` — a 가 null·false 면 b */
export const alt = (a, b) => (a === null || a === undefined || a === false ? b : a);
/** `tostring` */
export function tostring(v) { return typeof v === 'string' ? v : stringify(v, { indent: 0 }); }
/** `tojson` (compact 글) */
export const tojson = (v) => stringify(v, { indent: 0 });
/** `keys` (문자열 코드포인트 순) */
export function keys(v) {
  if (v instanceof Map) return [...v.keys()].sort(cmpCodepoint);
  if (Array.isArray(v)) return v.map((_, i) => i);
  throw new JqError(`${typeName(v)} has no keys`, 5);
}
export function cmpCodepoint(a, b) {
  const x = Array.from(a), y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) { const d = x[i].codePointAt(0) - y[i].codePointAt(0); if (d) return d; }
  return x.length - y.length;
}
/** jq `*` (객체끼리 깊은 병합, 그 밖은 오른쪽이 이김). 왼쪽·오른쪽이 객체가 아니면서 한쪽이 객체면 오류는 호출자가 처리 */
export function deepMerge(a, b) {
  if (a instanceof Map && b instanceof Map) {
    const out = new Map(a);
    for (const [k, v] of b) out.set(k, out.has(k) && out.get(k) instanceof Map && v instanceof Map ? deepMerge(out.get(k), v) : v);
    return out;
  }
  return b;
}
/** 숫자 값(계산용) */
export const toNumber = (v) => (v instanceof JNum ? v.valueOf() : v);
