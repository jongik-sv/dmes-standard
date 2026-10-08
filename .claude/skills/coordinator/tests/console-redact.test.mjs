// scripts/lib/console-redact.mjs(node 판)가 console-redact.sh(awk 판)와 바이트까지 같은지 골든으로 비교한다.
// 사용법: node --test tests/console-redact.test.mjs   (bash·awk 가 없으면 비교는 건너뛰고 CLI·단독 시험만 돈다)
// 비교 입력(awk 판이 정답):
//   1) tests/console-redact.sh 가 lib 함수에 넣는 모든 입력 — 복사본을 기록용 래퍼 lib 로 돌려 stdin 을 그대로 모은다
//      (가짜 비밀은 그 시험 안에서 조립되므로 저장소에 실제 키 모양 문자열을 남기지 않는다)
//   2) tests/fixtures/ 의 화면 전부 × 네 함수
//   3) 직접 만든 사례: 한글·전각·ANSI 색·CRLF·빈 입력·아주 긴 줄·깨진 UTF-8·NUL·1MB 경계
//   4) 위 입력을 변형한 것(CRLF 화·중간 잘림·두 입력 이어 붙이기·줄 꺾기·ANSI 끼워 넣기, 고정 시드)
// 같지 않으면 실패한다. awk 판이 틀렸다고 판단되는 곳은 고치지 말고 KNOWN_BASH_BUGS 에 이유와 함께 적는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactText, screenFilter, screenSha, cleanPrompt, redactTextStr } from '../scripts/lib/console-redact.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LIBDIR = join(here, '..', 'scripts', 'lib');
const LIB = join(LIBDIR, 'console-redact.sh');
const MJS = join(LIBDIR, 'console-redact.mjs');
// 포팅 중 확인된 「awk 판이 이상한」 사례(없으면 비어 있다). 키는 `<함수>:<입력 sha1 앞 12자>`.
const KNOWN_BASH_BUGS = new Map();

const have = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).error === undefined;
const HAS_BASH = have('bash') && spawnSync('bash', ['-c', 'command -v awk'], { stdio: 'ignore' }).status === 0;
const skipNoBash = HAS_BASH ? false : 'bash·awk 없음';

const FN = {
  text: { sh: 'console_redact_text', js: redactText },
  screen: { sh: 'console_screen_filter', js: screenFilter },
  sha: { sh: 'console_screen_sha', js: screenSha },
  prompt: { sh: 'console_clean_prompt', js: cleanPrompt },
};

// bash 함수 한 번 실행 → {rc, out}. env 로 스위치(COORD_JS_REDACT) 등을 준다
function runShAsync(fn, input, env = {}) {
  return new Promise((resolve) => {
    const c = spawn('bash', ['-c', '. "$1"; "$2"', '_', LIB, FN[fn].sh], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    const chunks = [];
    c.stdout.on('data', (d) => chunks.push(d));
    c.stdin.on('error', () => {});
    c.on('close', (rc) => resolve({ rc, out: Buffer.concat(chunks) }));
    c.stdin.end(input);
  });
}
async function pool(items, n, fn) {
  const res = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    for (;;) { const i = next++; if (i >= items.length) return; res[i] = await fn(items[i], i); }
  }));
  return res;
}

// 한 사례를 비교해 차이 설명(없으면 null)을 돌려준다
function diff(name, fn, input, sh) {
  const js = FN[fn].js(input);
  if (js.rc === sh.rc && Buffer.compare(js.out, sh.out) === 0) return null;
  const show = (b) => JSON.stringify(b.toString('latin1').slice(0, 300));
  return `${name} [${fn}] rc bash=${sh.rc} js=${js.rc}\n  입력 ${show(Buffer.isBuffer(input) ? input : Buffer.from(input))}\n  bash ${show(sh.out)}\n  js   ${show(js.out)}`;
}

