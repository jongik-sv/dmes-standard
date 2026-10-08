#!/usr/bin/env node
// 콘솔 화면 가림·프롬프트 정리의 node 판. console-redact.sh 의 awk 본문을 같은 순서·같은 규칙으로 옮긴 것이다.
// 규칙의 설명(무엇을 가리는가)은 console-redact.sh 머리말이 정본이고, 여기서는 옮길 때 지킨 약속만 적는다.
//   · awk 는 LC_ALL=C 바이트 단위로 돈다. 그래서 입력을 latin1 로 읽어 「글자 하나 = 바이트 하나」 인 문자열로 다루고,
//     결과도 latin1 로 내보낸다(UTF-8 해석을 하지 않으므로 한글·깨진 바이트도 awk 판과 바이트까지 같다).
//   · 위치는 awk 처럼 1부터 센다(_o·_sub·_index). 대소문자 변환은 ASCII 만(awk C 로캘의 tolower).
//   · 모듈로 import 하거나 CLI 로 쓴다: node console-redact.mjs <text|screen|sha|clean-prompt>  (stdin → stdout)
//     종료 코드는 bash 함수와 같다 — text·screen: 0 · 71(1MB 초과 등) · 70(내부 오류), sha: 0 · 1,
//     clean-prompt: 0(stdout 한 줄) · 1 빔 · 2 `!` 포함 · 3 길이 초과 · 4 내부 오류. 0 이 아니면 stdout 에 아무것도 내지 않는다.
// node 18.17 이상, 외부 패키지 없음.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const bin = (s) => Buffer.from(s, 'utf8').toString('latin1');   // UTF-8 글자열 → 바이트열 문자열
const MASK = bin('[가림]');
const SQ = 39;
const CR = '\r';

// ---------- awk 내장 함수 대응 ----------
const lc = (s) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));   // C 로캘 tolower
const _o = (s, i) => (i < 1 || i > s.length ? 0 : s.charCodeAt(i - 1));
// awk substr(s, m, n): 1부터. n 을 생략하면 끝까지
function _sub(s, m, n) {
  const len = s.length;
  let st = m, en = n === undefined ? len + 1 : m + n;
  if (st < 1) st = 1;
  if (en > len + 1) en = len + 1;
  return en <= st ? '' : s.slice(st - 1, en - 1);
}
const _index = (s, t) => s.indexOf(t) + 1;   // 없으면 0

// ---------- 문자 분류 ----------
const _dig = (c) => c >= 48 && c <= 57;
const _up = (c) => c >= 65 && c <= 90;
const _lo = (c) => c >= 97 && c <= 122;
const _sk = (c) => _dig(c) || _up(c) || _lo(c) || c === 95 || c === 45;
const _id = (c) => _sk(c) || c === 46;
const _b6 = (c) => _sk(c) || c === 43 || c === 47 || c === 61;
const _sm = (c) => _b6(c) || c === 46;
const _ws = (c) => c === 32 || c === 9;
const _qt = (c) => c === 34 || c === 39 || c === 96;
const _endswith = (a, b) => a.length >= b.length && _sub(a, a.length - b.length + 1) === b;
const _cls = (r) => (/[A-Z]/.test(r) ? 1 : 0) + (/[a-z]/.test(r) ? 1 : 0) + (/[0-9]/.test(r) ? 1 : 0);

const KW = 'password passwd pwd passphrase passcode secret token api_key apikey credential private_key privatekey access_key accesskey cookie session signature'.split(' ');
const TOK = new Set('pat pass pw auth sid sig'.split(' '));
const KO = '비밀번호 패스워드 암호 토큰 시크릿 비번 키'.split(' ').map(bin);
const KOX = ['단축키', '공개키', '공개 키'].map(bin);
const PLONG = new Set('password passwd pass passphrase pwd pw'.split(' '));
const NOP = new Set('print print0 printf prune path perm pthread pipe pie pg pedantic passin passout pubin pubout'.split(' '));
const PHV = new Set('string strings str value int bool'.split(' '));
const REFW = new Set('latest main master next beta canary stable HEAD'.split(' '));
const PF = 'AIza hf_ GOCSPX- sk_live_ sk_test_ rk_live_ rk_test_ whsec_ xoxa- xoxb- xoxp- xoxr- ghp_ gho_ ghu_ ghs_ ghr_ github_pat_ npm_ sbp_ sb_secret_'.split(' ');
const ST = 'sk- eyJ dflow_ AIza gl hf_ GOCSPX sk_ rk_ whsec xox gh github_ npm_ sbp_ sb_ AKIA ASIA'.split(' ');

// awk 의 전역 부수 변수(함수끼리 값을 주고받는다)
let NMRAW = '', PQ = 1, VS = 0, VE = 0;

