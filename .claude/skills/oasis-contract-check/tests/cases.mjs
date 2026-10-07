// 골든 비교 시험·기대값 생성기가 함께 쓰는 픽스처와 케이스 정의.
// 모든 픽스처는 호출자가 준 임시 폴더(base) 아래에만 만든다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixture, MUTATIONS } from '../scripts/selftest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(HERE, '..');
export const SCRIPTS = path.join(SKILL_DIR, 'scripts');
export const REPO_ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
export const SHARED_NODE = path.join(SKILL_DIR, '..', '_shared', 'node');

export const PY_CHECKER = path.join(SCRIPTS, 'check_oasis_contract.py');
export const NODE_CHECKER = path.join(SCRIPTS, 'check_oasis_contract.mjs');
export const PY_HOOK = path.join(SCRIPTS, 'hook_post_edit.py');
export const NODE_HOOK = path.join(SCRIPTS, 'hook_post_edit.mjs');

function put(root, rel, content) {
  const f = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  return f;
}
const crlf = (s) => s.replace(/\n/g, '\r\n');

function applyMutation(files, [, key, oldS, newS]) {
  const t = fs.readFileSync(files[key], 'utf8');
  const i = t.indexOf(oldS);
  fs.writeFileSync(files[key], t.slice(0, i) + newS + t.slice(i + oldS.length));
}

// ---------------------------------------------------------------------------
// edge 픽스처: python 방언 차이가 드러나는 입력을 모두 모았다
// ---------------------------------------------------------------------------
const EDGE_BPMN = crlf(`\ufeff<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
  <bpmn:process id="edge">
    <bpmn:serviceTask id="t1" name="grid 와 output 없음" camunda:class="edgeService">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="method" value="search" />
          <camunda:property name="grid" value="master" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="한글태스크" camunda:class="한글Service">
      <camunda:property name="output" value="rows" />
    </bpmn:serviceTask>
    <bpmn:serviceTask camunda:class="ghostBean">
      <camunda:property name="method" value="noid" />
    </bpmn:serviceTask>
    <bpmn:serviceTask id="t4" camunda:class="ghostBean"><camunda:property name="output" value="x" /></bpmn:serviceTask>
    <bpmn:serviceTask id="t5" camunda:class="badBytes"><camunda:property name="output" value="x" /></bpmn:serviceTask>
    <bpmn:serviceTaskFoo id="nope" camunda:class="neverBean"></bpmn:serviceTaskFoo>
    <bpmn:sequenceFlow id="f1" name="a"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">\${x}</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="f2" name="b"><conditionExpression>y</conditionExpression></bpmn:sequenceFlow>
    <bpmn:conditionExpressions>not counted</bpmn:conditionExpressions>
  </bpmn:process>
</bpmn:definitions>
`);

const EDGE_JAVA = crlf(`package x;

import java.util.Map;

/** @Transactional 은 Javadoc 안이라 무시된다. */
// @Transactional 줄 주석도 무시된다
@Service("edgeBeanExplicit")
public class EdgeService {
    String s = "@Transactional 문자열 리터럴 \\"이스케이프\\" 도 무시";
    String t = "a // b"; // 문자열 안의 // 는 주석 제거가 먼저라 줄 끝까지 지워진다(python 판과 같은 한계)
    @Transactional(readOnly = true) \u3000\u0085\ufeff
    public
    Map<String,\tObject>\u3000run\x1c(Map<String, Object> p) { return null; }
}
`);

const HANGUL_JAVA = `package x;

@Transactional한글
public class 한글Service {
    public Map<String,Object> 한글메서드 () { return null; }
}
`;

const BAD_BYTES_JAVA = Buffer.concat([
  Buffer.from('package x;\n\n// 깨진 바이트: '),
  Buffer.from([0xff, 0xfe]),
  Buffer.from('\n@Transactional('),
  Buffer.from([0xef, 0xbf, 0xbd, 0xc3, 0xe1, 0x80]),
  Buffer.from(')\npublic class BadBytes {}\n'),
]);

