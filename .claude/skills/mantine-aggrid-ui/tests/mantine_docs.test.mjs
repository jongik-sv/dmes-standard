// mantine_docs.mjs 시험.
//  1) 골든: python 판(legacy)과 node 판을 같은 입력으로 돌려 stdout·stderr·종료 코드를 비교한다(python3 가 있을 때. 없거나 DMES_NO_PYTHON=1 이면 skip).
//  2) 기대값: python 으로 미리 계산해 둔 tests/golden/expected/mantine_docs.json 과 node 판을 비교한다(python 없이도 돈다).
//  3) node 판 단독 시험: fetch 분기(TTL·404·오래된 캐시·깨진 UTF-8)·pyReU 변환·audit 보조 함수·실제 fetch 경로(로컬 서버).
// 임시 폴더는 makeTempDir 로 만들고 끝나면 스스로 지운다. 캐시는 늘 임시 폴더(MANTINE_LLMS_CACHE)를 쓴다 — 사용자 ~/.cache 는 건드리지 않는다.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { findPython, makeTempDir, runCommand } from '../../_shared/node/proc.mjs';
import { readJson } from '../../_shared/node/io.mjs';
import * as M from '../scripts/mantine_docs.mjs';
import {
  buildWorld, CASES, EXPECTED_FILE, realCases, runNodeCase, runPythonCase, copyTreeNow, FIXTURE_CACHE,
} from './_mantine_golden.mjs';

const base = fs.realpathSync(makeTempDir('mantine-test-'));
after(() => fs.rmSync(base, { recursive: true, force: true }));
const world = buildWorld(base);

const diffMsg = (a, b) => {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return `첫 차이 ${i}\n  python/기대: ${x.slice(Math.max(0, i - 30), i + 80)}\n  node:       ${y.slice(Math.max(0, i - 30), i + 80)}`;
};

// ---- 1) 골든: python 판 대 node 판 ------------------------------------------
const havePython = findPython() !== null;
for (const c of [...CASES, ...realCases()]) {
  test(`golden mantine_docs: ${c.id}`, { skip: havePython ? false : 'python3 없음' }, () => {
    const py = runPythonCase(world, c);
    const nd = runNodeCase(world, c);
    assert.deepEqual(nd, py, diffMsg(py, nd));
  });
}

// ---- 2) 기대값 파일 대 node 판 ----------------------------------------------
const expected = readJson(EXPECTED_FILE);
for (const c of CASES) {
  test(`expected mantine_docs: ${c.id}`, () => {
    const exp = expected.cases[c.id];
    assert.ok(exp, `expected 에 케이스가 없음: ${c.id} (make-expected-mantine.mjs --write 로 다시 생성)`);
    const nd = runNodeCase(world, c);
    assert.deepEqual(nd, exp, diffMsg(exp, nd));
  });
}

// ---- 3) node 판 단독 시험 ---------------------------------------------------
function inProc(fn) {
  const saved = { get: M.hooks.get, out: M.hooks.out, err: M.hooks.err, env: process.env.MANTINE_LLMS_CACHE };
  const out = [];
  const err = [];
  M.hooks.out = (s) => out.push(s);
  M.hooks.err = (s) => err.push(s);
  return Promise.resolve(fn({ out, err })).finally(() => {
    M.hooks.get = saved.get;
    M.hooks.out = saved.out;
    M.hooks.err = saved.err;
    if (saved.env === undefined) delete process.env.MANTINE_LLMS_CACHE;
    else process.env.MANTINE_LLMS_CACHE = saved.env;
  });
}
const body = (text, status = 200) => ({ status, statusText: '', body: Buffer.from(text, 'utf8') });
const oldTime = new Date(Date.now() - 8 * 24 * 3600 * 1000);

test('fetch_text: TTL 안의 캐시는 네트워크 없이 읽고 CRLF 를 LF 로 바꾼다', () => inProc(async () => {
  const d = fs.mkdtempSync(path.join(base, 'f1-'));
  const f = path.join(d, 'a.txt');
  fs.writeFileSync(f, 'x\r\ny\rz\n');
  M.hooks.get = () => { throw new Error('네트워크 호출 금지'); };
  assert.equal(await M.fetch_text('https://x/a', f), 'x\ny\nz\n');
}));

