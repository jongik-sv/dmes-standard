// scripts/lib/console-redact.mjs(node 판)의 출력·종료 코드를 골든(tests/golden/console-redact.json)과 바이트 단위로 대조한다.
// 골든: 옛 awk 판(bash)이 낸 (종료 코드, stdout) — 2026-10-09 bash 판 퇴역 직전에 만들었다.
//   입력 = (1) 옛 bash 시험이 네 함수에 넣던 입력 기록 277건 (2) tests/fixtures 화면 10개 x 네 함수
//          (3) 직접 만든 사례(한글·전각·ANSI·CRLF·빈 입력·긴 줄·깨진 UTF-8·NUL·1MB 경계 등) (4) 위 입력의 변형(고정 시드)
//   가짜 비밀은 이 저장소에 실제 키 모양 문자열로 남지 않는다(골든은 gzip+base64).
// 사용법: node --test tests/console-redact.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { redactText, screenFilter, screenSha, cleanPrompt, redactTextStr } from '../scripts/lib/console-redact.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MJS = join(here, '..', 'scripts', 'lib', 'console-redact.mjs');
const JS = { text: redactText, screen: screenFilter, sha: screenSha, prompt: cleanPrompt };
const unz = (b64) => gunzipSync(Buffer.from(b64, 'base64'));

test('골든: 기록 입력·fixtures·직접 사례·변형 — 네 함수의 종료 코드·출력이 golden 과 바이트 단위로 같다', (t) => {
  const golden = JSON.parse(readFileSync(join(here, 'golden', 'console-redact.json'), 'utf8'));
  assert.ok(golden.cases.length >= 2000, `골든 사례 수 ${golden.cases.length}`);
  const fails = [];
  const show = (b) => JSON.stringify(b.toString('latin1').slice(0, 300));
  for (const c of golden.cases) {
    const input = unz(c.in);
    const want = unz(c.out);
    const got = JS[c.fn](input);
    if (got.rc === c.rc && Buffer.compare(got.out, want) === 0) continue;
    fails.push(`${c.n} [${c.fn}] rc 골든=${c.rc} js=${got.rc}\n  입력 ${show(input)}\n  골든 ${show(want)}\n  js   ${show(got.out)}`);
  }
  t.diagnostic(`사례 ${golden.cases.length}건 · 차이 ${fails.length}건`);
  assert.equal(fails.length, 0, `골든 차이 ${fails.length}건:\n${fails.slice(0, 8).join('\n')}`);
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
  assert.equal(cleanPrompt('x'.repeat(200000)).rc, 3);          // 한 줄이 통째로 크면 남은 것이 없어 3
  assert.equal(cleanPrompt('x'.repeat(70).concat('\n').repeat(2900)).rc, 4);   // awk 판은 SIGPIPE 로 4
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
