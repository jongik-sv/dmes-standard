package com.dongkuk.dmes.mdm.common.rule.check;

/**
 * 저장 시 검사의 적용 지점(TSK-08-04 design §6.1). 검사마다 어느 지점에서 도는지는 §6.1 표가 정본이다.
 *
 * <ul>
 *   <li>{@code TABLE} — 표 저장(part TABLE)</li>
 *   <li>{@code COLUMNS} — 열 설정 원자 적용(part COLUMNS). 셀·미완성·생성·분석은 돌리지 않는다(열 추가가 가능해야 한다, I18)</li>
 *   <li>{@code TEST_BODY} — 값 테스트 본문 정의. 셀·식·생성만 돌려 깨진 행을 판정에서 뺀다</li>
 *   <li>{@code STORED} — 저장된 DRAFT 를 다시 볼 때(TSK-08-05 상신 검사)</li>
 * </ul>
 */
public enum RuleSaveTarget {
    TABLE,
    COLUMNS,
    TEST_BODY,
    STORED
}
