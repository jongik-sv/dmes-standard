// 골든 비교: python 원본(tests/golden/legacy/migration_tool.legacy.py, 동결 사본)과 node 판(scripts/migration_tool.mjs)을
// 같은 임시 픽스처·같은 인자로 돌려 출력(stdout·stderr·종료 코드)과 생성 파일(바이트)을 비교한다.
// python 이 없는 PC(윈도우)에서는 전부 skip 된다. 실행: node --test .claude/skills/flyway-migration-add/tests/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { goldenToolTest } from '../../_shared/node/goldentool.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const legacy = path.join(HERE, 'golden', 'legacy', 'migration_tool.legacy.py');
const script = path.join(HERE, '..', 'scripts', 'migration_tool.mjs');

const REL = 'src/backend/aps-core/src/main/resources/db/migration';
const MDM_REL = 'src/backend/mdm/api/src/main/resources/db/migration/mdm';

/** layout: {폴더: [버전 | 파일명, ...]} — 숫자면 V{n}__fixture_{n}.sql, 문자열이면 그 이름 그대로 만든다. */
function fixture(layout, rel = REL, { git = true } = {}) {
  return (root) => {
    for (const [dir, items] of Object.entries(layout)) {
      const p = path.join(root, rel, dir);
      fs.mkdirSync(p, { recursive: true });
      for (const it of items) {
        const name = typeof it === 'number' ? `V${it}__fixture_${it}.sql` : it;
        fs.writeFileSync(path.join(p, name), '-- fixture\r\n', 'utf8');
      }
    }
    if (git) fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  };
}

const ASYM = { oracle: [1, 22, 88, 89, 90], postgresql: [1, 22, 88, 90], sqlite: [1, 22, 61, 88] };