test('fetch_text: TTL 이 지나면 내려받아 저장한다(원문 그대로, 상위 폴더 생성)', () => inProc(async () => {
  const d = fs.mkdtempSync(path.join(base, 'f2-'));
  const f = path.join(d, 'sub', 'dir', 'a.txt');
  let calls = 0;
  M.hooks.get = async (url) => { calls++; assert.equal(url, 'https://x/a'); return body('새\r\n본문\n'); };
  assert.equal(await M.fetch_text('https://x/a', f), '새\r\n본문\n'); // 첫 응답은 python 처럼 줄끝을 바꾸지 않는다
  assert.equal(fs.readFileSync(f, 'utf8'), '새\r\n본문\n');
  assert.equal(await M.fetch_text('https://x/a', f), '새\n본문\n'); // 두 번째는 캐시에서(정규화)
  assert.equal(calls, 1);
  fs.utimesSync(f, oldTime, oldTime);
  M.hooks.get = async () => { calls++; return body('갱신'); };
  assert.equal(await M.fetch_text('https://x/a', f), '갱신');
  assert.equal(calls, 2);
}));

test('fetch_text: 실패하면 오래된 캐시를 쓰고 stderr 에 경고한다', () => inProc(async ({ err }) => {
  const d = fs.mkdtempSync(path.join(base, 'f3-'));
  const f = path.join(d, 'a.txt');
  fs.writeFileSync(f, '옛 캐시\n');
  fs.utimesSync(f, oldTime, oldTime);
  M.hooks.get = async () => body('nope', 404);
  assert.equal(await M.fetch_text('https://x/a', f), '옛 캐시\n');
  assert.deepEqual(err, ['[warn] https://x/a 조회 실패(HTTP Error 404: Not Found) — 오래된 캐시 사용\n']);
}));

