#!/usr/bin/env node
// adr_tool.mjs 자체 검증.
//
// 린트가 "통과" 를 낼 때 그게 규약을 지켜서인지 검사기가 고장나서인지 구분되어야 한다.
// 규약 위반을 하나씩 심은 임시 픽스처로 탐지를 확인한다(RED-first).
// 실 저장소는 건드리지 않는다.
//
// 사용: node selftest.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finish, OK, VIOLATION } from '../../_shared/node/args.mjs';
import { runNode, makeTempDir } from '../../_shared/node/proc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, 'adr_tool.mjs');

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

function writeAdr(root, module, name, body) {
  const d = path.join(root, 'docs', module, 'design', 'adr');
  fs.mkdirSync(d, { recursive: true });
  const p = path.join(d, name);
  fs.writeFileSync(p, body, 'utf8');
  return p;
}

function run(root, ...args) {
  const r = runNode(TOOL, [...args, '--root', root]);
  return [r.stdout + r.stderr, r.status];
}

/** 임시 저장소 루트(.git 포함)를 만들어 fn 에 넘기고 끝나면 지운다. */
function withRepo(fn) {
  const root = makeTempDir('dmes-adr-selftest-');
  try {
    fs.mkdirSync(path.join(root, '.git'));
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const failures = [];

  // --- GREEN: 규약을 지킨 ADR 은 통과해야 한다 (오탐 확인) ---
  withRepo((root) => {
    const p = writeAdr(root, 'mls', '0007-example.md', GOOD);
    const [out, code] = run(root, 'lint', p);
    if (code !== 0) failures.push(`GREEN 실패: 규약 준수 ADR 이 통과하지 못함\n${out}`);
    else console.log('[OK] GREEN  규약 준수 ADR 통과');
  });

  // --- RED: 위반을 하나씩 심어 탐지 확인 ---
  const mutations = [
    [
      'Status 에 산문',
      (t) => t.replace('- **Status**: ACCEPTED', '- **Status**: ✅ ACCEPTED (2026-07-14 확정, 구현 D1~D6 완료, 회귀 2534/0)'),
      'Status 가 enum 이 아니다',
    ],
    [
      '쉬운 설명 절 누락',
      (t) => t.replace(/## 쉬운 설명 \(현업용 요약\)[\s\S]*?(?=## Context)/, ''),
      '필수 절 누락: ## 쉬운 설명',
    ],
    [
      'Alternatives 절 누락',
      (t) => t.replace(/## Alternatives Considered \(대안\)[\s\S]*?(?=## References)/, ''),
      '필수 절 누락: ## Alternatives Considered',
    ],
    ['제목 번호 불일치', (t) => t.replace('# ADR-0007:', '# ADR-0009:'), '제목의 번호'],
    [
      'PROPOSED 인데 Trigger 없음',
      (t) => t.replace('- **Status**: ACCEPTED', '- **Status**: PROPOSED'),
      'PROPOSED 인데 Trigger 절이 없다',
    ],
  ];

  for (const [label, mutate, expect] of mutations) {
    withRepo((root) => {
      const p = writeAdr(root, 'mls', '0007-example.md', mutate(GOOD));
      const [out, code] = run(root, 'lint', p);
      if (!out.includes(expect)) failures.push(`RED 실패: ${label} 미탐지\n${out}`);
      else if (code === 0) failures.push(`RED 실패: ${label} 탐지했으나 exit 0`);
      else console.log(`[OK] RED    ${label}`);
    });
  }

  // --- 쉬운 설명에 구현 용어가 섞이면 경고 ---
  withRepo((root) => {
    const bad = GOOD.replace('먼저 요청한 쪽이', '`InventoryClaimService` 가');
    const p = writeAdr(root, 'mls', '0007-example.md', bad);
    const [out] = run(root, 'lint', p);
    if (!out.includes('구현 용어 금지')) failures.push(`쉬운 설명의 클래스명 경고 미탐지\n${out}`);
    else console.log('[OK] WARN   쉬운 설명의 구현 용어 경고');
  });

  // --- CRLF 로 저장된 ADR 도 같은 결과여야 한다(윈도우 편집기 대응) ---
  withRepo((root) => {
    const p = writeAdr(root, 'mls', '0007-example.md', GOOD.replace(/\n/g, '\r\n'));
    const [out, code] = run(root, 'lint', p);
    if (code !== 0) failures.push(`CRLF 실패: CRLF 로 저장된 규약 준수 ADR 이 통과하지 못함\n${out}`);
    else console.log('[OK] CRLF   CRLF 저장본도 통과');
  });

  // --- 채번: 모듈별 독립 시퀀스 ---
  withRepo((root) => {
    writeAdr(root, 'mls', '0001-a.md', GOOD);
    writeAdr(root, 'mls', '0002-b.md', GOOD);
    writeAdr(root, 'mcm', '0001-c.md', GOOD);
    let [out] = run(root, 'status', '--module', 'mls');
    if (!out.includes('다음 번호: 0003')) failures.push(`mls 채번 오류\n${out}`);
    else console.log('[OK] 채번    mls 다음 번호 0003');
    [out] = run(root, 'status', '--module', 'mcm');
    if (!out.includes('다음 번호: 0002')) failures.push(`mcm 채번 오류 — 모듈 독립이어야 한다\n${out}`);
    else console.log('[OK] 채번    mcm 다음 번호 0002 (mls 와 독립)');
  });

  // --- new: 스캐폴딩이 린트를 통과하는 뼈대를 만드는가 ---
  withRepo((root) => {
    const [out] = run(root, 'new', '--module', 'mqc', '--slug', 'sample-decision', '--title', '샘플');
    const created = path.join(root, 'docs', 'mqc', 'design', 'adr', '0001-sample-decision.md');
    if (!fs.existsSync(created)) {
      failures.push(`new 가 파일을 만들지 않았다\n${out}`);
    } else {
      console.log('[OK] 생성    new 가 0001 파일 생성');
      const t = fs.readFileSync(created, 'utf8');
      const missing = ['## 쉬운 설명 (현업용 요약)', '## Context (배경)', '## Decision (결정)', '## References'].filter((h) => !t.includes(h));
      if (missing.length) failures.push(`스캐폴딩에 필수 절 누락: ${missing}`);
      else console.log('[OK] 뼈대    스캐폴딩에 필수 절 포함');
      if (!t.includes('## Trigger')) failures.push('PROPOSED 기본인데 Trigger 절이 없다');
      else console.log('[OK] 뼈대    PROPOSED 기본 → Trigger 절 포함');
      if (t.includes('\r')) failures.push('스캐폴딩 파일에 CR 이 섞였다(LF 로만 써야 한다)');
      else console.log('[OK] 줄끝    LF 로만 기록');
    }
  });

  // --- new --status ACCEPTED 는 Trigger 절을 빼야 한다 ---
  withRepo((root) => {
    run(root, 'new', '--module', 'mqc', '--slug', 'accepted-one', '--status', 'ACCEPTED');
    const t = fs.readFileSync(path.join(root, 'docs', 'mqc', 'design', 'adr', '0001-accepted-one.md'), 'utf8');
    if (t.includes('## Trigger')) failures.push('ACCEPTED 인데 Trigger 절이 남아 있다');
    else console.log('[OK] 뼈대    ACCEPTED → Trigger 절 제거');
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
