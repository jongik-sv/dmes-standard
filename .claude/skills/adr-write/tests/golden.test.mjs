// 골든 비교: python 원본(tests/golden/legacy/adr_tool.legacy.py, 동결 사본)과 node 판(scripts/adr_tool.mjs)을
// 같은 임시 픽스처·같은 인자로 돌려 출력(stdout·stderr·종료 코드)과 생성 파일(바이트)을 비교한다.
// python 이 없는 PC(윈도우)에서는 전부 skip 된다. 실행: node --test .claude/skills/adr-write/tests/
//
// 알려진 차이(시험 대상 아님): node 판은 UTF-8 BOM 으로 시작하는 ADR 도 린트하고(python 은 첫 줄 제목을 못 찾아 ERROR),
// 저장소 밖 파일을 린트하면 절대 경로를 보여 준다(python 은 ValueError 로 죽는다),
// `lint --all 파일` 처럼 옵션이 위치 인자 앞에 오는 호출도 받아들인다(python argparse 는 사용 오류 2).
// 그 밖의 극단 경계(리뷰 확인, 운영 영향 낮음): 유니코드 숫자(전각 `１`)를 번호로 보지 않고, UTF-8 이 아닌 파일은 대체 문자로 읽어 계속하며
// (python 은 중단), U+2028 을 줄 경계로 보고, 심볼릭 링크 경로를 풀지 않으며, 공백이 든 `-` 시작 옵션 값·긴 옵션 접두 축약은 받지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { goldenToolTest } from '../../_shared/node/goldentool.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const legacy = path.join(HERE, 'golden', 'legacy', 'adr_tool.legacy.py');
const script = path.join(HERE, '..', 'scripts', 'adr_tool.mjs');

// 도구가 안내 문구에 자기 이름을 찍는다(`adr_tool.py lint …`). node 판은 `adr_tool.mjs`.
const replacePython = [['adr_tool.py', 'adr_tool.mjs']];

const GOOD = `# ADR-0007: 예시 결정

- **Status**: ACCEPTED
- **Date**: 2026-07-20
- **Decision Date**: 2026-07-20
- **Context Tags**: MLS, inventory

## 쉬운 설명 (현업용 요약)

창고에서 같은 자재를 두 사람이 동시에 가져가면 재고가 어긋나는 문제가 있었습니다.
앞으로는 먼저 요청한 쪽이 해당 수량을 확보하고, 나중 요청은 남은 수량만 봅니다.

## Context (배경)

배경 서술.

## Decision (결정)

결정 서술.

## Consequences (결과)

결과 서술.

## Alternatives Considered (대안)

대안 서술.

## References

- 참고
`;

const TRIGGER = `## Trigger (PROPOSED 인 경우만)

데이터가 모이면 ACCEPTED 로 전환한다.

`;

const proposed = GOOD.replace('- **Status**: ACCEPTED', '- **Status**: PROPOSED').replace('## References', `${TRIGGER}## References`);
const crlf = (t) => t.replace(/\n/g, '\r\n');

/** files: {'mls/0007-example.md': 본문, ...}  (docs/{모듈}/design/adr/ 아래에 만든다) */
function adrs(files, { readme = {} } = {}) {
  return (root) => {
    fs.mkdirSync(path.join(root, '.git'), { recursive: true });
    for (const [rel, body] of Object.entries(files)) {
      const [module, name] = rel.split('/');
      const d = path.join(root, 'docs', module, 'design', 'adr');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, name), body, 'utf8');
    }
    for (const [module, body] of Object.entries(readme)) {
      const d = path.join(root, 'docs', module, 'design', 'adr');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'README.md'), body, 'utf8');
    }
  };
}

const lintOf = (module, name) => (root) => ['lint', path.join(root, 'docs', module, 'design', 'adr', name)];