test('fetch_text: 캐시도 없으면 Die(종료 코드 1 + [error] 문구)', () => inProc(async () => {
  const d = fs.mkdtempSync(path.join(base, 'f4-'));
  M.hooks.get = async () => body('x', 500);
  await assert.rejects(M.fetch_text('https://x/a', path.join(d, 'a.txt')), (e) => e instanceof M.Die
    && e.message === '[error] https://x/a 조회 실패: HTTP Error 500: Internal Server Error');
  M.hooks.get = async () => { const e = new Error('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; };
  await assert.rejects(M.fetch_text('https://x/a', path.join(d, 'a.txt')), /<urlopen error ENOTFOUND>/);
  assert.ok(!fs.existsSync(path.join(d, 'a.txt')));
}));

test('fetch_text: 깨진 UTF-8 응답은 오류로 본다(python decode 와 같음)', () => inProc(async () => {
  const d = fs.mkdtempSync(path.join(base, 'f5-'));
  M.hooks.get = async () => ({ status: 200, body: Buffer.from([0x61, 0xff, 0x62]) });
  await assert.rejects(M.fetch_text('https://x/a', path.join(d, 'a.txt')), M.Die);
}));

test('fetch_text: 응답의 BOM 은 지우지 않는다', () => inProc(async () => {
  const d = fs.mkdtempSync(path.join(base, 'f6-'));
  M.hooks.get = async () => ({ status: 200, body: Buffer.from('﻿abc', 'utf8') });
  assert.equal(await M.fetch_text('https://x/a', path.join(d, 'a.txt')), '﻿abc');
}));

test('main: get 은 인덱스·페이지 모두 캐시로 처리하고 네트워크를 쓰지 않는다 + 존재하지 않는 이름은 stderr 1', () => inProc(async ({ out, err }) => {
  const d = path.join(base, 'f7-cache');
  copyTreeNow(FIXTURE_CACHE, d);
  process.env.MANTINE_LLMS_CACHE = d;
  M.hooks.get = () => { throw new Error('네트워크 호출 금지'); };
  assert.equal(await M.main(['get', 'collapse', '--section', 'props']), 0);
  assert.ok(out.join('').includes('Props') || out.join('').includes('제목 없음'));
  out.length = 0;
  assert.equal(await M.main(['get', 'no-such-thing']), 1);
  assert.equal(out.length, 0);
  assert.equal(err.join(''), "[error] 'no-such-thing' 페이지를 인덱스에서 찾지 못했다. `search no-such-thing` 로 slug 를 확인한다.\n");
}));

test('main: 페이지가 캐시에 없으면 인덱스의 URL 로 한 번만 받는다', () => inProc(async ({ out }) => {
  const d = path.join(base, 'f8-cache');
  copyTreeNow(FIXTURE_CACHE, d);
  fs.rmSync(path.join(d, 'pages', 'core-button.md'));
  process.env.MANTINE_LLMS_CACHE = d;
  const urls = [];
  M.hooks.get = async (u) => { urls.push(u); return body('# Button\nhello\n'); };
  assert.equal(await M.main(['get', 'button']), 0);
  assert.deepEqual(urls, ['https://mantine.dev/llms/core-button.md']);
  assert.equal(out.join(''), '# Button\nhello\n\n');
  assert.equal(fs.readFileSync(path.join(d, 'pages', 'core-button.md'), 'utf8'), '# Button\nhello\n');
}));

test('실제 fetch 경로: User-Agent·상태 코드·본문 (로컬 서버)', async () => {
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push(req.headers['user-agent']);
    if (req.url === '/missing') { res.statusCode = 404; res.end('no'); return; }
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('안녕\n');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  try {
    const ok = await M.http_get(`http://127.0.0.1:${port}/a`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.toString('utf8'), '안녕\n');
    const miss = await M.http_get(`http://127.0.0.1:${port}/missing`);
    assert.equal(miss.status, 404);
    assert.deepEqual(seen, ['mantine-ui-skill', 'mantine-ui-skill']);
  } finally {
    srv.close();
  }
});

test('실제 fetch 경로: 전역 fetch 경고가 stderr 로 새지 않는다', async () => {
  const srv = http.createServer((req, res) => res.end('x'));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  const warnings = [];
  const onWarn = (w) => warnings.push(w.name);
  process.on('warning', onWarn);
  try {
    await M.http_get(`http://127.0.0.1:${port}/`);
    await new Promise((r) => setImmediate(r));
    assert.ok(!warnings.includes('ExperimentalWarning'), warnings.join());
  } finally {
    process.off('warning', onWarn);
    srv.close();
  }
});

// ---- 정규식 변환(pyReU)·보조 함수 ------------------------------------------
test('pyReU: python 의 \\s \\w \\b 는 유니코드 기준', () => {
  const t = (src, s, flags = '') => M.pyReU(src, flags).test(s);
  assert.equal(t(String.raw`\bfoo\b`, '한글foo한글'), false); // 한글도 단어 문자 → 경계 아님
  assert.equal(t(String.raw`\bfoo\b`, '한글 foo 한글'), true);
  assert.equal(t(String.raw`\w+한글`, 'abc한글'), true);
  assert.equal(t(String.raw`^\w+$`, '가나다'), true);
  assert.equal(t(String.raw`\d+`, '٣٤'), true);
  assert.equal(t(String.raw`a\sb`, 'a\u001fb'), true); // python \s 는 \x1f 도 공백
  assert.equal(t(String.raw`a\sb`, 'a\u0085b'), true);
  assert.equal(t(String.raw`a\sb`, 'a﻿b'), false); // JS \s 와 달리 BOM 은 공백 아님
  assert.equal(t(String.raw`[\s]x`, '\u001fx'), true);
  assert.equal(t(String.raw`from ['\"]x`, 'from "x'), true); // 불필요한 \" 는 "
  assert.equal(t(String.raw`a\-b`, 'a-b'), true);
  assert.equal(t(String.raw`x{`, 'ax{b'), true); // 수량자가 아닌 { 는 글자
  assert.equal(t(String.raw`a{,3}b`, 'b'), true);
  assert.equal(t(String.raw`a{2}b`, 'aab'), true);
  assert.equal(t(String.raw`\B\w`, 'ab'), true);
  assert.equal(t('(?P<q>a)(?P=q)', 'aa'), true);
  assert.equal(t('abc$', 'abc'), true);
  assert.equal(t('[]a]', ']'), true);
  assert.equal(t('ÀÉ', 'àé', 'i'), true);
});

test('hasWordBounded: python re.search(rf"\\b{escape(name)}\\b") 와 같다', () => {
  const h = M.hasWordBounded;
  assert.equal(h('use Foo here', 'Foo'), true);
  assert.equal(h('FooBar', 'Foo'), false);
  assert.equal(h('Foo한글', 'Foo'), false);
  assert.equal(h('한글 Foo', 'Foo'), true);
  assert.equal(h('x_Foo', 'Foo'), false);
  assert.equal(h('a Foo1', 'Foo'), false);
  assert.equal(h('(Foo)', 'Foo'), true);
  assert.equal(h('FooFoo Foo', 'Foo'), true);
  assert.equal(h('a+b', '+b'), true); // 시작이 비단어 문자면 앞에 단어 문자가 있어야 경계
  assert.equal(h(' +b', '+b'), false);
  assert.equal(h('\u{1F600}Foo', 'Foo'), true);
  assert.equal(h('', ''), false);
  assert.equal(h('x', ''), true);
});

test('pyStrip: python str.strip 의 공백 집합', () => {
  assert.equal(M.pyStrip('\u001f\u0085 a b 　\n'), 'a b');
  assert.equal(M.pyStrip('﻿a﻿'), '﻿a﻿');
});

test('pyPathStr: pathlib 처럼 정리한다', { skip: process.platform === 'win32' }, () => {
  assert.equal(M.pyPathStr('./a//b/'), 'a/b');
  assert.equal(M.pyPathStr(''), '.');
  assert.equal(M.pyPathStr('.'), '.');
  assert.equal(M.pyPathStr('/'), '/');
  assert.equal(M.pyPathStr('//a'), '//a');
  assert.equal(M.pyPathStr('///a'), '/a');
  assert.equal(M.pyPathStr('a/../b'), 'a/../b');
});

test('decodeIgnore: 깨진 바이트는 버리고 정상 글자·BOM·줄끝은 python 처럼', () => {
  const buf = Buffer.concat([Buffer.from('a'), Buffer.from([0xff]), Buffer.from('b\r\nc\rd'), Buffer.from([0xe2, 0x82]), Buffer.from('한')]);
  assert.equal(M.decodeIgnore(buf), 'ab\nc\nd한');
  assert.equal(M.decodeIgnore(Buffer.from('﻿x')), '﻿x');
  assert.equal(M.decodeIgnore(Buffer.from([0xed, 0xa0, 0x80, 0x41])), 'A'); // 서로게이트 인코딩은 버린다
});

test('audit: 인자 없는 호출·경로 규칙 보조(in-process)', () => inProc(async ({ out }) => {
  assert.equal(M.cmd_audit({ paths: [path.join(world.auditSrc, 'clean')] }), 0);
  assert.equal(out.join(''), `\n1개 파일 점검, 의심 0건 — 통과\n`);
}));

test('refresh: 캐시가 폴더가 아니거나 없으면 아무것도 지우지 않고 문구만 낸다', () => inProc(async ({ out }) => {
  const f = path.join(base, 'refresh-file');
  fs.writeFileSync(f, 'x');
  process.env.MANTINE_LLMS_CACHE = f;
  assert.equal(M.cmd_refresh(), 0);
  assert.ok(fs.existsSync(f));
  assert.equal(out.join(''), `캐시 삭제: ${f}\n`);
  process.env.MANTINE_LLMS_CACHE = path.join(base, 'no-such-cache');
  assert.equal(M.cmd_refresh(), 0);
}));

// ---- pyReU 대 python re: 같은 패턴·같은 줄에서 일치 여부·일치 구간이 같다 ----------------
const RE_PATTERNS = [
  String.raw`\bfoo\b`, String.raw`\Bfoo`, String.raw`foo\B`, String.raw`\w+`, String.raw`\W+`, String.raw`\d+`, String.raw`\D+`, String.raw`\s+`, String.raw`\S+`,
  String.raw`[\w-]+`, String.raw`[\s,]+`, String.raw`[^\w\s]+`, String.raw`[\d.]+`, String.raw`[\-a]`, String.raw`[a\-z]+`, String.raw`[\]x]`, String.raw`[]a]`, String.raw`[^]a]`,
  String.raw`^\s*$`, String.raw`^foo`, String.raw`bar$`, String.raw`(?i)FOO`, String.raw`(?P<n>a)(?P=n)`, String.raw`(?:ab)+`, String.raw`a{2}`, String.raw`a{1,2}b`, String.raw`a{,2}b`,
  String.raw`x{`, String.raw`x}`, String.raw`{`, String.raw`a{b`, String.raw`\{x\}`, String.raw`\"q\"`, String.raw`\'q\'`, String.raw`\#`, String.raw`\ `, String.raw`\:`, String.raw`\=`, String.raw`\<`, String.raw`\,`,
  String.raw`(?<=a)b`, String.raw`(?<!a)b`, String.raw`a(?=b)`, String.raw`a(?!b)`, String.raw`\bsx=\{`, String.raw`#[0-9a-fA-F]{3,8}\b(?![\w-])`, String.raw`.`, String.raw`a.b`,
  String.raw`\x41`, String.raw`é`, String.raw`\t`, String.raw`é`, String.raw`ß`, String.raw`\b가\b`, String.raw`가\w`, String.raw`\w가`,
  String.raw`a|b|한`, String.raw`(foo|bar)\1`, String.raw`\Afoo`, String.raw`bar\Z`, String.raw`a*?b`, String.raw`(a)|(b)`,
];
const RE_LINES = [
  'foo', 'foo bar', 'foobar', 'foo한글', '한글foo', '한글 foo 한글', 'xfoo', 'FOO Foo foO', 'a_b-c.d', '  \t ', '', 'abab', 'aab', 'aaab', 'b', 'ab', 'x{ y} {', '{x}',
  '"q" \'q\'', '# #fff #12345 #ffff-x #fff한글 #FFFFFFFF', 'sx={{a}} xsx={1}', '٣٤٥ 123', 'é É ß ſ', 'tab\there', 'a\u001fb', 'a\u0085b', 'a﻿b', 'a b', 'a　b',
  '가 나', '가a', 'a가', 'foobarbar', 'barfoo', 'fooo', 'a\nb', ']x', 'x]', 'a-b', 'a,b', '٠١', 'ǅ', 'İ i̇ I ı',
];

test('pyReU: 패턴 60여 개 × 줄 40여 개를 python re 와 같은 결과(일치 구간까지)로 맞춘다', { skip: havePython ? false : 'python3 없음' }, () => {
  const py = findPython();
  const script = `
import json, re, sys
data = json.load(sys.stdin)
out = []
for p in data["patterns"]:
    row = []
    for flag in (0, re.I):
        try:
            rx = re.compile(p, flag)
        except re.error as e:
            row.append("ERR")
            continue
        r = []
        for line in data["lines"]:
            r.append([[m.start(), m.end(), m.group(0)] for m in rx.finditer(line)])
        row.append(r)
    out.append(row)
print(json.dumps(out, ensure_ascii=False))
`;
  const r = runCommand(py, ['-B', '-c', script], { input: JSON.stringify({ patterns: RE_PATTERNS, lines: RE_LINES }), env: { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
  assert.equal(r.status, 0, r.stderr);
  const pyOut = JSON.parse(r.stdout);
  // JS 인덱스는 UTF-16 단위, python 은 코드포인트 단위라 구간 대신 일치 문자열 목록으로 비교한다
  RE_PATTERNS.forEach((p, i) => {
    [[0, ''], [1, 'i']].forEach(([k, flags]) => {
      const exp = pyOut[i][k];
      let rx;
      try {
        rx = M.pyReU(p, flags);
      } catch (err) {
        assert.equal(exp, 'ERR', `${p} (${flags}): node 는 변환 실패(${err.message}) 인데 python 은 컴파일됨`);
        return;
      }
      if (exp === 'ERR') return; // python 이 거부하는 패턴은 node 가 받아도 상관없다
      RE_LINES.forEach((line, j) => {
        const got = [...line.matchAll(new RegExp(rx.source, `${rx.flags}g`))].map((m) => m[0]);
        assert.deepEqual(got, exp[j].map((m) => m[2]), `패턴 ${JSON.stringify(p)} 플래그 '${flags}' 줄 ${JSON.stringify(line)}`);
      });
    });
  });
});