const CORE_BPMN = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:serviceTask id="c1" camunda:class="coreService">
    <camunda:property name="output" value="o" />
  </bpmn:serviceTask>
</bpmn:definitions>
`;

const MLS_BPMN = `<bpmn:definitions>
  <bpmn:serviceTask id="m1" camunda:class="mlsOneService"><camunda:property name="output" value="o"/></bpmn:serviceTask>
</bpmn:definitions>
`;

const EDGE_TSX = crlf(`import { request } from "@dk-oasis/shared";
// params: { rows } 는 주석이라 무시
/* params: { x: [1] } */
export async function a(rows: Row[], itemRows: Row[]) {
  const u = "http://example.com"; params: { gone: rows }
  request("a", { params: { rows } });
  request("a", { params: { a: 1, ds_itemRows: itemRows } });
  request("a", { params : {
    list: [1, 2],
  } });
  request("a", { params: { x: rows한 } });
  request("a", { params: { y: lastRows } });
  request("a", { params:\u2028{ sep: [1] } });
  request("a", { params:\x1c{ sep2: [2] } });
  request("a", { grids: {
    ds_a_b: { rows } } });
  request("a", { grids: { __a_b_: { rows }, ok: {} } });
  request("a", { grids : {  a1_2: {} } });
}
`);

const EDGE_TS = `export const k = { grids: { 한글_키: {} }, params: { n: [] } };
const j = { grids: { fine: { rows: [] } } };
`;

/** python 방언 차이 시험용 합성 저장소 */
export function buildEdge(root) {
  put(root, 'src/backend/mcm/api/src/main/resources/services/edge/edge.bpmn', EDGE_BPMN);
  put(root, 'src/backend/mcm/api/src/main/java/x/EdgeService.java', EDGE_JAVA);
  put(root, 'src/backend/mcm/api/src/main/java/x/한글Service.java', HANGUL_JAVA);
  put(root, 'src/backend/mcm/api/src/main/java/x/BadBytes.java', BAD_BYTES_JAVA);
  put(root, 'src/backend/mcm/api/src/test/java/x/GhostTest.java', '@Service("ghostBean")\nclass GhostTest {}\n');
  put(root, 'src/backend/mcm/api/build/gen/Skipped.bpmn', '<bpmn:serviceTask id="s" camunda:class="skippedBean"></bpmn:serviceTask>\n');
  put(root, 'src/backend/mcm/api/node_modules/p/Ignored.java', '@Service("ghostBean")\nclass Ignored {}\n');
  put(root, 'src/backend/mcm-core/src/main/resources/services/core.bpmn', CORE_BPMN);
  put(root, 'src/backend/mcm-core/src/main/java/c/CoreImpl.java', '@Service("coreService")\n@Transactional\npublic class CoreImpl {}\n');
  put(root, 'src/backend/mls/lib/src/main/resources/services/m.bpmn', MLS_BPMN);
  put(root, 'src/backend/mpp/lib/src/main/java/p/MlsOneService.java', '@Transactional(rollbackFor = Exception.class)\npublic class MlsOneService {\n  public Map<String, Object> go() { return null; }\n}\n');
  put(root, 'src/frontend/m-mcm/pages/edge.tsx', EDGE_TSX);
  put(root, 'src/frontend/m-mls/a.ts', EDGE_TS);
  put(root, 'src/frontend/m-mls/node_modules/x/bad.ts', 'const a = { grids: { a_b: {} } };\n');
  put(root, 'src/frontend/m-xyz/ignored.ts', 'const a = { grids: { a_b: {} } };\n');
  put(root, 'src/frontend/m-mcm/dist/out.ts', 'const a = { grids: { a_b: {} } };\n');
}

function buildMany(root) {
  const tasks = Array.from({ length: 12 }, (_, i) => `  <bpmn:serviceTask id="t${String(i + 1).padStart(2, '0')}" camunda:class="sampleScreenService"></bpmn:serviceTask>`).join('\n');
  put(root, 'src/backend/mls/lib/src/main/resources/services/many/many.bpmn', `<bpmn:definitions>\n${tasks}\n</bpmn:definitions>\n`);
}

// ---------------------------------------------------------------------------
// 저장소 루트 레이아웃(훅 시험용): 스크립트를 <repo>/.claude/skills/ 아래에 복사한다
// ---------------------------------------------------------------------------
export function installScripts(repo) {
  const sd = path.join(repo, '.claude', 'skills', 'oasis-contract-check', 'scripts');
  fs.mkdirSync(sd, { recursive: true });
  for (const f of ['check_oasis_contract.py', 'hook_post_edit.py', 'check_oasis_contract.mjs', 'hook_post_edit.mjs', 'selftest.mjs']) {
    fs.copyFileSync(path.join(SCRIPTS, f), path.join(sd, f));
  }
  const shared = path.join(repo, '.claude', 'skills', '_shared', 'node');
  fs.mkdirSync(shared, { recursive: true });
  for (const f of fs.readdirSync(SHARED_NODE)) {
    if (f.endsWith('.mjs')) fs.copyFileSync(path.join(SHARED_NODE, f), path.join(shared, f));
  }
  return {
    pyHook: path.join(sd, 'hook_post_edit.py'),
    nodeHook: path.join(sd, 'hook_post_edit.mjs'),
  };
}

/**
 * base 아래에 모든 픽스처를 만든다.
 * @returns {Record<string,string>} 이름 → 저장소 루트. 'real' 은 이 워크트리의 실제 저장소 루트.
 */
export function buildRoots(base) {
  const roots = { real: REPO_ROOT };
  const mk = (name, sub = name) => {
    const r = path.join(base, sub);
    fs.mkdirSync(r, { recursive: true });
    roots[name] = r;
    return r;
  };

  buildFixture(mk('clean'));
  MUTATIONS.forEach((mut, i) => {
    const files = buildFixture(mk(`mut${i + 1}`));
    applyMutation(files, mut);
  });
  {
    const files = buildFixture(mk('allmut'));
    for (const mut of MUTATIONS) applyMutation(files, mut);
  }
  buildEdge(mk('edge'));
  mk('empty');
  buildFixture(mk('blocked', 'out/repo')); // 경로에 `out` 성분이 있어 python 판은 모든 파일을 제외한다

  // 훅 시험용 저장소(스크립트 복사 포함)
  const hooks = {};
  const mkHook = (name, fill) => {
    const r = mk(name);
    fill(r);
    hooks[name] = installScripts(r);
  };
  mkHook('h-clean', (r) => buildFixture(r));
  mkHook('h-err', (r) => {
    const files = buildFixture(r);
    for (const mut of MUTATIONS) applyMutation(files, mut);
  });
  mkHook('h-many', (r) => { buildFixture(r); buildMany(r); });
  mkHook('h-nobpmn', (r) => put(r, 'src/backend/mls/x/A.java', 'class A {}\n'));
  return { roots, hooks };
}

// ---------------------------------------------------------------------------
// 케이스 정의
// ---------------------------------------------------------------------------
/** 검사기 CLI 케이스. args 의 `{root}` 는 해당 저장소 루트로 바뀐다. compare 기본: stdout·status. */
export const CHECK_CASES = [
  // (a) 실제 저장소
  { id: 'real/text', root: 'real', args: ['--root', '{root}'] },
  { id: 'real/text --all', root: 'real', args: ['--root', '{root}', '--all'] },
  { id: 'real/json', root: 'real', args: ['--root', '{root}', '--json'] },
  { id: 'real/json --all', root: 'real', args: ['--root', '{root}', '--json', '--all'] },
  { id: 'real/json --severity WARN', root: 'real', args: ['--root', '{root}', '--json', '--severity', 'WARN'] },
  { id: 'real/json --severity INFO', root: 'real', args: ['--root', '{root}', '--json', '--severity', 'INFO'] },
  { id: 'real/text --all --severity INFO', root: 'real', args: ['--root', '{root}', '--all', '--severity', 'INFO'] },
  { id: 'real/json --module mcm', root: 'real', args: ['--root', '{root}', '--json', '--module', 'mcm'] },
  { id: 'real/json --module mcm --module mls --severity INFO', root: 'real', args: ['--root', '{root}', '--json', '--module', 'mcm', '--module', 'mls', '--severity', 'INFO'] },
  { id: 'real/text --module mdm', root: 'real', args: ['--root', '{root}', '--module', 'mdm'], compare: ['stdout', 'status', 'stderr'] },
  { id: 'real/json --module mcm-core', root: 'real', args: ['--root', '{root}', '--json', '--module', 'mcm-core'], compare: ['stdout', 'status', 'stderr'] },
  { id: 'real/기본 --root (cwd=루트)', root: 'real', args: [], cwd: 'root' },
  { id: 'real/--root 상대경로', root: 'real', args: ['--root', '.', '--json'], cwd: 'root' },
  // (b) 합성 픽스처
  { id: 'clean/text', root: 'clean', args: ['--root', '{root}'] },
  { id: 'clean/json', root: 'clean', args: ['--root', '{root}', '--json'] },
  ...MUTATIONS.flatMap(([label], i) => [
    { id: `mut${i + 1}/json (${label})`, root: `mut${i + 1}`, args: ['--root', '{root}', '--json'] },
    { id: `mut${i + 1}/text --all (${label})`, root: `mut${i + 1}`, args: ['--root', '{root}', '--all'] },
  ]),
  { id: 'allmut/json', root: 'allmut', args: ['--root', '{root}', '--json'] },
  { id: 'allmut/text', root: 'allmut', args: ['--root', '{root}'] },
  { id: 'allmut/text --all --severity WARN', root: 'allmut', args: ['--root', '{root}', '--all', '--severity', 'WARN'] },
  { id: 'edge/json', root: 'edge', args: ['--root', '{root}', '--json'] },
  { id: 'edge/text', root: 'edge', args: ['--root', '{root}'] },
  { id: 'edge/text --all', root: 'edge', args: ['--root', '{root}', '--all'] },
  { id: 'edge/json --module mcm', root: 'edge', args: ['--root', '{root}', '--json', '--module', 'mcm'] },
  { id: 'edge/json --module mcm-core --module mls', root: 'edge', args: ['--root', '{root}', '--json', '--module', 'mcm-core', '--module', 'mls'] },
  { id: 'edge/json --module mls --severity WARN', root: 'edge', args: ['--root', '{root}', '--json', '--module', 'mls', '--severity', 'WARN'] },
  { id: 'edge/json --module mcm/api (하위 폴더)', root: 'edge', args: ['--root', '{root}', '--json', '--module', 'mcm/api'] },
  // (c) BPMN 0건 → 종료 코드 2 (stderr 문구도 같다)
  { id: 'empty/text', root: 'empty', args: ['--root', '{root}'], compare: ['stdout', 'status', 'stderr'] },
  { id: 'empty/json', root: 'empty', args: ['--root', '{root}', '--json'], compare: ['stdout', 'status', 'stderr'] },
  { id: 'blocked(out 성분)/json', root: 'blocked', args: ['--root', '{root}', '--json'], compare: ['stdout', 'status'] },
  { id: 'clean/없는 모듈', root: 'clean', args: ['--root', '{root}', '--module', 'nope'], compare: ['stdout', 'status', 'stderr'] },
  // (d) 사용 오류 → 종료 코드만 비교
  { id: 'usage/--severity BAD', root: 'clean', args: ['--root', '{root}', '--severity', 'BAD'], compare: ['stdout', 'status'] },
  { id: 'usage/--bogus', root: 'clean', args: ['--bogus'], compare: ['stdout', 'status'] },
  { id: 'usage/--root 값 없음', root: 'clean', args: ['--root'], compare: ['stdout', 'status'] },
  { id: 'usage/위치 인자', root: 'clean', args: ['foo'], compare: ['stdout', 'status'] },
  { id: 'usage/--severity 값 없음', root: 'clean', args: ['--severity'], compare: ['stdout', 'status'] },
];

const payload = (filePath, extra = {}) => JSON.stringify({ tool_input: { file_path: filePath }, ...extra });
const REL_BPMN = '/w/src/backend/mls/lib/src/main/resources/services/sampleScreen/sampleScreen.bpmn';
const REL_JAVA = '/w/src/backend/mcm-core/src/main/java/a/한글Service.java';
const REL_TS = '/w/src/frontend/m-mqc/page/a.tsx';

/** 훅 케이스. repo 'real' 은 이 워크트리의 실제 훅 스크립트, 그 외는 픽스처 저장소에 복사한 스크립트. */
export const HOOK_CASES = [
  { id: 'real/bpmn', repo: 'real', stdin: payload('/w/src/backend/mcm/api/src/main/resources/services/audit/screenUsage.bpmn') },
  { id: 'real/java', repo: 'real', stdin: payload(REL_JAVA) },
  { id: 'real/ts', repo: 'real', stdin: payload(REL_TS) },
  { id: 'real/tool_response.filePath 우선', repo: 'real', stdin: JSON.stringify({ tool_input: { file_path: '/w/readme.md' }, tool_response: { filePath: REL_TS } }) },
  { id: 'real/대상 아님(md)', repo: 'real', stdin: payload('/w/docs/readme.md') },
  { id: 'real/대상 아님(build 폴더)', repo: 'real', stdin: payload('/w/src/backend/mls/build/gen/A.java') },
  { id: 'real/대상 아님(node_modules)', repo: 'real', stdin: payload('/w/src/frontend/m-mls/node_modules/x/a.ts') },
  { id: 'real/대상 아님(없는 모듈)', repo: 'real', stdin: payload('/w/src/backend/mdm/A.java') },
  { id: 'real/확장자 아님(.xml)', repo: 'real', stdin: payload('/w/src/backend/mls/pom.xml') },
  { id: 'real/file_path 없음', repo: 'real', stdin: JSON.stringify({ tool_input: {} }) },
  { id: 'real/tool_input 없음', repo: 'real', stdin: JSON.stringify({ tool_name: 'Edit' }) },
  { id: 'real/깨진 JSON', repo: 'real', stdin: '{"tool_input": {"file_path": ' },
  { id: 'real/빈 stdin', repo: 'real', stdin: '' },
  { id: 'real/공백 stdin', repo: 'real', stdin: '  \n' },
  { id: 'real/윈도우 경로(무음)', repo: 'real', stdin: payload('C:\\w\\src\\backend\\mls\\build\\A.java') },
  { id: 'h-clean/bpmn(위반 없음)', repo: 'h-clean', stdin: payload(REL_BPMN) },
  { id: 'h-clean/무관', repo: 'h-clean', stdin: payload('/w/a.txt') },
  { id: 'h-err/bpmn(위반 5건)', repo: 'h-err', stdin: payload(REL_BPMN) },
  { id: 'h-err/java', repo: 'h-err', stdin: payload('/w/src/backend/mls/lib/SampleScreenService.java') },
  { id: 'h-err/ts tool_response', repo: 'h-err', stdin: JSON.stringify({ tool_input: { file_path: '/x.txt' }, tool_response: { filePath: REL_TS } }) },
  { id: 'h-many/외 N건', repo: 'h-many', stdin: payload(REL_BPMN) },
  { id: 'h-nobpmn/검사기 실패 알림', repo: 'h-nobpmn', stdin: payload('/w/src/backend/mls/x/A.java') },
  { id: 'h-nobpmn/무관 파일은 무음', repo: 'h-nobpmn', stdin: payload('/w/README.md') },
];