function _cut(s, max) {
  const n = s.length;
  if (n <= max) return s;
  let cnt = 0;
  for (let i = 1; i <= n; i++) {
    const c = _o(s, i);
    if (c < 128 || c >= 192) { cnt++; if (cnt > max) return _sub(s, 1, i - 1); }
  }
  return s;
}
// 바이트 상한으로 자르되 UTF-8 글자를 쪼개지 않는다
function _cutb(s, max) {
  if (s.length <= max) return s;
  let i = max + 1;
  while (i > 1 && _o(s, i) >= 128 && _o(s, i) < 192) i--;
  return _sub(s, 1, i - 1);
}
function _cpcount(s) {
  let cnt = 0;
  for (let i = 1; i <= s.length; i++) { const c = _o(s, i); if (c < 128 || c >= 192) cnt++; }
  return cnt;
}
// 보이지 않는 문자면 그 바이트 수, 아니면 0
function _inv(c, c1, c2) {
  if (c === 226) {
    if (c1 === 128 && ((c2 >= 139 && c2 <= 143) || (c2 >= 170 && c2 <= 174))) return 3;
    if (c1 === 129 && c2 >= 160 && c2 <= 169) return 3;
    return 0;
  }
  if (c === 239 && c1 === 187 && c2 === 191) return 3;
  if (c === 194 && c1 === 173) return 2;
  if (c === 204 && c1 >= 128 && c1 <= 191) return 2;
  if (c === 205 && c1 >= 128 && c1 <= 175) return 2;
  return 0;
}
// 표 테두리(│ ┃ ║) 3바이트인가
function _bar3(s, j) {
  if (_o(s, j) !== 226) return false;
  const c1 = _o(s, j + 1), c2 = _o(s, j + 2);
  return (c1 === 148 && (c2 === 130 || c2 === 131)) || (c1 === 149 && c2 === 145);
}
// 줄 번호 접두·테두리·앞 공백을 건너뛴 첫 내용 위치. PQ = 줄 번호 접두 바로 뒤(없으면 1)
function _pfx(s) {
  const n = s.length;
  let k = 1;
  PQ = 1;
  while (k <= n && _ws(_o(s, k))) k++;
  let j = k;
  while (j <= n && _dig(_o(s, j))) j++;
  if (j > k) {
    const c = _o(s, j);
    if (c === 9 || c === 58) { k = j + 1; PQ = k; }
    else {
      let j2 = j;
      while (j2 <= n && _o(s, j2) === 32) j2++;
      if (_bar3(s, j2) || (_o(s, j2) === 226 && _o(s, j2 + 1) === 134 && _o(s, j2 + 2) === 146)) { k = j2 + 3; PQ = k; }
    }
  }
  while (k <= n) {
    const c = _o(s, k);
    if (_ws(c) || c === 124) k++;
    else if (_bar3(s, k)) k += 3;
    else break;
  }
  return k;
}
// 줄 끝 공백·테두리를 뺀 마지막 내용 위치
function _tend(s) {
  let e = s.length;
  for (;;) {
    while (e >= 1 && (_ws(_o(s, e)) || _o(s, e) === 124)) e--;
    if (e >= 3 && _bar3(s, e - 2)) { e -= 3; continue; }
    break;
  }
  return e;
}
// 잘린 줄의 끝 토막 가림
function _tailprot(s) {
  let j = s.length;
  while (j >= 1 && _sm(_o(s, j))) j--;
  const t = _sub(s, j + 1);
  if (t === '') return s;
  if (t.length >= 12) return _sub(s, 1, j) + MASK;
  for (const p of ST) if (_sub(t, 1, p.length) === p) return _sub(s, 1, j) + MASK;
  return s;
}
// 이름 정규화: camelCase 경계에 _ · 소문자 · - . 를 _ 로
function _normname(raw) {
  let o = '', p = 0;
  for (let i = 1; i <= raw.length; i++) {
    const c = _o(raw, i);
    if (_up(c) && (_lo(p) || _dig(p))) o += '_';
    o += raw[i - 1];
    p = c;
  }
  o = lc(o).replace(/[-.]/g, '_');
  NMRAW = lc(raw).replace(/[-.]/g, '_');
  return o;
}
// awk split(s, T, "_") 의 마지막 두 비어 있지 않은 토막
function _lastTwo(str) {
  let last = '', prev = '';
  for (const x of str.split('_')) if (x !== '') { prev = last; last = x; }
  return [prev, last];
}
// 이름 판정: 0 아님 · 1 가림 · 2 tokens(숫자 값이면 둠) · 3 camelCase …Key(값이 따옴표일 때만)
function _namehit(nm) {
  if (nm === '') return 0;
  const t = nm.replace(/tokens/g, '');
  for (const k of KW) if (t.includes(k)) return 1;
  for (const x of nm.split('_')) if (TOK.has(x)) return 1;
  let [prev, last] = _lastTwo(NMRAW);
  if (last === 'key' && prev !== '' && prev !== 'public' && prev !== 'pub') return 1;
  [prev, last] = _lastTwo(nm);
  if (last === 'key' && prev !== '' && prev !== 'public' && prev !== 'pub') return 3;
  if (nm.includes('tokens')) return 2;
  return 0;
}
// 규칙 1: sk- 키
function _r_sk(s) {
  let out = '', p;
  while ((p = _index(lc(s), 'sk-')) > 0) {
    const n = s.length;
    let j = p + 3;
    while (j <= n && _sk(_o(s, j))) j++;
    if (j - p - 3 >= 16) { out += _sub(s, 1, p - 1) + MASK; s = _sub(s, j); }
    else { out += _sub(s, 1, j - 1); s = _sub(s, j); }
  }
  return out + s;
}
// 접두어 뒤 [A-Za-z0-9_-]{16,} 이고 두 종류 이상 섞였으면 끝 다음 위치, 아니면 0
function _tok16(s, a) {
  const n = s.length;
  let j = a;
  while (j <= n && _sk(_o(s, j))) j++;
  if (j - a >= 16 && _cls(_sub(s, a, j - a)) >= 2) return j;
  return 0;
}
// 접두어 토큰
function _r_pfx(s) {
  let out, p, j, k;
  for (const P of PF) {
    const L = P.length;
    out = '';
    while ((p = _index(s, P)) > 0) {
      if ((j = _tok16(s, p + L))) { out += _sub(s, 1, p - 1) + MASK; s = _sub(s, j); }
      else { out += _sub(s, 1, p + L - 1); s = _sub(s, p + L); }
    }
    s = out + s;
  }
  out = '';
  while ((p = _index(s, 'gl')) > 0) {
    const n = s.length;
    j = p + 2;
    while (j <= n && j - p - 2 < 7 && _lo(_o(s, j))) j++;
    if (j > p + 2 && j - p - 2 <= 6 && _o(s, j) === 45 && (k = _tok16(s, j + 1))) { out += _sub(s, 1, p - 1) + MASK; s = _sub(s, k); }
    else { out += _sub(s, 1, p + 1); s = _sub(s, p + 2); }
  }
  s = out + s;
  for (let x = 1; x <= 2; x++) {
    const P = x === 1 ? 'AKIA' : 'ASIA';
    out = '';
    while ((p = _index(s, P)) > 0) {
      const n = s.length;
      j = p + 4;
      while (j <= n && (_up(_o(s, j)) || _dig(_o(s, j)))) j++;
      if (j - p - 4 >= 16) { out += _sub(s, 1, p - 1) + MASK; s = _sub(s, j); }
      else { out += _sub(s, 1, p + 3); s = _sub(s, p + 4); }
    }
    s = out + s;
  }
  return s;
}
// 규칙 2: D Flow PAT
function _r_pat(s) {
  let out = '', p;
  while ((p = _index(lc(s), 'dflow_pat_')) > 0) {
    const n = s.length;
    let j = p + 10;
    while (j <= n && !_ws(_o(s, j))) j++;
    if (j > p + 10) { out += _sub(s, 1, p - 1) + MASK; s = _sub(s, j); }
    else { out += _sub(s, 1, p + 9); s = _sub(s, p + 10); }
  }
  return out + s;
}
// 규칙 3: JWT. 실패하면 훑은 끝까지 건너뛴다
function _r_jwt(s) {
  let out = '', p;
  while ((p = _index(s, 'eyJ')) > 0) {
    const n = s.length;
    let j = p + 3, k = 0, ok = false;
    while (j <= n && _sk(_o(s, j))) j++;
    let nx = j;
    if (j - p - 3 >= 8 && _o(s, j) === 46) {
      k = j + 1;
      while (k <= n && _sk(_o(s, k))) k++;
      if (k - j - 1 >= 8 && _o(s, k) === 46) { k++; while (k <= n && _sk(_o(s, k))) k++; ok = true; }
      else nx = j + 1;
    }
    if (ok) { out += _sub(s, 1, p - 1) + MASK; s = _sub(s, k); }
    else { out += _sub(s, 1, nx - 1); s = _sub(s, nx); }
  }
  return out + s;
}
// 이름 뒤 따옴표·공백 후 : 또는 = 이면 줄 나머지를 가린다(Authorization·Cookie)
function _r_hdr(s, name) {
  let out = '', p;
  const L = name.length;
  while ((p = _index(lc(s), name)) > 0) {
    const n = s.length;
    let j = p + L;
    if (_qt(_o(s, j))) j++;
    while (j <= n && _ws(_o(s, j))) j++;
    const c = _o(s, j);
    if (c === 58 || c === 61) {
      let k = j + 1;
      while (k <= n && _ws(_o(s, k))) k++;
      if (k <= n && _sub(s, k) !== MASK) s = _sub(s, 1, k - 1) + MASK;
      out += s; s = '';
      break;
    }
    out += _sub(s, 1, p + L - 1); s = _sub(s, p + L);
  }
  return out + s;
}
// 규칙 5: Authorization·Cookie 헤더 · Bearer 값
function _r_auth(s) {
  s = _r_hdr(s, 'authorization');
  s = _r_hdr(s, 'cookie');
  let out = '', p;
  while ((p = _index(lc(s), 'bearer')) > 0) {
    const n = s.length;
    let k = p + 6;
    if (_ws(_o(s, k))) {
      while (k <= n && _ws(_o(s, k))) k++;
      let m = k;
      while (m <= n && !_ws(_o(s, m))) m++;
      const v = _sub(s, k, m - k);
      if (v !== '' && v !== MASK) { out += _sub(s, 1, k - 1) + MASK; s = _sub(s, m); continue; }
    }
    out += _sub(s, 1, p + 5); s = _sub(s, p + 6);
  }
  return out + s;
}
// 규칙 4 이름 판정(구분자 위치 i). sep 는 구분자 바이트(58 :, 61 =, 44 ,, 40 (, 239 전각)
function _kvname(s, i, sep) {
  let j = i - 1;
  if (sep === 44) {
    while (j >= 1 && _ws(_o(s, j))) j--;
    if (!_qt(_o(s, j))) return 0;
  }
  while (j >= 1) { const c = _o(s, j); if (_ws(c) || _qt(c) || c === 93 || c === 41) j--; else break; }
  const e = j;
  while (j >= 1 && _id(_o(s, j))) j--;
  if (e > j) {
    const raw = _sub(s, j + 1, e - j);
    if (raw === 'PASS' && sep === 58) return 0;
    return _namehit(_normname(raw));
  }
  if (e < 1) return 0;
  let b = e - 20;
  if (b < 1) b = 1;
  const w = _sub(s, b, e - b + 1);
  for (const x of KOX) if (_endswith(w, x)) return 0;
  for (const x of KO) if (_endswith(w, x)) return 1;
  return 0;
}
// 규칙 4: 이름 구분자 값
function _r_kv(s) {
  const n = s.length;
  let out = '', st = 1, i = 1;
  while (i <= n) {
    const c = _o(s, i);
    let sw = 0, qonly = false, hit, d, k, q, m, v;
    // 비교(== === != !==)는 값이 따옴표일 때만. <= >= 와 연산자 뒤쪽 = 는 구분자가 아니다
    if (c === 61 && ((d = _o(s, i - 1)) === 61 || d === 33 || d === 60 || d === 62)) { i++; continue; }
    if ((c === 61 || c === 33) && _o(s, i + 1) === 61) {
      sw = 1;
      while (_o(s, i + sw) === 61) sw++;
      if ((hit = _kvname(s, i, 61))) {
        k = i + sw;
        while (k <= n && _ws(_o(s, k))) k++;
        q = _o(s, k);
        if (_qt(q)) {
          m = k + 1;
          while (m <= n && _o(s, m) !== q) m++;
          v = _sub(s, k + 1, m - k - 1);
          if (v !== '' && v !== MASK) { out += _sub(s, st, k - st + 1) + MASK; st = m; }
          i = m + 1; continue;
        }
      }
      i += sw; continue;
    }
    if (c === 61 || c === 58) sw = 1;
    else if (c === 44 || c === 40) { sw = 1; qonly = true; }
    else if (c === 239 && _o(s, i + 1) === 188 && (_o(s, i + 2) === 154 || _o(s, i + 2) === 157)) sw = 3;
    if (sw && (hit = _kvname(s, i, c))) {
      k = i + sw;
      if (!qonly) while (k <= n && (_o(s, k) === 61 || _o(s, k) === 58 || _o(s, k) === 62)) k++;
      while (k <= n && _ws(_o(s, k))) k++;
      if (k <= n) {
        q = _o(s, k);
        if (_qt(q)) {
          m = k + 1;
          while (m <= n && _o(s, m) !== q) m++;
          v = _sub(s, k + 1, m - k - 1);
          if (v !== '' && v !== MASK) { out += _sub(s, st, k - st + 1) + MASK; st = m; }
          i = m + 1; continue;
        }
        if (!qonly && hit !== 3) {
          m = k;
          while (m <= n && !_ws(_o(s, m))) m++;
          v = _sub(s, k, m - k);
          if (_index(v, MASK) !== 1 && !(hit === 2 && /^[0-9][0-9.,_]*[kKmM]?$/.test(v))) { out += _sub(s, st, k - st) + MASK; st = m; }
          i = m; continue;
        }
      }
    }
    i += sw ? sw : 1;
  }
  return out + _sub(s, st);
}
// CLI 값 한 단어의 끝(다음 위치)을 돌려준다. 따옴표면 닫는 따옴표 다음(없으면 줄 끝). VS·VE 에 가릴 범위
function _word(s, k) {
  const n = s.length, q = _o(s, k);
  let m;
  if (_qt(q)) {
    m = k + 1;
    while (m <= n && _o(s, m) !== q) m++;
    VS = k + 1; VE = m - 1;
    return m <= n ? m + 1 : m;
  }
  m = k;
  while (m <= n && !_ws(_o(s, m))) m++;
  VS = k; VE = m - 1;
  return m;
}
function _prevword(s, i) {
  let j = i - 1;
  while (j >= 1 && _ws(_o(s, j))) j--;
  const e = j;
  while (j >= 1 && !_ws(_o(s, j))) j--;
  return _sub(s, j + 1, e - j);
}
// CLI 값으로 가릴 만한가(공통 제외)
function _cliok(v) {
  if (v === '') return false;
  const f = _sub(v, 1, 1);
  if (f === '-' || f === '<' || f === '{' || f === '$' || _index(v, MASK) === 1) return false;
  if (PHV.has(lc(v))) return false;
  return true;
}
const _portlike = (v) => /^[0-9][0-9.:]*(\/(tcp|udp|sctp))?$/.test(v);
// CLI 인자: --이름 값 · -이름 값 · -p · -u
function _r_cli(s) {
  const n = s.length;
  let out = '', st = 1, i = 1;
  while (i <= n) {
    if (_o(s, i) !== 45 || (i > 1 && !_ws(_o(s, i - 1)))) { i++; continue; }
    const dbl = _o(s, i + 1) === 45 ? 1 : 0;
    const j = i + 1 + dbl;
    let k = j;
    while (k <= n && _sk(_o(s, k))) k++;
    const nm = _sub(s, j, k - j);
    if (nm === '') { i = k > i ? k : i + 1; continue; }
    const c = _o(s, k);
    const lnm = lc(nm);
    let a, w, v, m;
    // -u · --user : x:y 의 y
    if ((dbl && lnm === 'user') || (!dbl && _sub(nm, 1, 1) === 'u')) {
      a = 0;
      if (dbl || nm === 'u') { if (_ws(c) || (dbl && c === 61)) { a = k + 1; while (a <= n && _ws(_o(s, a))) a++; } }
      else a = j + 1;
      if (a && a <= n) {
        w = _word(s, a); v = _sub(s, VS, VE - VS + 1); m = _index(v, ':');
        if (m && m < v.length && _index(v, MASK) === 0) { out += _sub(s, st, VS + m - st) + MASK; st = VE + 1; }
        if (m) { i = w; continue; }
      }
    }
    // -p 값 · -p값(붙여 씀). -password 같은 긴 이름은 아래 규칙으로
    if (!dbl && _sub(nm, 1, 1) === 'p' && !PLONG.has(lnm)) {
      if (nm === 'p') {
        if (_ws(c)) {
          a = k;
          while (a <= n && _ws(_o(s, a))) a++;
          if (a <= n) {
            w = _word(s, a); v = _sub(s, VS, VE - VS + 1);
            if (_cliok(v) && !_portlike(v) && _prevword(s, i) !== 'mkdir') { out += _sub(s, st, VS - st) + MASK; st = VE + 1; }
            i = w; continue;
          }
        }
        i = k; continue;
      }
      if (!NOP.has(lnm)) {
        w = _word(s, j + 1); v = _sub(s, VS, VE - VS + 1);
        if (v !== '' && _index(v, MASK) !== 1 && !_portlike(v)) { out += _sub(s, st, VS - st) + MASK; st = VE + 1; }
        i = w; continue;
      }
      i = k; continue;
    }
    // --이름 값 · -이름 값
    if (dbl || nm.length > 1) {
      let h = _namehit(_normname(nm));
      if (h === 3) h = 0;
      if ((h || _endswith(lnm, 'pass')) && _ws(c)) {
        a = k;
        while (a <= n && _ws(_o(s, a))) a++;
        if (a <= n) {
          w = _word(s, a); v = _sub(s, VS, VE - VS + 1);
          if (_cliok(v) && !(h === 2 && /^[0-9][0-9.,_]*[kKmM]?$/.test(v))) { out += _sub(s, st, VS - st) + MASK; st = VE + 1; }
          i = w; continue;
        }
      }
    }
    i = k;
  }
  return out + _sub(s, st);
}
// .netrc 형식: password X · passwd X
function _r_netrc(s) {
  if (!_index(s, 'passw')) return s;
  const L = (' ' + s + ' ').replace(/\t/g, ' ');
  const f = s.replace(/^[ \t]+/, '').replace(/[ \t][\s\S]*$/, '');
  if (!(_index(L, ' machine ') || _index(L, ' login ') || _index(L, ' default ') || f === 'password' || f === 'passwd')) return s;
  for (let x = 1; x <= 2; x++) {
    const P = x === 1 ? 'password' : 'passwd';
    let out = '', p;
    while ((p = _index(s, P)) > 0) {
      const n = s.length;
      const j = p + P.length;
      if ((p === 1 || _ws(_o(s, p - 1))) && _ws(_o(s, j))) {
        let a = j;
        while (a <= n && _ws(_o(s, a))) a++;
        if (a <= n) {
          _word(s, a);
          const v = _sub(s, VS, VE - VS + 1);
          if (v !== '' && _index(v, MASK) !== 1) { out += _sub(s, 1, VS - 1) + MASK; s = _sub(s, VE + 1); continue; }
        }
      }
      out += _sub(s, 1, j - 1); s = _sub(s, j);
    }
    s = out + s;
  }
  return s;
}
// URL 의 사용자 칸(공백·따옴표 전까지의 마지막 @ 앞)
function _r_url(s) {
  let out = '', st = 1, q = 1, E = 0, A = 0, p;
  const n = s.length;
  while ((p = _index(_sub(s, q), '://')) > 0) {
    p += q - 1;
    const a = p + 3;
    // 같은 토막(공백·따옴표 전까지) 안이면 마지막 @ 를 다시 훑지 않는다(:// 반복 입력의 O(n²) 방지)
    if (a > E) {
      A = 0;
      let j;
      for (j = a; j <= n; j++) { const c = _o(s, j); if (_ws(c) || _qt(c) || c === 60 || c === 62) break; if (c === 64) A = j; }
      E = j;
    }
    const at = A > a ? A : 0;
    let hit = false, b = 0;
    if (at) {
      const ui = _sub(s, a, at - a), colon = _index(ui, ':');
      if (colon) {
        const user = _sub(ui, 1, colon - 1), pw = _sub(ui, colon + 1);
        if (!/[\/?#]/.test(user) && pw !== '' && pw !== MASK && !/^[0-9]+\//.test(pw)) { hit = true; b = a + colon; }
      } else if (!/[\/?#]/.test(ui) && ui !== MASK && ui !== 'git') { hit = true; b = a; }
    }
    if (hit) { out += _sub(s, st, b - st) + MASK; st = at; q = at; }
    else if (!at) q = E;
    else q = a;
    if (q <= p) q = p + 1;
  }
  return out + _sub(s, st);
}
// DB 접속 user/pass@db
const DB_RE1 = /[A-Za-z0-9_.$-]+\/[^ \t/@]+@[A-Za-z0-9_.-]/;
const DB_RE2 = /[A-Za-z0-9_.$-]+\/[^ \t/@]+/;
function _r_dbup(s) {
  let out = '', m;
  while ((m = DB_RE1.exec(s))) {
    const p = m.index + 1, at = m.index + m[0].length - 1, n = s.length;
    let sl = p;
    while (_o(s, sl) !== 47) sl++;
    const pre = _o(s, p - 1);
    let tok = '';
    if (_index(s, '://')) {
      let ts = p;
      while (ts > 1 && !_ws(_o(s, ts - 1))) ts--;
      let te = at;
      while (te <= n && !_ws(_o(s, te))) te++;
      tok = _sub(s, ts, te - ts);
    }
    const pw = _sub(s, sl + 1, at - sl - 1);
    let te = at + 1;
    while (te <= n && _id(_o(s, te))) te++;
    const host = _sub(s, at + 1, te - at - 1);
    // 버전·브랜치 참조(actions/checkout@v4 · x/y@1.2 · x/y@latest)·이미지 다이제스트는 둔다
    if (pre !== 47 && pre !== 64 && !_index(tok, '://') && !/^sha(256|512)/.test(host) && !/^v[0-9]/.test(host) &&
        !/^[0-9]+(\.[0-9]+)?(\.[0-9]+)?$/.test(host) && !REFW.has(host) && _prevword(s, p) !== 'uses:' && _index(pw, MASK) === 0) {
      out += _sub(s, 1, sl) + MASK; s = _sub(s, at);
    } else { out += _sub(s, 1, at); s = _sub(s, at + 1); }
  }
  s = out + s;
  const L = ' ' + lc(s) + ' ';
  if (!/[^a-z0-9_](sqlplus|impdp|expdp|sqlldr|rman)[^a-z0-9_]/.test(L)) return s;
  out = '';
  while ((m = DB_RE2.exec(s))) {
    const p = m.index + 1, te = m.index + m[0].length + 1, pre = _o(s, p - 1);
    let sl = p;
    while (_o(s, sl) !== 47) sl++;
    const pw = _sub(s, sl + 1, te - sl - 1);
    if ((p === 1 || _ws(pre) || pre === 61) && (te > s.length || _ws(_o(s, te)) || _o(s, te) === 64) && _index(pw, MASK) === 0) { out += _sub(s, 1, sl) + MASK; s = _sub(s, te); }
    else { out += _sub(s, 1, te - 1); s = _sub(s, te); }
  }
  return out + s;
}
// PEM 한 줄 안의 BEGIN…END
function _privbegin(s, b) {
  const r = _sub(s, b + 10), e = _index(r, '-----');
  if (!e) return true;
  return _index(_sub(r, 1, e), 'PRIVATE') > 0;
}
function _r_pem(s) {
  const b = _index(s, '-----BEGIN');
  if (!b || !_privbegin(s, b)) return s;
  const r = _sub(s, b + 10), e = _index(r, '-----END');
  if (!e) return _sub(s, 1, b - 1) + MASK;
  const P = b + 10 + e - 1 + 8, k = _index(_sub(s, P), '-----');
  if (!k) return _sub(s, 1, b - 1) + MASK;
  return _sub(s, 1, b - 1) + MASK + _sub(s, P + k - 1 + 5);
}
// 규칙 6: 긴 base64·hex
function _wordy(w) {
  const n = w.length;
  if (n > 40) return false;
  if (n >= 40 && _longhit(w)) return false;
  if (/[A-Z0-9][A-Z]/.test(w)) return false;
  return true;
}
function _pathlike(r) {
  if (_index(r, '+') || _index(r, '=')) return false;
  const segs = r.split('/');
  if (segs.length < 4) return false;
  for (const x of segs) if (!_wordy(x)) return false;
  return true;
}
function _longhit(r) {
  if (/^[0-9A-Fa-f]+$/.test(r)) return true;
  if (_cls(r) < 2) return false;
  return !_pathlike(r);
}
function _r_long(s) {
  const n = s.length;
  let out = '', i = 1, st = 1;
  while (i <= n) {
    if (!_b6(_o(s, i))) { i++; continue; }
    let j = i;
    while (j <= n && _b6(_o(s, j))) j++;
    if (j - i >= 40 && _longhit(_sub(s, i, j - i))) { out += _sub(s, st, i - st) + MASK; st = j; }
    i = j;
  }
  return out + _sub(s, st);
}
function redact(s) {
  s = _r_pem(s); s = _r_sk(s); s = _r_pfx(s); s = _r_pat(s); s = _r_jwt(s); s = _r_auth(s); s = _r_kv(s);
  s = _r_cli(s); s = _r_netrc(s); s = _r_url(s); s = _r_dbup(s);
  return _r_long(s);
}
// 줄 이음 토막 자격: 혼자서도 가려지거나, 8자 이상 hex 만이거나, 대문자·소문자·숫자 중 둘 이상을 섞은 토막
function _fragok(f) {
  if (redact(f) !== f) return true;
  return (/^[0-9A-Fa-f]+$/.test(f) && f.length >= 8) || _cls(f) >= 2;
}
// 줄 이음: 꺾인 비밀의 두 토막을 함께 가린다(A[1..n] 을 바꾼다)
function _seam(A, n) {
  const TS = {}, TE = {}, HO = {}, HE = {};
  for (let i = 1; i < n; i++) {
    const e = _tend(A[i]);
    let j = e;
    while (j >= 1 && _sm(_o(A[i], j))) j--;
    const t = _sub(A[i], j + 1, e - j);
    if (t === '') continue;
    const k = _pfx(A[i + 1]), m = A[i + 1].length;
    let j2 = k;
    while (j2 <= m && _sm(_o(A[i + 1], j2))) j2++;
    const h = _sub(A[i + 1], k, j2 - k);
    if (h === '') continue;
    let ok = _fragok(t) && _fragok(h) && redact(t + h) !== t + h;
    if (!ok && t.length >= 40 && /^[A-Za-z0-9+\/_=-]+$/.test(h) && !/^[0-9]+$/.test(h) && (j2 > m || _ws(_o(A[i + 1], j2))) && redact(t) !== t) ok = true;
    if (ok) { TS[i] = j + 1; TE[i] = e; HO[i + 1] = k; HE[i + 1] = j2 - 1; }
  }
  for (let i = 1; i <= n; i++) {
    if ((i in TS) && (i in HO) && HE[i] >= TS[i]) { A[i] = _sub(A[i], 1, HO[i] - 1) + MASK + _sub(A[i], TE[i] + 1); continue; }
    if (i in TS) A[i] = _sub(A[i], 1, TS[i] - 1) + MASK + _sub(A[i], TE[i] + 1);
    if (i in HO) A[i] = _sub(A[i], 1, HO[i] - 1) + MASK + _sub(A[i], HE[i] + 1);
  }
}
function _b64line(s) {
  const k = _pfx(s), e = _tend(s);
  if (e < k) return false;
  return /^[A-Za-z0-9+\/=]+$/.test(_sub(s, k, e - k + 1));
}
function _maskbody(s) {
  const k = _pfx(s);
  if (k > s.length) return s;
  return _sub(s, 1, k - 1) + MASK;
}
function _endrest(s, e) {
  const k = _index(_sub(s, e + 8), '-----');
  return k ? _sub(s, e + 8 + k - 1 + 5) : '';
}
function _yamlkey(s, pk) {
  let c = _sub(s, pk), key, rest, m;
  if (_sub(c, 1, 2) === '- ') c = _sub(c, 3);
  const q = _sub(c, 1, 1);
  if (q === '"' || q.charCodeAt(0) === SQ) {
    const e = _index(_sub(c, 2), q);
    if (!e) return false;
    key = _sub(c, 2, e - 1); rest = _sub(c, e + 2);
  } else {
    if (!(m = /^[A-Za-z0-9_.-]+/.exec(c))) return false;
    key = m[0]; rest = _sub(c, m[0].length + 1);
  }
  if (_sub(rest, 1, 1) !== ':') return false;
  rest = _sub(rest, 2).replace(/^[ \t]+/, '');
  if (_sub(rest, 1, 1) === '#') rest = '';
  rest = rest.replace(/[ \t]+#[\s\S]*$/, '').replace(/[ \t]+$/, '');
  if (rest !== '' && !/^[|>][-+0-9]*$/.test(rest)) return false;
  return _namehit(_normname(key)) === 1;
}
// 여러 줄 가림: PEM 블록 · YAML 블록(A[1..n] 을 바꾼다)
function _multi(A, n) {
  let st = false;
  for (let i = 1; i <= n; i++) {
    const s = A[i];
    if (st) {
      const e = _index(s, '-----END');
      if (e) { A[i] = _sub(s, 1, _pfx(s) - 1) + MASK + _endrest(s, e); st = false; }
      else A[i] = _maskbody(s);
      continue;
    }
    const b = _index(s, '-----BEGIN');
    if (b && _privbegin(s, b)) {
      if (!_index(_sub(s, b + 10), '-----END')) { A[i] = _sub(s, 1, b - 1) + MASK; st = true; }
      continue;
    }
    const e = _index(s, '-----END');
    if (e && _index(_sub(s, e), 'PRIVATE')) {
      A[i] = _sub(s, 1, _pfx(s) - 1) + MASK + _endrest(s, e);
      for (let k = i - 1; k >= 1 && _b64line(A[k]); k--) A[k] = _maskbody(A[k]);
    }
  }
  let ya = false, base = 0;
  for (let i = 1; i <= n; i++) {
    const s = A[i], pk = _pfx(s), ind = pk - PQ;
    if (ya) {
      if (_tend(s) < pk) continue;
      if (ind > base) { A[i] = _sub(s, 1, pk - 1) + MASK; continue; }
      ya = false;
    }
    if (_yamlkey(s, pk)) { ya = true; base = ind; }
  }
}

// ---------- 입력 나누기·내기 ----------
const failure = (rc) => ({ rc, out: Buffer.alloc(0) });
// awk 레코드(줄)로 나눈다. 마지막 줄바꿈 뒤의 빈 토막은 레코드가 아니다. NUL 은 먼저 지운다
function toRecords(input) {
  let s = (Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8')).toString('latin1');
  if (s.includes('\0')) s = s.replace(/\0/g, '');
  if (s === '') return [];
  const rec = s.split('\n');
  if (s.endsWith('\n')) rec.pop();
  return rec;
}
const ok = (str) => ({ rc: 0, out: Buffer.from(str, 'latin1') });

/** stdin 텍스트에 가림 규칙을 적용한다. {rc, out(Buffer)} — rc 71 은 입력 합계가 1MB 초과. */
export function redactText(input) {
  const rec = toRecords(input);
  const L = [''];
  let tot = 0;
  for (const line of rec) {
    tot += line.length + 1;
    if (tot > 1048576) return failure(71);
    let s = _cutb(line, 2000);
    if (s !== line) s = _tailprot(s);
    L.push(s);
  }
  const n = rec.length;
  for (let i = 1; i <= n; i++) if (L[i].length > 65536) return failure(71);
  _multi(L, n); _seam(L, n);
  let out = '';
  for (let i = 1; i <= n; i++) out += redact(L[i]) + '\n';
  return ok(out);
}

// 화면 한 줄 정리. 원문은 이미 CR 처리 뒤 2000바이트로 잘려 있다
function _scr(s) {
  const n = s.length;
  let out = '', i = 1, st = 1, c, d, e, k, x;
  while (i <= n) {
    c = _o(s, i);
    if (c === 27) {
      out += _sub(s, st, i - st); d = _o(s, i + 1);
      if (d === 91) { k = i + 2; while (k <= n && !(_o(s, k) >= 64 && _o(s, k) <= 126)) k++; i = k + 1; }
      else if (d === 93 || d === 80 || d === 88 || d === 94 || d === 95) {
        k = i + 2;
        while (k <= n) { e = _o(s, k); if (e === 7) { k++; break; } if (e === 27 && _o(s, k + 1) === 92) { k += 2; break; } k++; }
        i = k;
      }
      else if (d >= 32 && d <= 47) { k = i + 1; while (k <= n && _o(s, k) >= 32 && _o(s, k) <= 47) k++; i = k + 1; }
      else if (d >= 128) i++;
      else i += 2;
      st = i; continue;
    }
    if (c === 194 && _o(s, i + 1) >= 128 && _o(s, i + 1) <= 159) { out += _sub(s, st, i - st); i += 2; st = i; continue; }
    if (c >= 194 && (x = _inv(c, _o(s, i + 1), _o(s, i + 2)))) { out += _sub(s, st, i - st); i += x; st = i; continue; }
    if ((c < 32 && c !== 9) || c === 127) { out += _sub(s, st, i - st); i++; st = i; continue; }
    i++;
  }
  out += _sub(s, st);
  return out.replace(/[ \t]+$/, '');
}

/** 터미널 화면 원문을 거른다(마지막 41줄만 본다). {rc, out(Buffer)} — rc 71 은 안전망. */
export function screenFilter(input) {
  const rec = toRecords(input);
  const NR = rec.length;
  const start = Math.max(NR - 40, 1);
  const R = [''];
  for (let i = start; i <= NR; i++) {
    let s = rec[i - 1].replace(/\r+$/, '');
    if (_index(s, CR)) s = s.slice(s.lastIndexOf(CR) + 1);
    let t = _cutb(s, 2000);
    const cut = t !== s;
    t = _scr(t);
    if (cut) t = _tailprot(t);
    if (t.length > 65536) return failure(71);
    R.push(t);
  }
  const m = R.length - 1;
  _multi(R, m); _seam(R, m);
  for (let i = 1; i <= m; i++) R[i] = redact(_cut(redact(R[i]), 400));
  let first = m - 39;
  if (first < 1) first = 1;
  let total = 0;
  for (let i = first; i <= m; i++) total += R[i].length + 1;
  while (total > 8192 && first <= m) { total -= R[first].length + 1; first++; }
  let last = m;
  while (first <= last && R[first] === '') first++;
  while (last >= first && R[last] === '') last--;
  let out = '';
  for (let i = first; i <= last; i++) out += R[i] + '\n';
  return ok(out);
}

/** stdin 의 sha256 hex(64자) 한 줄. */
export function screenSha(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return { rc: 0, out: Buffer.from(createHash('sha256').update(buf).digest('hex') + '\n', 'latin1') };
}

// 한 토막(글자 경계에서 자른 1024바이트 이하) 정리
function _pclean(T) {
  const n = T.length;
  let out = '', i = 1, st = 1, c, x;
  while (i <= n) {
    c = _o(T, i);
    if (c === 13 || c === 9) { out += _sub(T, st, i - st) + ' '; i++; st = i; continue; }
    if (c === 226 && _o(T, i + 1) === 128 && (_o(T, i + 2) === 168 || _o(T, i + 2) === 169)) { out += _sub(T, st, i - st) + ' '; i += 3; st = i; continue; }
    if (c === 194 && _o(T, i + 1) >= 128 && _o(T, i + 1) <= 159) { out += _sub(T, st, i - st); i += 2; st = i; continue; }
    if (c >= 194 && (x = _inv(c, _o(T, i + 1), _o(T, i + 2)))) { out += _sub(T, st, i - st); i += x; st = i; continue; }
    if (c < 32 || c === 127) { out += _sub(T, st, i - st); i++; st = i; continue; }
    i++;
  }
  return out + _sub(T, st);
}
// Unicode 공백(U+00A0 U+1680 U+2000~U+200A U+202F U+205F U+3000)과 ASCII 공백만으로 되었는가
function _onlysp(s) {
  const n = s.length;
  let i = 1;
  while (i <= n) {
    const c = _o(s, i), c1 = _o(s, i + 1), c2 = _o(s, i + 2);
    if (c === 32) { i++; continue; }
    if (c === 194 && c1 === 160) { i += 2; continue; }
    if (c === 225 && c1 === 154 && c2 === 128) { i += 3; continue; }
    if (c === 226 && c1 === 128 && ((c2 >= 128 && c2 <= 138) || c2 === 175)) { i += 3; continue; }
    if (c === 226 && c1 === 129 && c2 === 159) { i += 3; continue; }
    if (c === 227 && c1 === 128 && c2 === 128) { i += 3; continue; }
    return false;
  }
  return true;
}

/** 프롬프트 본문을 정리한다. rc 0 이면 out 에 정리된 한 줄(+LF), 1 빔 · 2 `!` 포함 · 3 길이 초과. */
export function cleanPrompt(input) {
  const rec = toRecords(input);
  let tot = 0, T = '';
  for (let r = 0; r < rec.length; r++) {
    tot += rec[r].length + 1;
    if (tot > 32769 || rec[r].length > 8000) return failure(3);
    T = r === 0 ? rec[r] : T + ' ' + rec[r];
  }
  const n = T.length;
  let out = '', p = 1;
  while (p <= n) {
    let q = p + 1024;
    if (q > n + 1) q = n + 1;
    while (q <= n && q > p + 1 && _o(T, q) >= 128 && _o(T, q) < 192) q--;
    out += _pclean(_sub(T, p, q - p)); p = q;
  }
  out = out.replace(/^ +/, '').replace(/ +$/, '');
  if (out === '' || _onlysp(out)) return failure(1);
  if (_index(out, '!') > 0) return failure(2);
  if (_cpcount(out) > 2000) return failure(3);
  return ok(out + '\n');
}

// 문자열 편의판: UTF-8 문자열 입력 → UTF-8 문자열 출력
const asText = (fn) => (str) => { const r = fn(str); return { rc: r.rc, out: r.out.toString('utf8') }; };
export const redactTextStr = asText(redactText);
export const screenFilterStr = asText(screenFilter);
export const cleanPromptStr = asText(cleanPrompt);

// ---------- CLI ----------
const MODES = {
  text: { fn: redactText, fail: 70 },
  screen: { fn: screenFilter, fail: 70 },
  sha: { fn: screenSha, fail: 1 },
  'clean-prompt': { fn: cleanPrompt, fail: 4 },
};

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks);
}
function writeAll(buf) {
  return new Promise((resolve) => { if (buf.length === 0) resolve(); else process.stdout.write(buf, () => resolve()); });
}

async function main(argv) {
  const mode = MODES[argv[0]];
  if (!mode) {
    process.stderr.write('사용: node console-redact.mjs <text|screen|sha|clean-prompt>  (stdin → stdout)\n');
    return 2;
  }
  let r;
  try {
    r = mode.fn(await readStdin());
  } catch (e) {
    process.stderr.write(`console-redact: 내부 오류: ${e && e.message}\n`);
    return mode.fail;
  }
  if (r.rc === 0) await writeAll(r.out);
  return r.rc;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((rc) => { process.exitCode = rc; });
}
