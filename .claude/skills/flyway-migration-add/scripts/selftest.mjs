#!/usr/bin/env node
// migration_tool.mjs 자체 검증 (Oracle 하나 기준).
//
// 임시 픽스처로 저장소에 실제 있는 위치 모양을 흉내 낸다: mcm-core(oracle/<스키마>/), mdm(<모듈>/oracle/ + 옛 sqlite),
// caravan-hub(<스키마>/), aps-core(모듈 이름 폴더 + 옛 sqlite 체인). 실 저장소는 건드리지 않는다.
//
// 사용: node selftest.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finish, OK, VIOLATION } from '../../_shared/node/args.mjs';
import { runNode, makeTempDir } from '../../_shared/node/proc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, 'migration_tool.mjs');
const MIG = (module, api = false) => `src/backend/${module}/${api ? 'api/' : ''}src/main/resources/db/migration`;

/** layout: {폴더 상대 경로: [버전 | {name, text}]} */
function build(root, rel, layout) {
  for (const [dir, items] of Object.entries(layout)) {
    const p = path.join(root, rel, dir);
    fs.mkdirSync(p, { recursive: true });
    for (const it of items) {
      const f = typeof it === 'number' ? { name: `V${it}__fixture_${it}.sql`, text: '-- fixture\n' } : it;
      fs.writeFileSync(path.join(p, f.name), f.text, 'utf8');
    }
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

  // --- 1) mcm-core 모양: 스키마 폴더 4개. 위치가 여러 개면 --location 을 요구하고, 번호는 그 위치 안에서만 센다 ---
  withTemp((root) => {
    const rel = MIG('mcm-core');
    build(root, rel, { 'oracle/mcmapuser': [1, 2, 3], 'oracle/mcaapuser': [1], 'oracle/mcm_source': [1], 'oracle/mcm_backup': [1] });
    const [st] = run(root, 'status', '--module', 'mcm-core');
    check(st.includes('최대 V3, 다음 V4') && st.includes('[MCMAPUSER]') && st.includes('[MCAAPUSER]'), '상태    스키마별 최대·다음 번호와 스키마 이름 표시', `status 표시 오류\n${st}`);
    let [out, code] = run(root, 'scaffold', '--module', 'mcm-core', '--slug', 'add_col');
    check(code !== 0 && out.includes('--location'), '위치    여러 위치면 --location 요구', `위치를 임의로 골랐다\n${out}`);
    [out, code] = run(root, 'scaffold', '--module', 'mcm-core', '--slug', 'add_col', '--location', 'mcaapuser');
    check(exists(root, rel, 'oracle/mcaapuser', 'V2__add_col.sql') && !exists(root, rel, 'oracle/mcmapuser', 'V4__add_col.sql'),
      '채번    위치별 번호(mcaapuser V2, 다른 위치의 V4 가 아님)', `위치별 채번 실패\n${out}`);
    if (exists(root, rel, 'oracle/mcaapuser', 'V2__add_col.sql')) {
      const txt = fs.readFileSync(path.join(root, rel, 'oracle/mcaapuser', 'V2__add_col.sql'), 'utf8');
      check(txt.includes('MCAAPUSER') && txt.includes('ORA-00904') && txt.includes('체크섬'), '헤더    스키마·Oracle 규약·V1 불변 안내', `헤더 내용 누락\n${txt}`);
      check(!txt.includes('\r'), '줄끝    LF 로만 기록', '생성 파일에 CR 이 섞였다');
    }
    [out, code] = run(root, 'scaffold', '--module', 'mcm-core', '--slug', 'x', '--location', 'nosuch');
    check(code !== 0 && out.includes('nosuch'), '검증    없는 위치 거부', `없는 위치를 받아들였다\n${out}`);
  });

  // --- 2) mdm 모양: <모듈>/oracle/ 하나 + 옛 sqlite 체인(무시). 위치가 하나면 --location 생략 ---
  withTemp((root) => {
    const rel = MIG('mdm', true);
    build(root, rel, { 'mdm/oracle': [1], 'mdm/sqlite': [1, 2, 23] });
    const [st] = run(root, 'status', '--module', 'mdm');
    check(st.includes('다음 V2') && st.includes('옛 방언 폴더'), '상태    옛 sqlite 폴더는 무시하고 경고만(채번에 쓰지 않음)', `옛 방언 처리 오류\n${st}`);
    const [out] = run(root, 'scaffold', '--module', 'mdm', '--slug', 'add_idx');
    check(exists(root, rel, 'mdm/oracle', 'V2__add_idx.sql') && !exists(root, rel, 'mdm/sqlite', 'V24__add_idx.sql'), '채번    mdm/oracle 에 V2(sqlite V24 가 아님)', `mdm 채번 실패\n${out}`);
  });

  // --- 3) caravan-hub 모양: 방언 폴더 없이 스키마 사용자 폴더 둘 ---
  withTemp((root) => {
    const rel = MIG('caravan-hub');
    build(root, rel, { caravanuser: [1], ifuser: [1, 2] });
    let [, code] = run(root, 'scaffold', '--module', 'caravan-hub', '--slug', 'a');
    check(code !== 0, '위치    스키마 폴더 둘이면 --location 요구', 'caravan 위치를 임의로 골랐다');
    const [out] = run(root, 'scaffold', '--module', 'caravan-hub', '--slug', 'a', '--location', 'ifuser');
    check(exists(root, rel, 'ifuser', 'V3__a.sql'), '채번    ifuser 위치의 다음 번호 V3', `ifuser 채번 실패\n${out}`);
  });

  // --- 4) aps-core 모양: 모듈 이름 폴더 + 옛 SQLite 체인 폴더 ---
  withTemp((root) => {
    const rel = MIG('aps-core');
    build(root, rel, { 'aps-core': [1], sqlite: [1, 2, 3] });
    const [out] = run(root, 'scaffold', '--module', 'aps-core', '--slug', 'add_bar', '--dialect', 'oracle');
    check(exists(root, rel, 'aps-core', 'V2__add_bar.sql'), '채번    모듈 이름 폴더에 V2, --dialect oracle 은 받는다', `모듈 이름 폴더 채번 실패\n${out}`);
  });
  withTemp((root) => {
    const rel = MIG('mls', true);
    build(root, rel, { mls: [{ name: 'V1__init.sql', text: 'create table T (id integer primary key autoincrement);\n' }, 2, 3] });
    const [out, code] = run(root, 'scaffold', '--module', 'mls', '--slug', 'x');
    check(code !== 0 && !exists(root, rel, 'mls', 'V4__x.sql'), '무시    SQLite 문법 체인 폴더(AUTOINCREMENT)는 Oracle 위치가 아니다', `옛 SQLite 체인을 Oracle 위치로 봤다\n${out}`);
  });

  // --- 5) 입력 검증 ---
  withTemp((root) => {
    build(root, MIG('aps-core'), { 'aps-core': [1] });
    let [, code] = run(root, 'scaffold', '--slug', 'Bad-Slug');
    check(code !== 0, '검증    잘못된 slug 거부', '잘못된 slug 를 받아들였다');
    let out;
    [out, code] = run(root, 'scaffold', '--slug', 'x', '--dialect', 'sqlite');
    check(code !== 0 && out.includes('Oracle 하나'), '검증    oracle 이외 방언 거부', `다른 방언을 받아들였다\n${out}`);
    [out, code] = run(root, 'status', '--module', 'nosuch');
    check(code !== 0, '검증    없는 모듈은 사용 오류', '없는 모듈을 받아들였다');
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
