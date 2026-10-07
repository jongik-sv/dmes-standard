// 시험 도우미(_norm.mjs·_aggrid_harness.mjs 의 maskRun)가 윈도우 경로 구분자를 제대로 맞추는지 mac 에서도 확인한다.
// process.platform 대신 platform 인자('win32')를 넘겨 win32 분기를 흉내 낸다(실제 윈도우 검증은 윈도우 PC 에서).

import test from 'node:test';
import assert from 'node:assert/strict';
import { normSep } from './_norm.mjs';
import { maskRun } from './_aggrid_harness.mjs';

const WIN_TMP = 'C:\\Users\\kim\\AppData\\Local\\Temp\\aggrid-golden-Ab12Cd';

test('normSep: win32 가 아니면 값을 그대로 돌려준다', () => {
  const v = { stdout: 'a\\b', list: ['c\\d'] };
  assert.equal(normSep(v, 'darwin'), v);
  assert.equal(normSep(v, 'linux'), v);
});

test('normSep: win32 이면 문자열·배열·객체 안의 모든 문자열에서 `\\` 를 `/` 로 바꾼다(키·숫자·null 은 그대로)', () => {
  const got = normSep({ status: 0, 'a\\k': null, stdout: '갱신: <TREE>\\.claude\\skills\\x.txt\n', files: { 'a/b': { crlf: false, text: 'x\\y' } }, list: ['m-fx\\pages\\a.tsx:3: 문구', 1] }, 'win32');
  assert.deepEqual(got, { status: 0, 'a\\k': null, stdout: '갱신: <TREE>/.claude/skills/x.txt\n', files: { 'a/b': { crlf: false, text: 'x/y' } }, list: ['m-fx/pages/a.tsx:3: 문구', 1] });
});

test('maskRun(win32 흉내): 윈도우 임시 폴더 아래 캐시 경로 `<T>\\cache-xxxxxx` 를 <CACHE> 로 바꾸고 나머지 구분자를 맞춘다', () => {
  const text = `캐시 삭제: ${WIN_TMP}\\cache-aB3dE9\n[warn] ${WIN_TMP}\\cache-aB3dE9\\latest\\react\\x.md 읽음 (127.0.0.1:41234)\n${WIN_TMP}\\trees\\front\\m-fx\\a.tsx:7: 문구\n`;
  const got = maskRun(text, WIN_TMP, 'win32');
  assert.equal(got, '캐시 삭제: <CACHE>\n[warn] <CACHE>/latest/react/x.md 읽음 (<SERVER>)\n<T>/trees/front/m-fx/a.tsx:7: 문구\n');
});

test('maskRun(posix): 기존 동작 그대로(`/` 경로·`\\` 는 건드리지 않는다)', () => {
  const tmp = '/var/folders/zz/T/aggrid-golden-Ab12Cd';
  const got = maskRun(`${tmp}/cache-aB3dE9/latest/x.md 정규식 a\\b\n`, tmp, 'darwin');
  assert.equal(got, '<CACHE>/latest/x.md 정규식 a\\b\n');
});