// ---------- 1) 기존 bash 시험이 넣는 입력 기록 ----------
function recordExistingCases() {
  const root = mkdtempSync(join(tmpdir(), 'redact-rec-'));
  const rec = join(root, 'rec');
  mkdirSync(rec);
  mkdirSync(join(root, 'tests'));
  cpSync(LIBDIR, join(root, 'scripts', 'lib'), { recursive: true });
  copyFileSync(join(here, 'console-redact.sh'), join(root, 'tests', 'console-redact.sh'));
  // 기록 래퍼: 진짜 lib 를 읽고, 네 함수가 받은 stdin 을 파일로 남긴 뒤 원래 함수에 그대로 넘긴다
  const wrapper = [
    `. ${JSON.stringify(join(LIBDIR, 'console-redact.sh'))}`,
    ...['console_redact_text:text', 'console_screen_filter:screen', 'console_screen_sha:sha', 'console_clean_prompt:prompt'].map((p) => {
      const [f, k] = p.split(':');
      return `eval "$(declare -f ${f} | sed '1s/^${f}/_real_${f}/')"\n${f}() { local _f; _f="$(/usr/bin/mktemp "$REDACT_REC_DIR/${k}.XXXXXXXX")"; /bin/cat > "$_f"; _real_${f} < "$_f"; }`;
    }),
  ].join('\n');
  writeFileSync(join(root, 'scripts', 'lib', 'console-redact.sh'), wrapper + '\n');
  const r = spawnSync('bash', [join(root, 'tests', 'console-redact.sh')], { env: { ...process.env, REDACT_REC_DIR: rec, CONSOLE_REDACT_ALT_AWK: '1' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
  const cases = readdirSync(rec).map((f) => ({ name: `기존시험:${f}`, fn: f.split('.')[0], input: readFileSync(join(rec, f)) }));
  rmSync(root, { recursive: true, force: true });
  return { cases, status: r.status, stdout: r.stdout };
}

// ---------- 3) 직접 만든 사례 ----------
const enc = (s) => Buffer.from(s, 'utf8');
const rep = (s, n) => s.repeat(n);
function handCases() {
  const T24 = rep('Ab9x', 6);
  const SK = 'sk-' + rep('a', 24);
  const HEX = rep('a1', 20);
  const ESC = '\x1b';
  const texts = [
    // 한글·전각
    '비밀번호: 1234', '비밀번호：1234', '패스워드＝abcd', '암호: 가나다라', '토큰 = abc', '단축키: Ctrl+C', '공개키: ssh-rsa AAAA', '시크릿키 : x1',
    'ｐａｓｓｗｏｒｄ=hunter2', 'ＰＡＳＳＷＯＲＤ: ＡＢＣＤ', '한글 문장에 ' + SK + ' 가 섞여 있다', '비밀번호는 abc 입니다 token=' + T24, '키: ' + HEX, rep('가', 700) + ' password=hunter2', rep('가나다', 300) + SK,
    '가'.repeat(150) + ' ' + HEX + ' 끝', 'token: "한글 값 전체" 뒤', 'password: \'닫는 따옴표 없음 한글',
    // ANSI
    `${ESC}[31mpassword=${ESC}[0mhunter2`, `${ESC}[38;5;196mtoken${ESC}[0m: ${T24}`, `${ESC}[1;31m${SK}${ESC}[0m`, `${ESC}]0;title\x07password=abc`, `${ESC}[`, `${ESC}`, `abc${ESC}[3`,
    `${ESC}]8;;http://x${ESC}\\link${ESC}]8;;${ESC}\\ api_key=zzz`, `${ESC}(Bpassword=x${ESC})0`, `${ESC}[?25l${ESC}[2Kpassword: abc`, `${ESC}M${ESC}7${ESC}8 token=abcdef`,
    // CRLF·CR
    'password=abc\r\nnext line\r\n', 'a\r\r\nb', 'x\rpassword=old\rtoken=new', '\r\n\r\n', 'k sk-' + rep('a', 24) + '\r\n' + rep('Ab3', 15) + '\r\n', 'line\r',
    // 빈 입력·공백·개행뿐
    '', '\n', '\n\n\n', '   ', ' \n \n', '\t\n', '\r', '\r\n',
    // 긴 줄
    rep('x', 1999), rep('x', 2000), rep('x', 2001), rep('x', 3000) + ' password=abc', rep('x', 1990) + ' ' + T24, rep('ab ', 700) + 'sk-' + rep('a', 30),
    rep('가', 667), rep('가', 668), rep('xxxxxxx ', 3000), rep('eyJ', 3000), rep('token=', 2000), rep('a://', 2000),
    // 깨진 UTF-8·제어 문자
    'abc\xe2\x80\x8bdef', '\xef\xbb\xbfpassword=x', 'a\u0000b', 'a\x01b\x7fc\td', 'p\u00adassword=abc', 'to\u2060ken=abc',
    // 줄 이음·여러 줄
    'here ' + rep('Ab3', 10) + '\n' + rep('Ab3', 10) + ' done\n', 'k ' + rep('Ab3', 14) + '\nabcdefgh\nrest\n', '-----BEGIN RSA PRIVATE KEY-----\nMIIEvQIBADAN\nAb12\n-----END RSA PRIVATE KEY-----\nafter\n',
    'x\nMIIEvQIBADANBgkqMIIEvQIBADANBgkq\n-----END PRIVATE KEY-----\n', 'secret:\n  nested: value\n    deeper\nother: 1\n', 'password: |\n  line1\n  line2\nnext: ok\n',
    '  3\ttoken: >-\n  4\t  abc\n  5\tname: x\n', '│ k ' + rep('Ab3', 10) + ' │\n│ ' + rep('Ab3', 10) + ' rest │\n',
    // 여러 규칙
    `a=${SK} b eyJ${rep('hd', 6)}.eyJ${rep('pl', 8)}.${rep('sg', 10)} password=${HEX} Bearer ${rep('Ab3', 15)} x dflow_pat_${rep('x9', 10)}`,
    'postgres://admin:pa#ss/w0rd@db.example.com:5432/app', 'jdbc:oracle:thin:scott/Tiger123@dbhost:1521:ORCL', 'sqlplus scott/Tiger123@ORCL', 'git clone https://glpat-' + T24 + '@gitlab.com/g/r.git',
    'curl -u admin:pw123 --user=a:b -p hunter -H "Authorization: Bearer abc.def"', 'machine h login u password pw123', 'uses: actions/checkout@v4 and x/y@latest',
  ];
  const cases = [];
  texts.forEach((t, i) => {
    const buf = Buffer.from(t, 'utf8');
    for (const fn of ['text', 'screen', 'prompt', 'sha']) cases.push({ name: `직접:${i}`, fn, input: buf });
  });
  // 1MB 경계(총합 = 줄 길이 + 1 의 합이 1048576 이하/초과)
  const line = rep('x', 1023) + '\n';
  cases.push({ name: '직접:1MB 정확히', fn: 'text', input: enc(rep(line, 1024)) });
  cases.push({ name: '직접:1MB+1', fn: 'text', input: enc(rep(line, 1024) + '\n') });
  cases.push({ name: '직접:1MB 넘는 한 줄', fn: 'text', input: enc(rep('xxxxxxx ', 140000)) });
  cases.push({ name: '직접:41줄 이상 화면', fn: 'screen', input: enc(Array.from({ length: 120 }, (_, i) => `line ${i} password=abc${i}`).join('\n')) });
  cases.push({ name: '직접:8KB 넘는 화면', fn: 'screen', input: enc(Array.from({ length: 40 }, (_, i) => `L${i} ` + rep('y', 300)).join('\n')) });
  const rawBytes = [[0x61, 0xff, 0x62, 0x20, 0x70, 0x61, 0x73, 0x73, 0x77, 0x6f, 0x72, 0x64, 0x3d, 0x78], [0xc3, 0x28, 0x20, 0x74, 0x6f, 0x6b, 0x65, 0x6e, 0x3d, 0x61, 0x62, 0x63], [0xe2, 0x80], [0xed, 0xa0, 0x80, 0x0a, 0xf0, 0x9f]];
  rawBytes.forEach((b, i) => { for (const fn of ['text', 'screen', 'prompt', 'sha']) cases.push({ name: `직접:원시바이트${i}`, fn, input: Buffer.from(b) }); });
  cases.push({ name: '직접:NUL 많은 입력', fn: 'screen', input: Buffer.from([0x61, 0, 0x62, 0x0a, 0, 0, 0x63]) });
  cases.push({ name: '직접:프롬프트 32KB 경계', fn: 'prompt', input: enc(rep('x', 8000) + '\n' + rep('x', 8000) + '\n' + rep('x', 8000) + '\n' + rep('x', 8000) + '\n') });
  cases.push({ name: '직접:프롬프트 2000자 한글', fn: 'prompt', input: enc(rep('가', 2000)) });
  cases.push({ name: '직접:프롬프트 2001자 한글', fn: 'prompt', input: enc(rep('가', 2001)) });
  cases.push({ name: '직접:프롬프트 1024바이트 경계 한글', fn: 'prompt', input: enc('x' + rep('가', 700)) });
  cases.push({ name: '직접:프롬프트 Unicode 공백', fn: 'prompt', input: enc('\u00a0\u3000\u2003 ') });
  cases.push({ name: '직접:프롬프트 U+2028', fn: 'prompt', input: enc('a\u2028b\u2029c') });
  return cases;
}

// ---------- 4) 변형 ----------
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function mutate(base, r) {
  const out = [];
  const s = base.toString('latin1');
  out.push(['crlf', Buffer.from(s.replace(/\n/g, '\r\n'), 'latin1')]);
  out.push(['truncate', base.subarray(0, Math.floor(r() * base.length))]);
  if (s.length > 20) {
    const i = 1 + Math.floor(r() * (s.length - 2));
    out.push(['wrap', Buffer.from(s.slice(0, i) + '\n' + s.slice(i), 'latin1')]);
    const esc = ['\x1b[31m', '\x1b[0m', '\x1b]0;t\x07', '\x1b(B', '\u0001', '\xc2\x85', '\xe2\x80\x8b'];
    const j = Math.floor(r() * s.length);
    out.push(['ansi', Buffer.from(s.slice(0, j) + esc[Math.floor(r() * esc.length)] + s.slice(j), 'latin1')]);
  }
  return out;
}

// ======================================================================================
test('기존 tests/console-redact.sh 가 기록용 래퍼 아래서도 통과한다', { skip: skipNoBash, timeout: 400000 }, () => {
  const { status, stdout } = recordExistingCases();
  assert.equal(status, 0, `기존 bash 시험이 실패했다:\n${(stdout || '').split('\n').filter((l) => l.startsWith('FAIL')).slice(0, 5).join('\n')}`);
});

test('골든: 기존 시험 입력·fixtures·직접 사례·변형 — awk 판과 바이트 단위로 같다', { skip: skipNoBash, timeout: 900000 }, async (t) => {
  const { cases: recorded } = recordExistingCases();
  const fixDir = join(here, 'fixtures');
  const fixtures = readdirSync(fixDir).filter((f) => !f.endsWith('/')).flatMap((f) => {
    let input;
    try { input = readFileSync(join(fixDir, f)); } catch { return []; }
    return ['text', 'screen', 'prompt', 'sha'].map((fn) => ({ name: `fixture:${f}`, fn, input }));
  });
  const hand = handCases();
  const r = rng(20261009);
  const base = [...recorded, ...fixtures, ...hand];
  const mutated = [];
  for (const c of [...recorded, ...fixtures, ...hand]) {
    if ((c.fn !== 'text' && c.fn !== 'screen') || c.input.length > 6000 || c.input.length === 0) continue;
    for (const [kind, input] of mutate(c.input, r)) mutated.push({ name: `${c.name}~${kind}`, fn: c.fn, input });
  }
  const all = [...base, ...mutated];
  const shOut = await pool(all, 8, (c) => runShAsync(c.fn, c.input));
  const fails = [];
  all.forEach((c, i) => {
    const d = diff(c.name, c.fn, c.input, shOut[i]);
    if (d) fails.push(d);
  });
  t.diagnostic(`사례 ${all.length}건 (기존시험 ${recorded.length} · fixtures ${fixtures.length} · 직접 ${hand.length} · 변형 ${mutated.length}) · 차이 ${fails.length}건`);
  assert.equal(fails.length, 0, `골든 차이 ${fails.length}건:\n${fails.slice(0, 8).join('\n')}`);
});

test('스위치: COORD_JS_REDACT=1 이어도 네 함수의 출력·종료 코드가 꺼짐과 같다', { skip: skipNoBash, timeout: 300000 }, async () => {
  const { cases: recorded } = recordExistingCases();
  const sample = recorded.filter((c) => c.input.length <= 6000).filter((_, i) => i % 3 === 0);
  const off = await pool(sample, 8, (c) => runShAsync(c.fn, c.input, { COORD_JS_REDACT: '' }));
  const on = await pool(sample, 8, (c) => runShAsync(c.fn, c.input, { COORD_JS_REDACT: '1' }));
  const bad = [];
  sample.forEach((c, i) => { if (off[i].rc !== on[i].rc || Buffer.compare(off[i].out, on[i].out) !== 0) bad.push(`${c.name} [${c.fn}] rc ${off[i].rc}/${on[i].rc}`); });
  assert.equal(bad.length, 0, bad.slice(0, 8).join('\n'));
});

test('모듈 단독: 알려진 값', () => {
  assert.equal(screenSha('').out.toString(), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n');
  assert.equal(redactTextStr('password=hunter2x\n').out, 'password=[가림]\n');
  assert.equal(redactText('').out.length, 0);
  assert.equal(screenFilter('').rc, 0);
  assert.equal(cleanPrompt('a\r\nb').out.toString(), 'a  b\n');
  assert.equal(cleanPrompt('').rc, 1);
  assert.equal(cleanPrompt('run this!').rc, 2);
  assert.equal(cleanPrompt('가'.repeat(2001)).rc, 3);
  assert.equal(redactText('x '.repeat(600000)).rc, 71);
});

test('CLI: node console-redact.mjs <모드> 가 모듈과 같은 결과·종료 코드를 낸다', () => {
  const run = (mode, input) => spawnSync(process.execPath, [MJS, mode], { input, windowsHide: true });
  const a = run('text', 'k sk-' + 'a'.repeat(24) + ' z\n');
  assert.equal(a.status, 0);
  assert.equal(a.stdout.toString(), 'k [가림] z\n');
  assert.equal(run('screen', 'abc  \r\n').stdout.toString(), 'abc\n');
  assert.equal(run('sha', '').stdout.toString(), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n');
  const p = run('clean-prompt', 'hi!');
  assert.equal(p.status, 2);
  assert.equal(p.stdout.length, 0);
  assert.equal(run('clean-prompt', '  \t').status, 1);
  assert.equal(run('clean-prompt', 'a\tb').stdout.toString(), 'a b\n');
  assert.equal(run('text', 'x '.repeat(600000)).status, 71);
  assert.equal(run('bogus', '').status, 2);
});

test('CLI: 한글이 깨지지 않고 CRLF 가 LF 로 바뀌지 않는다(윈도우에서도 stdout 은 바이트 그대로)', () => {
  const r = spawnSync(process.execPath, [MJS, 'text'], { input: Buffer.from('한글 줄\r\n비밀번호: 1234\r\n', 'utf8'), windowsHide: true });
  assert.equal(r.stdout.toString('utf8'), '한글 줄\r\n비밀번호: [가림]\n');
});

test('윈도우 모의: cygpath 가 있는 Git Bash 처럼 보여도 스위치가 cygpath -m 경로로 node 판을 부른다(윈도우 실기는 미측정)', { skip: skipNoBash }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'redact-cyg-'));
  try {
    // 가짜 cygpath: -m 이면 그대로 돌려주고, 불린 사실을 파일에 남긴다
    writeFileSync(join(dir, 'cygpath'), `#!/bin/sh\necho "$@" >> "${dir}/called"\nshift\nprintf '%s\\n' "$1"\n`, { mode: 0o755 });
    const r = spawnSync('bash', ['-c', '. "$1"; printf "password=abc\\n" | console_redact_text', '_', LIB], { env: { ...process.env, PATH: `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`, COORD_JS_REDACT: '1' }, encoding: 'utf8' });
    assert.equal(r.stdout, 'password=[가림]\n');
    assert.match(readFileSync(join(dir, 'called'), 'utf8'), /^-m /);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