const cases = {
  // --- status ---
  'status: ADR 없음(폴더도 없음)': { setup: adrs({}), args: ['status', '--module', 'mls'] },
  'status: 번호·공백·부속 문서': {
    setup: adrs({
      'mls/0001-a.md': GOOD,
      'mls/0002-b.md': GOOD,
      'mls/0002-b-appendix.md': GOOD,
      'mls/0005-e.md': GOOD,
      'mls/not-an-adr.md': 'x',
      'mls/0003_bad_name.md': 'x',
    }),
    args: ['status', '--module', 'mls'],
  },
  'status: 모듈별 독립 번호': {
    setup: adrs({ 'mls/0001-a.md': GOOD, 'mls/0002-b.md': GOOD, 'mcm/0001-c.md': GOOD }),
    args: ['status', '--module', 'mcm'],
  },
  'status: 기본 모듈(aps)': { setup: adrs({ 'aps/0001-a.md': GOOD }), args: ['status'] },
  'status: README 는 건너뜀': { setup: adrs({ 'mls/0001-a.md': GOOD }, { readme: { mls: '# README\n' } }), args: ['status', '--module', 'mls'] },
  'status: 번호가 4자리를 넘는 다음 번호': { setup: adrs({ 'mls/9999-a.md': GOOD }), args: ['status', '--module', 'mls'] },

  // --- new ---
  'new: 기본(PROPOSED·Trigger 포함)': { setup: adrs({}), args: ['new', '--module', 'mqc', '--slug', 'sample-decision', '--title', '샘플'] },
  'new: ACCEPTED(Trigger 제거)': { setup: adrs({}), args: ['new', '--module', 'mqc', '--slug', 'accepted-one', '--status', 'ACCEPTED'] },
  'new: 제목·날짜·태그 지정(한글·특수 문자)': {
    setup: adrs({}),
    args: ['new', '--module', 'mls', '--slug', 'ko-title', '--title', '한글 {중괄호} ${x} "따옴표"', '--date', '2026-10-07', '--tags', 'MLS, 재고'],
  },
  'new: 제목 생략(slug 로 대체)·모듈 대문자 태그': { setup: adrs({}), args: ['new', '--module', 'mls', '--slug', 'stock-id-surrogate-key'] },
  'new: 기존 번호 다음으로 채번': { setup: adrs({ 'mls/0001-a.md': GOOD, 'mls/0004-d.md': GOOD }), args: ['new', '--module', 'mls', '--slug', 'next-one'] },
  'new: 잘못된 slug(밑줄·대문자)': { setup: adrs({}), args: ['new', '--module', 'mls', '--slug', 'Bad_Slug'] },
  'new: 잘못된 status': { setup: adrs({}), args: ['new', '--module', 'mls', '--slug', 'ok', '--status', 'REJECTED'] },
  'new: slug 없음(오류 2)': { setup: adrs({}), args: ['new', '--module', 'mls'] },

  // --- lint: 규약 준수·위반 ---
  'lint: 규약 준수(GREEN)': { setup: adrs({ 'mls/0007-example.md': GOOD }), args: lintOf('mls', '0007-example.md') },
  'lint: 규약 준수(CRLF 저장본)': { setup: adrs({ 'mls/0007-example.md': crlf(GOOD) }), args: lintOf('mls', '0007-example.md') },
  'lint: PROPOSED + Trigger': { setup: adrs({ 'mls/0007-example.md': proposed }), args: lintOf('mls', '0007-example.md') },
  'lint: Status 에 산문(이모지·repr)': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('- **Status**: ACCEPTED', '- **Status**: ✅ ACCEPTED (2026-07-14 확정, 구현 D1~D6 완료, 회귀 2534/0)') }),
    args: lintOf('mls', '0007-example.md'),
  },
  "lint: Status 에 작은따옴표(repr 따옴표 선택)": {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('- **Status**: ACCEPTED', "- **Status**: it's done") }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: Status 에 작은·큰따옴표 모두': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('- **Status**: ACCEPTED', '- **Status**: it\'s "done"') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: Status 에 탭·역슬래시': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('- **Status**: ACCEPTED', '- **Status**: a\tb\\c') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: SUPERSEDED 허용': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('- **Status**: ACCEPTED', '- **Status**: SUPERSEDED by ADR-0009') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: SUPERSEDED 형식 오류': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('- **Status**: ACCEPTED', '- **Status**: SUPERSEDED by ADR-9') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: Status 줄 없음': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('- **Status**: ACCEPTED\n', '') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: Status 값이 다음 줄(\\s 가 줄바꿈을 넘음)': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('- **Status**: ACCEPTED', '- **Status**:') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: 쉬운 설명 절 누락': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace(/## 쉬운 설명 \(현업용 요약\)[\s\S]*?(?=## Context)/, '') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: Alternatives 절 누락': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace(/## Alternatives Considered \(대안\)[\s\S]*?(?=## References)/, '') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: 제목 번호 불일치': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('# ADR-0007:', '# ADR-0009:') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: 제목 줄 형식 오류': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('# ADR-0007: 예시 결정', '# 예시 결정') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: PROPOSED 인데 Trigger 없음': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('- **Status**: ACCEPTED', '- **Status**: PROPOSED') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: ACCEPTED 인데 Trigger 남음(WARN)': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('## References', `${TRIGGER}## References`) }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: 절 순서 어긋남(WARN)': {
    setup: adrs({
      'mls/0007-example.md': GOOD.replace('## Decision (결정)\n\n결정 서술.\n\n', '').replace('## Consequences (결과)', '## Consequences (결과)\n\n## Decision (결정)\n\n결정 서술.\n\n## Placeholder'),
    }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: 쉬운 설명에 클래스·메서드 표기(WARN)': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace('먼저 요청한 쪽이', '`InventoryClaimService` 가').replace('수량을 확보하고', '`claimStock()` 으로 확보하고') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: 쉬운 설명이 너무 짧음(WARN)': {
    setup: adrs({ 'mls/0007-example.md': GOOD.replace(/창고에서[\s\S]*?봅니다\.\n/, '짧음.\n') }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: 쉬운 설명 절이 마지막 절(다음 헤딩 없음)': {
    setup: adrs({ 'mls/0007-example.md': '# ADR-0007: x\n\n- **Status**: ACCEPTED\n\n## 쉬운 설명 (현업용 요약)\n\n짧음.' }),
    args: lintOf('mls', '0007-example.md'),
  },
  'lint: 파일명 형식 오류': {
    setup: adrs({ 'mls/example.md': GOOD }),
    args: lintOf('mls', 'example.md'),
  },
  'lint: 빈 파일': { setup: adrs({ 'mls/0001-empty.md': '' }), args: lintOf('mls', '0001-empty.md') },
  'lint: 한글만 있는 제목·CRLF·Status 오류 혼합': {
    setup: adrs({ 'mls/0007-example.md': crlf(GOOD.replace('- **Status**: ACCEPTED', '- **Status**: 확정')) }),
    args: lintOf('mls', '0007-example.md'),
  },

  // --- lint: 대상 지정 방식 ---
  'lint: 파일 여러 개(통과·위반 혼합)': {
    setup: adrs({ 'mls/0001-a.md': GOOD.replace('ADR-0007', 'ADR-0001'), 'mls/0002-b.md': GOOD }),
    args: (root) => ['lint', path.join(root, 'docs/mls/design/adr/0001-a.md'), path.join(root, 'docs/mls/design/adr/0002-b.md')],
  },
  'lint: 없는 파일': { setup: adrs({}), args: (root) => ['lint', path.join(root, 'docs/mls/design/adr/9999-none.md')] },
  'lint: 대상 없음(오류 2)': { setup: adrs({ 'mls/0001-a.md': GOOD }), args: ['lint', '--module', 'mls'] },
  'lint: --all 현황(ERROR 가 있어도 0)': {
    setup: adrs({ 'mls/0001-a.md': GOOD.replace('ADR-0007', 'ADR-0001'), 'mls/0002-b.md': GOOD, 'mls/0003-c.md': 'x' }),
    args: ['lint', '--module', 'mls', '--all'],
  },
  'lint: --all 인데 ADR 없음': { setup: adrs({}), args: ['lint', '--module', 'mls', '--all'] },
  'lint: 파일이 있으면 --all 보다 우선': {
    setup: adrs({ 'mls/0001-a.md': GOOD.replace('ADR-0007', 'ADR-0001'), 'mls/0002-b.md': GOOD }),
    args: (root) => ['lint', path.join(root, 'docs/mls/design/adr/0001-a.md'), '--all', '--module', 'mls'],
  },

  // --- index ---
  'index: ADR 없음': { setup: adrs({}), args: ['index', '--module', 'mls'] },
  'index: README 없음(오류 1)': { setup: adrs({ 'mls/0001-a.md': GOOD }), args: ['index', '--module', 'mls'] },
  'index: 정합 OK': {
    setup: adrs({ 'mls/0001-a.md': GOOD, 'mls/0002-b.md': GOOD }, { readme: { mls: '| 번호 | 제목 |\n|---|---|\n| 0001 | a |\n| 0002 | b |\n' } }),
    args: ['index', '--module', 'mls'],
  },
  'index: 누락·유령': {
    setup: adrs({ 'mls/0001-a.md': GOOD, 'mls/0002-b.md': GOOD }, { readme: { mls: '| 0001 | a |\n| 0009 | ghost |\n' } }),
    args: ['index', '--module', 'mls'],
  },
  'index: 같은 번호 부속 문서가 인덱스에 없음': {
    setup: adrs(
      { 'mls/0001-a.md': GOOD, 'mls/0001-a-appendix.md': GOOD, 'mls/0002-b.md': GOOD, 'mls/0002-b-x.md': GOOD, 'mls/0002-b-y.md': GOOD },
      { readme: { mls: '| 0001 | a |\n| 0002 | b | 0002-b-x.md |\n' } },
    ),
    args: ['index', '--module', 'mls'],
  },
  'index: CRLF README': {
    setup: adrs({ 'mls/0001-a.md': GOOD }, { readme: { mls: '| 번호 |\r\n| 0001 | a |\r\n' } }),
    args: ['index', '--module', 'mls'],
  },
};

for (const [name, c] of Object.entries(cases)) {
  goldenToolTest(name, { legacy, script, replacePython, ...c });
}

// argparse 와 문구가 다른 사용 오류는 종료 코드(2)만 비교한다.
const usage = {
  '사용 오류: 인자 없음': [],
  '사용 오류: 알 수 없는 명령': ['bogus'],
  '사용 오류: 알 수 없는 옵션': ['status', '--nope'],
  '사용 오류: 값이 빠진 옵션': ['status', '--module'],
};
for (const [name, args] of Object.entries(usage)) {
  goldenToolTest(name, { legacy, script, setup: adrs({ 'mls/0001-a.md': GOOD }), args, statusOnly: true });
}
