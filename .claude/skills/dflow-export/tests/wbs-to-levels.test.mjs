// wbs-to-levels.mjs 시험. 옛 표기 표본을 바꿔 levels 검증기(role skeleton)를 통과하는지, 옮기는 규칙과 실패 조건을 확인한다.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeTempDir } from '../../_shared/node/proc.mjs';
import { businessDays, convertLegacyWbs, main, readTaskFields } from '../scripts/wbs-to-levels.mjs';
import { parse_wbs, validate } from '../../dflow-wbs-nlevel/scripts/wbs-nlevel-parse.mjs';

const base = makeTempDir('wbs-to-levels-test-');
after(() => fs.rmSync(base, { recursive: true, force: true }));

const LEGACY = `# WBS - 표본 프로젝트

> version: 1.0
> depth: 3
> start-date: 2026-11-02 / target-date: 2026-11-13 / updated: 2026-11-01

---

## Dev Config

### Domains
| domain | unit-test |
|--------|-----------|
| backend | \`npm test\` |

## WP-01: 공유 계약
- schedule: 2026-11-02 ~ 2026-11-03
- description: 기능 Task 가 함께 쓰는 계약

### TSK-01-01: 주문 계약 (계약 전용)
- category: infra
- domain: backend
- model: opus
- status: [ ]
- priority: critical
- assignee: dev@example.com
- schedule: 2026-11-02 ~ 2026-11-03
- tags: order, contract
- depends: -
- blocked-by: -
- entry-point: -
- note: 먼저 동결한다

#### PRD 요구사항
- prd-ref: PRD 3
- requirements:
  - 주문 인터페이스를 정의한다
  - 빈 표를 만든다
- acceptance:
  - 빌드 통과
- constraints:
  - 실행 로직 없음
- test-criteria:
  - 형 존재

#### 기술 스펙 (TRD)
- tech-spec: TRD 2, TRD 4
- api-spec: TRD 4 주문 인터페이스
- data-model: -
- ui-spec: -

## WP-02: 주문 화면

### TSK-02-01: 주문 목록 화면
- category: dev
- domain: fullstack
- model: sonnet
- status: [im]
- priority: high
- assignee: 홍길동
- schedule: 2026-11-07 ~ 2026-11-08
- tags: order
- depends: TSK-01-01
- entry-point: /order/list (메뉴: 주문 > 목록)

#### PRD 요구사항
- prd-ref: PRD 4
- requirements: 목록을 보인다, 검색한다
- acceptance:
  - 목록이 보인다

## 의존 그래프

\`\`\`mermaid
graph LR
  TSK-01-01 --> TSK-02-01
\`\`\`

- 최장 경로: TSK-01-01 → TSK-02-01
`;

function convert(text = LEGACY, module = 'sample') {
  return convertLegacyWbs(text, { module });
}

test('businessDays: 평일만 센다(시작·종료 포함)', () => {
  assert.equal(businessDays('2026-11-02', '2026-11-06'), 5); // 월~금
  assert.equal(businessDays('2026-11-06', '2026-11-09'), 2); // 금~월
  assert.equal(businessDays('2026-11-07', '2026-11-08'), 0); // 토~일
});

test('readTaskFields: 한 줄 값은 쉼표로 나누지 않고, 밑 항목·이어쓰기 줄을 모은다', () => {
  const { fields, stray } = readTaskFields([
    '- requirements:', '  - 첫째', '    이어서', '  - 둘째', '- tech-spec: TRD 2 계층, TRD 6 배선', '- depends: -', '자유 문단',
  ]);
  assert.deepEqual(fields.get('requirements'), ['첫째 이어서', '둘째']);
  assert.deepEqual(fields.get('tech-spec'), ['TRD 2 계층, TRD 6 배선']);
  assert.deepEqual(fields.get('depends'), []);
  assert.deepEqual(stray, ['자유 문단']);
});

test('옛 표기 → levels 표기: 검증 통과, Task 수 유지', () => {
  const { text, taskCount } = convert();
  assert.equal(taskCount, 2);
  assert.ok(text.startsWith('---\nproject: 표본 프로젝트\nmodule: sample\nstart_date: 2026-11-02\nlevels:\n'));
  const doc = parse_wbs(text);
  const rep = validate(doc, 'skeleton');
  assert.deepEqual(rep.errors, []);
  assert.equal(doc.nodes.filter((n) => n.id.startsWith('TSK-')).length, 2);
});

