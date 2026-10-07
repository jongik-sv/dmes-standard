#!/usr/bin/env node
// migration_tool.mjs 자체 검증.
//
// 임시 픽스처에 방언 비대칭(일부 방언에만 있는 번호)을 심어 채번이 실제로 충돌을
// 피하는지 확인한다. 방언은 oracle·postgresql·sqlite 3개로 둔다. 실 저장소는 건드리지 않는다.
//
// 사용: node selftest.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finish, OK, VIOLATION } from '../../_shared/node/args.mjs';
import { runNode, makeTempDir } from '../../_shared/node/proc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, 'migration_tool.mjs');
const REL = 'src/backend/aps-core/src/main/resources/db/migration';

// 실 저장소에서 있었던 모양: 한 방언이 90 까지, sqlite 는 88 까지
const ASYM = { oracle: [1, 22, 88, 89, 90], postgresql: [1, 22, 88, 90], sqlite: [1, 22, 61, 88] };

function buildFixture(root, layout, rel = REL) {
  for (const [d, versions] of Object.entries(layout)) {
    const p = path.join(root, rel, d);
    fs.mkdirSync(p, { recursive: true });
    for (const v of versions) fs.writeFileSync(path.join(p, `V${v}__fixture_${v}.sql`), '-- fixture\n', 'utf8');
  }
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
}

function run(root, ...args) {
  const r = runNode(TOOL, [...args, '--root', root]);
  return [r.stdout + r.stderr, r.status];
}

const exists = (...p) => fs.existsSync(path.join(...p));

