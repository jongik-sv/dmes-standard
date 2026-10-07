// oasis-contract-check 골든 시험.
//  1) python 판과 node 판을 같은 입력으로 돌려 stdout·종료 코드를 비교한다(python3 가 있을 때. 없으면 skip).
//  2) python 없이도 도는 보조 시험: 미리 python 으로 계산해 둔 tests/golden/expected.json 과 node 판을 비교한다.
//  3) node 판 단독 계약 시험(내보내기 함수, 훅 방어 동작).
// 임시 폴더는 모두 makeTempDir 로 만들고 끝나면 지운다.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { goldenTest } from '../../_shared/node/golden.mjs';
import { runNode, makeTempDir } from '../../_shared/node/proc.mjs';
import { readJson } from '../../_shared/node/io.mjs';
import { runCheck } from '../scripts/check_oasis_contract.mjs';
import {
  buildRoots, CHECK_CASES, HOOK_CASES, NODE_CHECKER, NODE_HOOK, PY_CHECKER, PY_HOOK,
} from './cases.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = makeTempDir('oasis-golden-');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { roots, hooks } = buildRoots(tmp);

const fill = (args, root) => args.map((a) => a.replaceAll('{root}', root));

// ---- 1) python 판 대 node 판 ------------------------------------------------
for (const c of CHECK_CASES) {
  const root = roots[c.root];
  const args = fill(c.args, root);
  const cwd = c.cwd === 'root' ? root : undefined;
  goldenTest(`golden 검사기: ${c.id}`, {
    python: { cmd: [PY_CHECKER, ...args], cwd },
    node: { script: NODE_CHECKER, args, cwd },
    compare: c.compare ?? ['stdout', 'status'],
  });
}

for (const c of HOOK_CASES) {
  const py = c.repo === 'real' ? PY_HOOK : hooks[c.repo].pyHook;
  const nd = c.repo === 'real' ? NODE_HOOK : hooks[c.repo].nodeHook;
  goldenTest(`golden 훅: ${c.id}`, {
    python: { cmd: [py], input: c.stdin },
    node: { script: nd, input: c.stdin },
    compare: ['stdout', 'status', 'stderr'],
  });
}

// ---- 2) python 없이 도는 보조 시험: 기대값 파일 비교 ------------------------
const expected = readJson(path.join(HERE, 'golden', 'expected.json'));

for (const c of CHECK_CASES) {
  if (c.root === 'real') continue;
  test(`expected 검사기: ${c.id}`, () => {
    const exp = expected.check[c.id];
    assert.ok(exp, `expected.json 에 케이스가 없음: ${c.id} (make-expected.mjs 로 다시 생성)`);
    const r = runNode(NODE_CHECKER, fill(c.args, roots[c.root]), { normalizeEol: true });
    assert.equal(r.status, exp.status);
    assert.equal(r.stdout, exp.stdout);
  });
}

for (const c of HOOK_CASES) {
  if (c.repo === 'real') continue;
  test(`expected 훅: ${c.id}`, () => {
    const exp = expected.hook[c.id];
    assert.ok(exp, `expected.json 에 케이스가 없음: ${c.id} (make-expected.mjs 로 다시 생성)`);
    const r = runNode(hooks[c.repo].nodeHook, [], { input: c.stdin, normalizeEol: true });
    assert.equal(r.status, exp.status);
    assert.equal(r.stdout, exp.stdout);
    assert.equal(r.stderr, '');
  });
}

// ---- 3) node 판 단독 계약 시험 ----------------------------------------------
test('실제 저장소 --json 은 훅 입력 계약(필드명·키 순서)을 지킨다', () => {
  const r = runNode(NODE_CHECKER, ['--root', roots.real, '--json'], { normalizeEol: true });
  assert.ok(r.status === 0 || r.status === 1, `종료 코드 ${r.status}: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(j), ['scanned', 'counts', 'findings']);
  assert.deepEqual(Object.keys(j.scanned), ['bpmn', 'entrypoint_beans', 'resolved', 'unresolved']);
  assert.deepEqual(Object.keys(j.counts), ['ERROR', 'WARN', 'INFO']);
  for (const f of j.findings) assert.deepEqual(Object.keys(f), ['rule', 'severity', 'target', 'detail']);
  assert.ok(j.scanned.bpmn > 0);
});

test('runCheck 내보내기: 정상·BPMN 0건', () => {
  const ok = runCheck({ root: roots.mut1 });
  assert.equal(ok.exitCode, 1);
  assert.equal(ok.counts.ERROR, 1);
  assert.equal(ok.findings[0].rule, '6-B-1');
  assert.equal(runCheck({ root: roots.clean }).exitCode, 0);
  assert.equal(runCheck({ root: roots.clean, severity: 'INFO' }).exitCode, 0);
  const none = runCheck({ root: roots.empty });
  assert.equal(none.exitCode, 2);
  assert.equal(none.noBpmn, true);
});

test('훅: 이상한 입력에도 항상 exit 0 · 무음', () => {
  const hook = hooks['h-err'].nodeHook;
  for (const stdin of ['[]', 'null', '"x"', '123', '{"tool_input": "str"}', '{"tool_input": {"file_path": 5}}', '{"tool_response": []}']) {
    const r = runNode(hook, [], { input: stdin });
    assert.equal(r.status, 0, stdin);
    assert.equal(r.stdout, '', stdin);
  }
});

test('훅: 윈도우 경로(역슬래시)도 대상 판정·파일명 표시가 된다', () => {
  const stdin = JSON.stringify({ tool_input: { file_path: 'C:\\w\\src\\backend\\mls\\lib\\SampleScreenService.java' } });
  const r = runNode(hooks['h-err'].nodeHook, [], { input: stdin });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.hookSpecificOutput.additionalContext, /\(편집: SampleScreenService\.java\)/);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.systemMessage, /^OASIS 계약 위반 5 건/);
});

test('훅: 한글이 깨지지 않는다', () => {
  const r = runNode(hooks['h-err'].nodeHook, [], { input: JSON.stringify({ tool_input: { file_path: '/w/src/backend/mls/lib/한글.java' } }) });
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('계약 위반'));
  assert.ok(r.stdout.includes('한글.java'));
  assert.ok(!r.stdout.includes('\ufffd'));
});
