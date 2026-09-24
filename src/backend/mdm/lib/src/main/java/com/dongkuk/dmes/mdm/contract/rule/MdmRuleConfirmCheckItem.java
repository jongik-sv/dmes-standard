package com.dongkuk.dmes.mdm.contract.rule;

/**
 * 06 확정 검사 항목 — 구현 TSK-08-05 의 {@code check()} 가 모두 돈다(wbs TSK-08-05, PRD FR-E4, TSK-08-01 design.md D10).
 *
 * <p>apply_from 순서는 공통 서비스({@code ApplyFromOrderCheck})가, 룰 참조 검사(배포 대상 기준)는 이번 범위에서 하지 않는다.
 * {@code MdmCheckIssue.field} 에는 이 항목 이름({@code name()})을 담는다.
 */
public enum MdmRuleConfirmCheckItem {
    /** 06 「저장 시 검사」 전부. */
    SAVE_CHECKS,
    /** 변수와 행이 하나 이상(06:900·1131). */
    NOT_EMPTY,
    /** 기대값이 있는 테스트 케이스 전부 통과(06:1132). */
    TEST_CASES,
    /** 조건 변수가 다른 룰의 결과 변수면 그 룰에 RELEASED 버전이 있다(06:1134). */
    RESULT_VAR_RELEASED
}
