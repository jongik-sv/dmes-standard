// ui_docs.mjs 시험.
//  1) 골든: python 판(legacy)과 node 판을 같은 합성·실제 문서 트리에서 돌려 stdout·종료 코드·생성 파일을 비교한다(python3 가 있을 때. 없으면 skip).
//     coverage 는 각 판이 자기 생성물(llms.txt·llms-full.txt)로 비교한다(트리마다 해당 판의 `--write` 를 먼저 돈다).
//  2) 기대값: python 으로 미리 계산해 둔 tests/golden/expected/ui_docs.json 과 node 판을 비교한다(python 없이도 돈다).
//  3) node 판 단독 시험: 데이터 표(GROUPS·EXCLUDED·EXPORT_FILES) 일치, 가짜 tsc 흐름, 보조 함수.
// 임시 폴더는 makeTempDir 로 만들고 끝나면 스스로 지운다.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findPython, makeTempDir } from '../../_shared/node/proc.mjs';
import { readJson } from '../../_shared/node/io.mjs';
import * as U from '../scripts/ui_docs.mjs';
import {
  CASES, REAL_CASES, EXPECTED_FILE, runCase, pythonData, nodeData,
} from './_ui_golden.mjs';

const base = fs.realpathSync(makeTempDir('ui-test-'));
after(() => fs.rmSync(base, { recursive: true, force: true }));

const diffMsg = (a, b) => {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return `첫 차이 ${i}\n  python/기대: ${x.slice(Math.max(0, i - 40), i + 100)}\n  node:       ${y.slice(Math.max(0, i - 40), i + 100)}`;
};

// ---- 1) 골든: python 판 대 node 판 ------------------------------------------
const havePython = findPython() !== null;
for (const c of [...CASES, ...REAL_CASES]) {
  test(`golden ui_docs: ${c.id}`, { skip: havePython ? false : 'python3 없음' }, () => {
    const py = runCase(base, c, 'py');
    const nd = runCase(base, c, 'node');
    assert.deepEqual(nd, py, diffMsg(py, nd));
  });
}

test('golden ui_docs: GROUPS·EXCLUDED·EXPORT_FILES 데이터가 python 판과 같다(순서 포함)', { skip: havePython ? false : 'python3 없음' }, () => {
  assert.deepEqual(nodeData(), pythonData(base));
});

// ---- 2) 기대값 파일 대 node 판 ----------------------------------------------
const expected = readJson(EXPECTED_FILE);
for (const c of CASES) {
  test(`expected ui_docs: ${c.id}`, () => {
    const exp = expected.cases[c.id];
    assert.ok(exp, `expected 에 케이스가 없음: ${c.id} (make-expected-ui.mjs --write 로 다시 생성)`);
    const nd = runCase(base, c, 'node');
    assert.deepEqual(nd, exp, diffMsg(exp, nd));
  });
}

test('expected ui_docs: 데이터 표', () => {
  assert.deepEqual(nodeData(), expected.data);
});

// ---- 3) node 판 단독 시험 ---------------------------------------------------
const LLMS_REL = '.claude/skills/mantine-aggrid-ui/references/components/llms.txt';
const LLMS_FULL_REL = '.claude/skills/mantine-aggrid-ui/references/components/llms-full.txt';

test('index·full --write 가 만든 파일은 LF 뿐이고 생성 문구는 node 호출 형태다', () => {
  const r = runCase(base, { id: 'w', args: ['index', '--write'], pre: [['full', '--write']], snap: [LLMS_REL, LLMS_FULL_REL] }, 'node');
  assert.equal(r.status, 0);
  for (const rel of [LLMS_REL, LLMS_FULL_REL]) {
    assert.equal(r.files[rel].crlf, false, rel);
    assert.match(r.files[rel].text, /`node \.claude\/skills\/mantine-aggrid-ui\/scripts\/ui_docs\.mjs index --write` 가 생성한다/);
    assert.ok(!/python|ui_docs\.py/.test(r.files[rel].text), rel);
  }
  assert.match(r.stdout, /^갱신: <TREE>\/\.claude\/skills\/mantine-aggrid-ui\/references\/components\/llms\.txt\n$/);
});

test('CRLF 로 체크아웃된 생성물(llms.txt·llms-full.txt)도 coverage 가 통과한다', () => {
  const c = CASES.find((x) => x.id === 'coverage-crlf-generated');
  const r = runCase(base, c, 'node');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.stdout, 'coverage 통과\n');
});

test('pure 함수: title_and_summary·find_doc 은 실제 문서 트리 없이도 동작(모듈 상수 경로 사용)', () => {
  // 모듈 상수 경로는 실제 references/components 를 가리킨다(읽기 전용).
  const names = U.doc_files();
  assert.ok(names.length > 50);
  assert.equal(new Set(names).size, names.length, '문서 이름 중복 없음');
  const [title] = U.title_and_summary('page-layout');
  assert.ok(title.length > 0);
  assert.equal(U.find_doc('page-layout'), 'page-layout');
  assert.equal(U.find_doc('PageLayout.md'), 'page-layout');
  assert.equal(U.find_doc('zzz-no-such-doc-zzz'), null);
});

test('copy_tree: 하위 폴더·빈 폴더·한글 이름·심볼릭 링크 대상 내용을 복사한다', () => {
  const src = fs.mkdtempSync(path.join(base, 'ct-src-'));
  fs.mkdirSync(path.join(src, 'a', 'b'), { recursive: true });
  fs.mkdirSync(path.join(src, 'empty'));
  fs.writeFileSync(path.join(src, 'a', 'b', '파일.txt'), '내용');
  fs.writeFileSync(path.join(src, 'top.txt'), 'top');
  let linked = false;
  try {
    fs.symlinkSync(path.join(src, 'top.txt'), path.join(src, 'link.txt'));
    linked = true;
  } catch { /* 윈도우 등 심볼릭 링크 불가 */ }
  const dst = path.join(base, 'ct-dst');
  U.copy_tree(src, dst);
  assert.equal(fs.readFileSync(path.join(dst, 'a', 'b', '파일.txt'), 'utf8'), '내용');
  assert.ok(fs.statSync(path.join(dst, 'empty')).isDirectory());
  if (linked) {
    assert.ok(!fs.lstatSync(path.join(dst, 'link.txt')).isSymbolicLink());
    assert.equal(fs.readFileSync(path.join(dst, 'link.txt'), 'utf8'), 'top');
  }
  assert.throws(() => U.copy_tree(src, dst), /EEXIST/); // python copytree 처럼 대상이 이미 있으면 실패
});
