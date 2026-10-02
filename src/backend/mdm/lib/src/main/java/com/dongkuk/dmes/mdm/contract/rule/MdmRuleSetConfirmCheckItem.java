package com.dongkuk.dmes.mdm.contract.rule;

/**
 * 룰 세트 확정 검사 항목(D-144 2단계, 스펙 §6). {@code MdmCheckIssue.field} 에 이 항목 이름({@code name()})을 담는다.
 * apply_from 순서는 공통 서비스({@code ApplyFromOrderCheck})가 본다.
 */
public enum MdmRuleSetConfirmCheckItem {
    /** 흐름 구조 — 세트 저장 시 검사(RuleSetAnalyzer) 가운데 순서·순환·RELEASED 없음 밖의 항목. */
    FLOW_STRUCTURE,
    /** 흐름의 룰마다 apply_from 시점에 RELEASED 버전이 있다. */
    RULES_RELEASED,
    /** apply_from 시점 룰 버전들로 본 순서·순환·형제 읽기. */
    ORDER,
    /** 기대값이 있는 테스트 케이스 전부 통과, 실행 실패 없음. */
    TEST_CASES
}
