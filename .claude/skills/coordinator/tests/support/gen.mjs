// 무작위 입력 생성기(시드 고정). 모든 생성기는 makeRng 로 만든 rng 를 받아 사례 {args, stdin, files, env} 를 돌려준다.
// 가짜 비밀은 여기서 조립한다(실제 키처럼 보이는 문자열을 저장소에 남기지 않는다).
const rep = (s, n) => s.repeat(n);
const enc = (s) => Buffer.from(s, 'utf8');
const ESC = '\x1b';

export const WORDS = ['build', 'ok', 'next', 'step', 'error', 'warn', 'run', 'tests', 'passed', 'file', 'src/main', 'the', 'user', 'token', 'tokens', 'password', 'secret', 'key', 'value', 'config', 'x', 'a1b2', 'hello', 'world', 'PATH=/usr/bin:/bin', '12:30:45', '↓', '✓', '—', '│', '|', '->'];
export const KOREAN = ['한글', '화면', '비밀번호', '패스워드', '토큰', '시크릿', '단축키', '공개키', '암호', '확인', '진행', '테스트', '통과', '실패', '가나다라마바사', '전각ＡＢＣ', '＝', '：', '값은 그대로'];

// 비밀 값 후보(모양만 같은 가짜). rng 로 조립하고 같은 시드면 같은 값이다.
export function secret(rng) {
  const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[rng.int(0, 15)]).join('');
  const b64 = (n) => Array.from({ length: n }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[rng.int(0, 63)]).join('');
  const alnum = (n) => Array.from({ length: n }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[rng.int(0, 61)]).join('');
  const kinds = [
    () => `sk-${alnum(rng.int(12, 40))}`, () => `dflow_pat_${alnum(rng.int(8, 40))}`,
    () => `eyJ${alnum(10)}.eyJ${alnum(12)}.${alnum(20)}`, () => hex(rng.pick([32, 40, 64])), () => b64(rng.int(36, 60)),
    () => `ghp_${alnum(24)}`, () => `AKIA${alnum(16).toUpperCase()}`, () => `glpat-${alnum(22)}`, () => `AIza${alnum(30)}`,
    () => `password=${alnum(8)}`, () => `API_KEY: "${alnum(14)}"`, () => `token: Bearer ${alnum(20)}`, () => `비밀번호: ${rng.int(1000, 99999)}`,
    () => `Authorization: Basic ${alnum(16)}==`, () => `postgres://user:${alnum(8)}@db.example.com:5432/app`, () => `jdbc:oracle:thin:scott/${alnum(8)}@dbhost:1521:ORCL`,
    () => `curl -u admin:${alnum(8)} https://x`, () => `mysql -u root -p${alnum(8)} db`, () => `--token ${alnum(24)}`, () => `machine h login u password ${alnum(8)}`,
    () => `-----BEGIN RSA PRIVATE KEY-----`, () => `-----END RSA PRIVATE KEY-----`, () => `${alnum(12)}/${alnum(12)}/${alnum(12)}/${alnum(12)}`,
  ];
  return rng.pick(kinds)();
}

const ansi = (rng) => rng.pick([`${ESC}[31m`, `${ESC}[0m`, `${ESC}[1;38;5;196m`, `${ESC}]0;title\x07`, `${ESC}]8;;http://x${ESC}\\`, `${ESC}(B`, `${ESC}[2K`, `${ESC}[?25l`, '\x01', '\x7f', '­', '​', '‮', '⁠', '﻿']);

export function word(rng) {
  const r = rng.next();
  if (r < 0.45) return rng.pick(WORDS);
  if (r < 0.6) return rng.pick(KOREAN);
  if (r < 0.78) return secret(rng);
  if (r < 0.86) return ansi(rng);
  if (r < 0.9) return rep('x', rng.int(1, 60));
  return Array.from({ length: rng.int(1, 8) }, () => 'abcdefghijklmnopqrstuvwxyz0123456789_-./'[rng.int(0, 39)]).join('');
}

