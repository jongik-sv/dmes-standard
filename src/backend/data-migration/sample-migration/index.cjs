#!/usr/bin/env node
/**
 * 데이터 이관 스크립트 표준 형태 예시.
 *
 *   읽기(source) → 변환(transform) → 멱등 쓰기(target)
 *
 * 세 단계를 항상 분리한다. 분리해 두면 변환 규칙만 단위로 검증할 수 있고,
 * 중단 후 재실행해도 같은 결과가 나오도록 쓰기 단계만 멱등하게 만들면 된다.
 */

// ---------------------------------------------------------------- 1. 읽기
function readSource() {
  // 실제로는 여기서 소스 DB/엑셀을 읽습니다.
  // 예) mssql 커넥션으로 SELECT, 또는 xlsx 파서로 시트 파싱.
  return [
    { ITEM_CD: 'A-001', ITEM_NM: '  샘플 품목 A ', USE_YN: 'Y', QTY: '10.5' },
    { ITEM_CD: 'A-002', ITEM_NM: '샘플 품목 B', USE_YN: 'N', QTY: '0' },
    { ITEM_CD: '', ITEM_NM: '코드 없는 행', USE_YN: 'Y', QTY: '3' },
  ];
}

// ---------------------------------------------------------------- 2. 변환
/**
 * 레거시 컬럼명·코드 체계를 신규 도메인 모델로 옮긴다.
 * 이관할 수 없는 행은 예외를 던지지 말고 걸러내고 사유를 남긴다.
 * (수십만 행 중 한 행 때문에 전체가 멈추면 재실행 비용이 커진다.)
 */
function transform(sourceRows) {
  const items = [];
  const skipped = [];

  for (const row of sourceRows) {
    const itemCode = (row.ITEM_CD || '').trim();
    if (!itemCode) {
      skipped.push({ row, reason: '품목코드 없음' });
      continue;
    }

    items.push({
      itemCode,
      itemName: (row.ITEM_NM || '').trim(),
      active: row.USE_YN === 'Y',
      qty: Number(row.QTY ?? 0),
    });
  }

  return { items, skipped };
}

// ---------------------------------------------------------------- 3. 쓰기
/**
 * 멱등 쓰기. 자연키(itemCode) 기준 upsert 라서 몇 번을 다시 돌려도 결과가 같다.
 * INSERT 만 하는 스크립트는 재실행 시 중복이 쌓이므로 금지한다.
 */
function writeTarget(items) {
  for (const item of items) {
    // 실제로는 여기서 대상 DB에 upsert 합니다.
    // 예) INSERT INTO sample_inventory_item (...) VALUES (...)
    //     ON CONFLICT (item_code) DO UPDATE SET ...
    console.log('[upsert]', JSON.stringify(item));
  }
  return items.length;
}

// ------------------------------------------------------------------ 실행
function main() {
  const sourceRows = readSource();
  console.log(`[read] 소스 ${sourceRows.length} 건`);

  const { items, skipped } = transform(sourceRows);
  for (const { row, reason } of skipped) {
    console.warn(`[skip] ${reason}: ${JSON.stringify(row)}`);
  }

  const written = writeTarget(items);
  console.log(`[done] 이관 ${written} 건 / 제외 ${skipped.length} 건`);
}

main();