test('Task 줄·필드 옮기기', () => {
  const { text, report } = convert();
  const lines = text.split('\n');
  // 이메일 담당만 토큰, w = 평일 수, 상태는 늘 [ ]
  assert.ok(lines.includes('- [ ] TSK-01-01: 주문 계약 (계약 전용) @dev@example.com w:2 2026-11-02~2026-11-03'));
  assert.ok(lines.includes('- [ ] TSK-02-01: 주문 목록 화면 w:1 2026-11-07~2026-11-08'), '주말뿐인 일정은 w:1');
  // 절 번호뿐인 명세 → prd-ref, 글이 있는 명세·제약·비고 → requirements, test-criteria → acceptance
  assert.ok(lines.includes('  - prd-ref: PRD 3, TRD 2, TRD 4'));
  assert.ok(lines.includes('  - requirements: 주문 인터페이스를 정의한다; 빈 표를 만든다; 제약: 실행 로직 없음; API: TRD 4 주문 인터페이스; 비고: 먼저 동결한다'));
  assert.ok(lines.includes('  - acceptance: 빌드 통과 / 형 존재'));
  assert.ok(lines.includes('  - requirements: 목록을 보인다, 검색한다'), '한 줄 requirements 는 그대로');
  assert.ok(lines.includes('  - entry-point: /order/list (메뉴: 주문 > 목록)'));
  // 빈 값(-)·옛 전용 필드는 줄을 쓰지 않는다
  for (const gone of ['- depends: -', 'entry-point: -', 'status:', 'schedule:', 'blocked-by:', 'assignee:', 'tech-spec:', '#### ']) {
    assert.ok(!text.includes(gone), `남으면 안 되는 줄: ${gone}`);
  }
  // WP 설명은 주석, Dev Config 는 빠지고, 보고 장은 남는다
  assert.ok(lines.includes('<!-- 기능 Task 가 함께 쓰는 계약 -->'));
  assert.ok(!text.includes('Dev Config') && !text.includes('> version:'));
  assert.ok(text.includes('## 의존 그래프') && text.includes('TSK-01-01 --> TSK-02-01'));
  // 바꾼 것은 리포트에 남는다
  assert.ok(report.some((r) => r.startsWith('TSK-02-01: 상태 [im]')));
  assert.ok(report.some((r) => r.startsWith("TSK-02-01: 담당 '홍길동'")));
  assert.ok(report.some((r) => r.includes('Dev Config')));
});

test('ACT 헤딩이 있으면 4단계 levels', () => {
  const legacy = LEGACY.replace('### TSK-02-01: 주문 목록 화면', '### ACT-02-01: 목록\n\n#### TSK-02-01-01: 주문 목록 화면')
    .replace('#### PRD 요구사항\n- prd-ref: PRD 4', '##### PRD 요구사항\n- prd-ref: PRD 4');
  const { text } = convert(legacy);
  assert.ok(text.includes('  - { name: Activity, prefix: ACT, progress: rollup }'));
  assert.ok(text.includes('### ACT-02-01: 목록\n\n- [ ] TSK-02-01-01: 주문 목록 화면'));
  assert.ok(text.includes('> depth: 4'));
  assert.deepEqual(validate(parse_wbs(text), 'skeleton').errors, []);
});

test('실패 조건: 이미 levels 표기, acceptance 의 " / ", 보고 장의 들여쓴 필드 줄, 잘못된 module·priority', () => {
  assert.throws(() => convert('---\nmodule: x\n---\n'), /이미 frontmatter/);
  assert.throws(() => convert(LEGACY.replace('  - 빌드 통과', '  - 빌드 / 시험 통과')), /' \/ '/);
  assert.throws(() => convert(`${LEGACY}  - acceptance: 보고 장 줄\n`), /웹 파서가 노드·필드로 읽습니다/);
  assert.throws(() => convert(`${LEGACY}- [ ] 체크 항목\n`), /웹 파서가 노드·필드로 읽습니다/);
  assert.throws(() => convert(LEGACY, '한글폴더'), /--module/);
  assert.throws(() => convert(LEGACY.replace('priority: high', 'priority: urgent')), /priority 'urgent'/);
  assert.throws(() => convert(LEGACY.replace('주문 목록 화면', '주문 목록 화면 50%')), /제목에/);
});

test('CLI: 성공하면 --out 에 쓰고, 실패하면 아무것도 쓰지 않는다', () => {
  const dir = path.join(base, 'sample');
  fs.mkdirSync(dir);
  const src = path.join(dir, 'wbs.md');
  const out = path.join(base, 'out.md');
  fs.writeFileSync(src, LEGACY);
  const stderr = process.stderr.write;
  process.stderr.write = () => true;
  try {
    assert.equal(main(['--wbs', src, '--out', out]), 0);
    assert.ok(fs.readFileSync(out, 'utf8').includes('module: sample'), 'module 기본값 = 폴더 이름');
    fs.rmSync(out);
    // 바꾸기는 되지만 검증기가 거부하는 입력(ID 중복)
    fs.writeFileSync(src, LEGACY.replace('### TSK-02-01: 주문 목록 화면', '### TSK-01-01: 주문 목록 화면'));
    assert.equal(main(['--wbs', src, '--out', out]), 1);
    assert.ok(!fs.existsSync(out), '검증 실패면 쓰지 않는다');
    assert.equal(main(['--wbs', path.join(dir, 'wbs.md'), '--module', 'x y']), 1);
  } finally {
    process.stderr.write = stderr;
    process.exitCode = 0;
  }
  assert.equal(fs.readFileSync(src, 'utf8').startsWith('# WBS'), true, '--in-place 없이는 원본을 건드리지 않는다');
});