export function line(rng, maxWords = 10) {
  const n = rng.int(0, maxWords);
  const sep = () => rng.pick([' ', ' ', ' ', '  ', '\t', '=', ': ', ' = ']);
  let s = rng.chance(0.15) ? rng.pick(['  ', '    ', '> ', '│ ', '  4\t', '12: ', '- ']) : '';
  for (let i = 0; i < n; i++) s += (i ? sep() : '') + word(rng);
  return s;
}

/** 여러 줄 글. eol 은 줄 끝(기본은 섞어서 LF·CRLF), 가끔 아주 긴 줄·64KB 초과·빈 입력. */
export function textBuf(rng, { maxLines = 40, big = true } = {}) {
  if (rng.chance(0.04)) return Buffer.alloc(0);
  if (big && rng.chance(0.02)) return enc(rep(`${line(rng, 6)} ${rep('x', rng.int(20, 90))}\n`, rng.int(900, 1500)));   // 64KB 초과
  const eolMode = rng.pick(['lf', 'lf', 'lf', 'crlf', 'mixed']);
  const n = rng.int(1, maxLines);
  const out = [];
  for (let i = 0; i < n; i++) {
    let l = line(rng);
    if (rng.chance(0.03)) l += rep(rng.pick(['x', 'ab ', '가', 'token=']), rng.int(300, 2600));   // 아주 긴 줄(2000바이트 경계 근처 포함)
    const eol = eolMode === 'lf' ? '\n' : eolMode === 'crlf' ? '\r\n' : rng.pick(['\n', '\r\n', '\r']);
    out.push(l + (i === n - 1 && rng.chance(0.3) ? '' : eol));
  }
  let b = enc(out.join(''));
  if (rng.chance(0.03)) b = b.subarray(0, rng.int(0, b.length));            // 글자 중간에서 잘린 입력(깨진 UTF-8)
  if (rng.chance(0.02)) b = Buffer.concat([b, Buffer.from([0xff, 0x00, 0xc3])]);
  return b;
}

/** 입력 = 글만(stdin) 인 사례 */
export function text(rng) { return { args: [], stdin: textBuf(rng) }; }
/** 화면 모양: 40~60줄, 앞 몇 줄에 비밀 */
export function screen(rng) { return { args: [], stdin: textBuf(rng, { maxLines: 60 }) }; }
/** 프롬프트 모양: 한 줄 또는 몇 줄, 가끔 ! 포함 */
export function prompt(rng) {
  const parts = Array.from({ length: rng.int(0, 4) }, () => line(rng, 12) + (rng.chance(0.05) ? '!' : ''));
  if (rng.chance(0.03)) parts.push(rep(rng.pick(['가', 'x', 'é']), rng.int(1990, 2100)));
  if (rng.chance(0.02)) parts.push(rep('x', rng.int(7900, 8100)));
  return { args: [], stdin: enc(parts.join(rng.pick(['\n', '\r\n', ' ', ' ']))) };
}

/** terminal handle 모양(허용 글자 안팎, 길이 경계) */
export function handle(rng) {
  const ok = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-';
  const bad = ['/', ' ', '$', '\\', '가', '*', '\t', '..'];
  let s = Array.from({ length: rng.pick([0, 1, 5, 20, 99, 100, 101, 140]) }, () => ok[rng.int(0, ok.length - 1)]).join('');
  if (rng.chance(0.2)) s = '.' + s;
  if (rng.chance(0.2)) { const k = rng.int(0, s.length); s = s.slice(0, k) + rng.pick(bad) + s.slice(k); }
  return { args: [s], stdin: '' };
}

export const GENERATORS = { text, screen, prompt, handle };
export const gen = (name) => {
  const g = GENERATORS[name];
  if (!g) throw new Error(`알 수 없는 생성기: ${name} (있는 것: ${Object.keys(GENERATORS).join(', ')})`);
  return g;
};