const cases = {
  // --- status ---
  'status: 방언 3개 비대칭(채번 충돌 경고·빠진 번호)': { setup: fixture(ASYM), args: ['status'] },
  'status: 방언 하나만(sqlite)': { setup: fixture({ sqlite: [1, 2, 3] }), args: ['status'] },
  'status: 방언 두 개가 같은 집합이면 충돌 경고 없음': {
    setup: fixture({ oracle: [1, 2], sqlite: [1, 2] }),
    args: ['status'],
  },
  'status: 공통 폴더만': { setup: fixture({ 'aps-core': [1, 5] }), args: ['status'] },
  'status: 공통+방언 혼합': { setup: fixture({ 'aps-core': [1], sqlite: [1, 2, 17] }), args: ['status'] },
  'status: 알 수 없는 폴더 이름(repr 출력)': {
    setup: fixture({ sqlite: [1, 2], 'weird dialect': [1], "it's": [3] }),
    args: ['status'],
  },
  'status: 한글 폴더 이름': { setup: fixture({ sqlite: [1], 한글방언: [1, 4] }), args: ['status'] },
  'status: 빈 방언 폴더(번호 파일 없음)': {
    setup: (root) => {
      fixture({ oracle: [], sqlite: [] })(root);
    },
    args: ['status'],
  },
  'status: 빈 방언 폴더와 채워진 폴더 혼합': { setup: fixture({ oracle: [], sqlite: [3] }), args: ['status'] },
  'status: 마이그레이션 폴더는 있으나 하위 폴더 없음': {
    setup: (root) => {
      fs.mkdirSync(path.join(root, REL), { recursive: true });
      fs.mkdirSync(path.join(root, '.git'));
    },
    args: ['status'],
  },
  'status: 마이그레이션 폴더 없음(오류 2)': {
    setup: (root) => fs.mkdirSync(path.join(root, '.git')),
    args: ['status'],
  },
  'status: 이름이 맞지 않는 파일은 무시': {
    setup: fixture({ oracle: [1, 'V2_single_underscore.sql', 'Vx__bad.sql', 'V3__ok.sql', 'README.md', 'v4__lower.sql'] }),
    args: ['status'],
  },
  'status: 앞자리 0 번호 중복(V01·V1)': {
    setup: fixture({ oracle: ['V01__a.sql', 'V1__b.sql', 'V02__c.sql'], sqlite: [1, 2] }),
    args: ['status'],
  },
  'status: api 하위·모듈 폴더 한 단 더(mdm)': {
    setup: fixture({ sqlite: [1, 2, 5], oracle: [1, 2] }, MDM_REL),
    args: ['status', '--module', 'mdm'],
  },
  'status: 다른 모듈 이름 지정(없는 모듈)': { setup: fixture(ASYM), args: ['status', '--module', 'nope'] },
  'status: 옵션을 명령 앞에 둠': { setup: fixture(ASYM), args: ['--module', 'aps-core', 'status'] },

  // --- scaffold ---
  'scaffold: 전체 방언(기본)': { setup: fixture(ASYM), args: ['scaffold', '--slug', 'add_foo_column', '--title', 'foo 컬럼 추가'] },
  'scaffold: 제목 생략(slug 로 대체)': { setup: fixture(ASYM), args: ['scaffold', '--slug', 'add_foo_column'] },
  'scaffold: 한글 제목·특수 문자 제목': {
    setup: fixture({ oracle: [1], sqlite: [1] }),
    args: ['scaffold', '--slug', 'ko_title', '--title', '한글 제목 {중괄호} "따옴표" \'작은\' ${x}'],
  },
  'scaffold: 일부 방언(결번 안내)': { setup: fixture(ASYM), args: ['scaffold', '--slug', 'oracle_pg_fix', '--dialect', 'oracle,postgresql'] },
  'scaffold: 방언 하나만 지정': { setup: fixture(ASYM), args: ['scaffold', '--slug', 'fk_parity', '--dialect', 'oracle'] },
  'scaffold: --dialect both': { setup: fixture({ oracle: [1], sqlite: [1] }), args: ['scaffold', '--slug', 'b', '--dialect', 'both'] },
  'scaffold: 쉼표 목록에 공백·빈 항목': {
    setup: fixture(ASYM),
    args: ['scaffold', '--slug', 'sp', '--dialect', ' oracle , ,sqlite '],
  },
  'scaffold: 방언 하나뿐인 모듈(단일 위치)': { setup: fixture({ sqlite: [1, 2] }), args: ['scaffold', '--slug', 'only_sqlite'] },
  'scaffold: 공통 폴더만': { setup: fixture({ 'aps-core': [1] }), args: ['scaffold', '--slug', 'add_bar'] },
  'scaffold: 공통+방언 혼합은 all 거부': { setup: fixture({ 'aps-core': [1], sqlite: [1, 2, 17] }), args: ['scaffold', '--slug', 'mixed'] },
  'scaffold: 공통+방언 혼합에서 공통 명시': {
    setup: fixture({ 'aps-core': [1], sqlite: [1, 2, 17] }),
    args: ['scaffold', '--slug', 'mixed', '--dialect', 'aps-core'],
  },
  'scaffold: 공통+방언 혼합에서 방언 명시': {
    setup: fixture({ 'aps-core': [1], sqlite: [1, 2, 17] }),
    args: ['scaffold', '--slug', 'mixed', '--dialect', 'sqlite'],
  },
  'scaffold: 기존 번호를 건너뛰고 채번': { setup: fixture({ oracle: [1, 91], sqlite: [1, 91] }), args: ['scaffold', '--slug', 'collide'] },
  'scaffold: 빈 방언 폴더에서 V1 채번': { setup: fixture({ oracle: [], sqlite: [] }), args: ['scaffold', '--slug', 'first'] },
  'scaffold: 같은 폴더를 두 번 지정하면 이미 존재(오류 2·먼저 만든 파일 남음)': {
    setup: fixture({ oracle: [1], sqlite: [1] }),
    args: ['scaffold', '--slug', 'dup', '--dialect', 'oracle,oracle'],
  },
  'scaffold: 잘못된 slug(대문자·하이픈)': { setup: fixture(ASYM), args: ['scaffold', '--slug', 'Bad-Slug'] },
  'scaffold: 한글 slug 거부': { setup: fixture(ASYM), args: ['scaffold', '--slug', '한글'] },
  'scaffold: 없는 방언 폴더': { setup: fixture({ oracle: [1], sqlite: [1] }), args: ['scaffold', '--slug', 'x', '--dialect', 'postgresql'] },
  'scaffold: slug 없음(오류 2)': { setup: fixture(ASYM), args: ['scaffold'] },
  'scaffold: 빈 slug(오류 2)': { setup: fixture(ASYM), args: ['scaffold', '--slug', ''] },
  'scaffold: 마이그레이션 폴더 없음': { setup: (root) => fs.mkdirSync(path.join(root, '.git')), args: ['scaffold', '--slug', 'x'] },
  'scaffold: mdm 중첩 경로': {
    setup: fixture({ sqlite: [1, 2, 5], oracle: [1, 2] }, MDM_REL),
    args: ['scaffold', '--module', 'mdm', '--slug', 'create_meta_rev', '--title', 'MDM 메타 변경 기록 테이블'],
  },
};

for (const [name, c] of Object.entries(cases)) {
  goldenToolTest(name, { legacy, script, ...c });
}

// argparse 와 문구가 다른 사용 오류는 종료 코드(2)만 비교한다.
const usage = {
  '사용 오류: 인자 없음': [],
  '사용 오류: 알 수 없는 명령': ['bogus'],
  '사용 오류: 알 수 없는 옵션': ['status', '--nope'],
  '사용 오류: 값이 빠진 옵션': ['status', '--module'],
  '사용 오류: 남는 위치 인자': ['status', 'extra'],
};
for (const [name, args] of Object.entries(usage)) {
  goldenToolTest(name, { legacy, script, setup: fixture(ASYM), args, statusOnly: true });
}