function withTemp(fn) {
  const root = makeTempDir('dmes-flyway-selftest-');
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const failures = [];
  const check = (cond, ok, fail) => {
    if (cond) console.log(`[OK] ${ok}`);
    else failures.push(fail);
  };

  // --- 1) 채번: 방언별 max 가 다를 때 합집합 기준이어야 한다 ---
  withTemp((root) => {
    buildFixture(root, ASYM);
    const [out] = run(root, 'status');
    check(out.includes('다음 안전 번호: V91'), '채번  3 방언 합집합 max+1 = V91 (sqlite max+1=89 함정 회피)', `채번 오류: V91 이 아님\n${out}`);
    check(out.includes('충돌한다'), '경고  방언별 채번 시 충돌 경고 노출', '방언별 채번 충돌 경고가 없다');
    check(out.includes('V61') && out.includes('V89'), '결번  방언별 빠진 번호 목록 노출', `빠진 번호 목록이 없다\n${out}`);
  });

  // --- 2) scaffold all: 같은 번호로 모든 방언 생성 ---
  withTemp((root) => {
    buildFixture(root, ASYM);
    const [out] = run(root, 'scaffold', '--slug', 'add_foo_column');
    const paths = Object.fromEntries(Object.keys(ASYM).map((d) => [d, path.join(root, REL, d, 'V91__add_foo_column.sql')]));
    check(Object.values(paths).every((p) => fs.existsSync(p)), '전체생성  V91 이 3 방언 모두에 생성', `scaffold all 이 전부 만들지 않았다\n${out}`);
    if (fs.existsSync(paths.oracle)) {
      const txt = fs.readFileSync(paths.oracle, 'utf8');
      check(txt.includes('postgresql/V91') && txt.includes('sqlite/V91'), '헤더    나머지 방언 대응 명시', '헤더에 나머지 방언 참조가 없다');
      check(!txt.includes('\r'), '줄끝    LF 로만 기록', '생성 파일에 CR 이 섞였다');
    }
  });

  // --- 3) scaffold 일부 방언: 결번 3 곳 등재 안내가 떠야 한다 ---
  withTemp((root) => {
    buildFixture(root, ASYM);
    const [out] = run(root, 'scaffold', '--slug', 'oracle_pg_fix', '--dialect', 'oracle,postgresql');
    const made = Object.keys(ASYM).filter((d) => exists(root, REL, d, 'V91__oracle_pg_fix.sql'));
    check(made.join(',') === 'oracle,postgresql', '일부    지정한 방언(oracle,postgresql)에만 생성', `생성 위치 오류: ${made}\n${out}`);
    const tokens = ['결번 대장', 'KNOWN_GAP_LEDGER', 'no-op', 'sqlite 의 V91'];
    check(tokens.every((t) => out.includes(t)), '안내    결번 3 곳 등재 + no-op 금지 안내 노출', `일부 방언 안내 누락\n${out}`);
  });

  // --- 4) 기존 번호 덮어쓰기 거부 ---
  withTemp((root) => {
    buildFixture(root, { oracle: [1, 91], sqlite: [1, 91] });
    const [out] = run(root, 'scaffold', '--slug', 'collide');
    check(exists(root, REL, 'oracle', 'V92__collide.sql'), '회피    기존 번호를 건너뛰고 V92 채번', `기존 V91 을 피해 V92 로 가지 않았다\n${out}`);
  });

  // --- 5) 잘못된 slug·없는 방언 거부 ---
  withTemp((root) => {
    buildFixture(root, { oracle: [1], sqlite: [1] });
    let [, code] = run(root, 'scaffold', '--slug', 'Bad-Slug');
    check(code !== 0, '검증    잘못된 slug 거부', '잘못된 slug 를 받아들였다');
    let out;
    [out, code] = run(root, 'scaffold', '--slug', 'x', '--dialect', 'postgresql');
    check(code !== 0 && out.includes('새 방언이면'), '검증    없는 방언 폴더 거부 + 생성 안내', `없는 방언을 받아들였다\n${out}`);
  });

  // --- 6) 공통 폴더만 있는 모듈: 공통 폴더에 생성 ---
  withTemp((root) => {
    buildFixture(root, { 'aps-core': [1] });
    const [out] = run(root, 'scaffold', '--slug', 'add_bar');
    check(exists(root, REL, 'aps-core', 'V2__add_bar.sql'), '공통    방언 폴더가 없으면 공통 폴더에 생성', `공통 폴더 생성 실패\n${out}`);
  });

  // --- 6b) 공통 + 방언 혼합(mcm-core 모양): all 은 거부, 명시하면 그 폴더에만 ---
  withTemp((root) => {
    buildFixture(root, { 'aps-core': [1], sqlite: [1, 2, 17] });
    let [out, code] = run(root, 'scaffold', '--slug', 'mixed');
    const made = ['aps-core', 'sqlite'].filter((d) => exists(root, REL, d, 'V18__mixed.sql'));
    check(code !== 0 && made.length === 0 && out.includes('--dialect'), '혼합    공통+방언 혼합이면 all 거부·명시 요구', `혼합 배치를 임의로 골랐다\n${out}`);
    [out, code] = run(root, 'scaffold', '--slug', 'mixed', '--dialect', 'aps-core');
    check(exists(root, REL, 'aps-core', 'V18__mixed.sql'), '혼합    명시한 공통 폴더에 합집합 번호 V18 생성', `명시 생성 실패\n${out}`);
  });

  // --- 7) api 하위 + 모듈 이름 한 단 더 (db/migration/mdm/sqlite) 해석 ---
  withTemp((root) => {
    const rel = 'src/backend/mdm/api/src/main/resources/db/migration/mdm';
    buildFixture(root, { sqlite: [1, 2, 5], oracle: [1, 2] }, rel);
    const [out] = run(root, 'status', '--module', 'mdm');
    check(out.includes('다음 안전 번호: V6') && out.includes('oracle'), '경로    api/ 하위·중첩 모듈 폴더 해석', `중첩 경로 해석 실패\n${out}`);
  });

  console.log();
  if (failures.length) {
    console.log(`자체검증 실패 ${failures.length} 건:`);
    for (const f of failures) console.log(`  - ${f}`);
    return VIOLATION;
  }
  console.log('자체검증 통과');
  return OK;
}

finish(main());
