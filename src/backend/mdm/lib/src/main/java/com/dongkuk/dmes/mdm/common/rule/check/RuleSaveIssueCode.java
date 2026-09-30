package com.dongkuk.dmes.mdm.common.rule.check;

/**
 * 저장 시 검사 이슈 코드(TSK-08-04 design §6.2). 분석기 코드({@code RuleIssueCode})와 이름이 겹치지 않는다 — 화면 {@code sameIssues} 는
 * 분석기 코드만 견준다(I26).
 */
public enum RuleSaveIssueCode {
    LIMIT_EXCEEDED,
    TYPE_LITERAL,
    OP_NOT_ALLOWED,
    RANGE_OP_PLACE,
    RANGE_IN_EXPR,
    BOUND_EMPTY,
    BOUND_EQUAL,
    BOUND_ORDER,
    LIST_EMPTY,
    LIST_TOO_LONG,
    PATTERN_NOT_STRING,
    PATTERN_ONLY_PERCENT,
    PATTERN_TOO_MANY_PERCENT,
    PATTERN_TOO_LONG,
    PATTERN_DATE_WILDCARD,
    TEXT_EMPTY,
    TEXT_TOO_LONG,
    TEXT_DATE_DOMAIN,
    INCOMPLETE_COND,
    INCOMPLETE_RESULT,
    GENERATE_FAILED,
    EXPR_PARSE,
    /** {@code ExpressionChecker} 의 문제(함수·예약 변수·MASTER 인자·정규식). 종류는 message 앞에 적는다. */
    EXPR_PROBLEM,
    EXPR_UNKNOWN_VAR,
    EXPR_DERIVE_ORDER,
    /** 분석기가 예외를 던졌다(design §7.12) — 조용히 통과시키지 않고 저장을 막는다. */
    ANALYSIS_FAILED,
    MASTER_TARGET_MISSING,
    MASTER_CATE_MISSING,
    MASTER_ATTR_LABEL_MISSING,
    CODE_VALUE_MISSING,
    CODE_CATE_MISSING,
    DOMAIN_RANGE,
    REQUIRED_NULL_CHECK,
    SET_ORDER,
    SET_CYCLE,
    SET_DUP_RESULT,
    SET_IF_SIBLING,
    SET_PAR_SIBLING,
    CONTRACT_CHANGED,
    EXPR_TYPE_BY_CASE
}
