package com.dongkuk.dmes.mdm.common.rule;

import java.util.Set;

/**
 * 룰 세트 저장 시 검사 한 건(TSK-08-06 design §6.3, 흐름도 계획 C4). 서버 {@link RuleSetAnalyzer#checks} 와 화면 {@code set-model.ts} 가 같은
 * 코드·문구·순서로 만든다.
 *
 * @param severity    {@link #REJECT}(저장·되살리기 거부) 또는 {@link #WARN}
 * @param ruleId      검사가 걸린 룰(SET 노드면 세트 ID — 하위 세트 Ruling 6). {@link #EMPTY}·구조·조건식 검사는 null
 * @param otherRuleId 상대 룰·세트 ID(ORDER·CYCLE·DUP_RESULT·IF_SIBLING·PAR_SIBLING). 그 밖은 null
 * @param varName     걸린 변수 이름(2단계 검사). 1단계·EMPTY·구조는 null
 * @param nodeId      흐름 노드 ID(룰 노드·분기 노드). 목록 입력으로 계산하면 늘 null(D8)
 * @param edgeId      흐름 선 ID(조건식·갈래 검사). 그 밖은 null
 */
public record RuleSetCheck(String code, String severity, String ruleId, String otherRuleId, String varName, String message, String nodeId,
        String edgeId) {

    public static final String REJECT = "REJECT";
    public static final String WARN = "WARN";

    public static final String EMPTY = "EMPTY";
    public static final String RULE_NOT_FOUND = "RULE_NOT_FOUND";
    public static final String RULE_DEPRECATED = "RULE_DEPRECATED";
    public static final String NO_RELEASED = "NO_RELEASED";
    public static final String ORDER = "ORDER";
    public static final String CYCLE = "CYCLE";
    public static final String UNKNOWN_INPUT = "UNKNOWN_INPUT";
    public static final String DUP_RESULT = "DUP_RESULT";
    public static final String FLOW_STRUCTURE = "FLOW_STRUCTURE";
    public static final String FLOW_IF_ELSE = "FLOW_IF_ELSE";
    public static final String FLOW_COND = "FLOW_COND";
    public static final String IF_SIBLING = "IF_SIBLING";
    public static final String PAR_SIBLING = "PAR_SIBLING";
    public static final String FLOW_PARTIAL = "FLOW_PARTIAL";
    public static final String FLOW_READONLY = "FLOW_READONLY";
    /** IF 조건식의 DICT 변수를 세트 안 어느 룰도 선언하지 않았다(WARN, 흐름도 2단계 P3). */
    public static final String COND_UNTYPED = "COND_UNTYPED";
    /** 흐름에 빈 단계(TASK) 노드가 있다(WARN, 4단계 spec §1.1). 저장·되살리기를 막지 않는다. 위치 없이 세트 단위 한 줄이다. */
    public static final String EMPTY_TASK = "EMPTY_TASK";
    /** 받는 노드 붙임·종류 오류(REJECT, 받는 노드 spec §5). 흐름 구조 검사(`FlowParser`)가 낸다. */
    public static final String FLOW_CATCH = "FLOW_CATCH";
    /** 받는 노드가 받는 종류가 그 룰에서 일어날 수 없다(WARN, 받는 노드 spec §5) — 결과 없음인데 기본 행이 있음, 판정 충돌인데 UNIQUE·ANY 가 아님. */
    public static final String CATCH_NEVER = "CATCH_NEVER";
    /**
     * SET 노드의 세트 ID 가 없거나, 기준 시각에 RELEASED 가 없거나, 폐기 세트다(하위 세트 spec §5, Ruling 8). 분석기 두 벌(서버·화면)은 WARN 으로 낸다
     * (편차 13) — DRAFT 저장은 막지 않고, 확정·되살리기 검사가 수준과 상관없이 거부로 본다.
     */
    public static final String CALL_MISSING = "CALL_MISSING";
    /** 세트 호출 그래프에 순환이 있다(하위 세트 spec §5, 서버만). DRAFT 저장은 경고, 확정·되살리기는 거부(편차 13). */
    public static final String CALL_CYCLE = "CALL_CYCLE";
    /** 세트 호출 단계가 5 를 넘는다(하위 세트 spec §5, 서버만). DRAFT 저장은 경고, 확정·되살리기는 거부(편차 13). */
    public static final String CALL_DEPTH = "CALL_DEPTH";
    /** 이 버전으로 겉모양이 바뀌어 부르는 세트에 없던 거부가 생긴다(하위 세트 spec §6, 서버만). DRAFT 저장은 경고, 확정·되살리기는 거부(편차 13). */
    public static final String CALLER_BROKEN = "CALLER_BROKEN";
    /**
     * 하위 세트 호출 네 코드(편차 13, srv:6 조정 ②). 분석기·그래프·연쇄가 내는 수준과 상관없이 확정·되살리기는 거부, DRAFT 저장은 경고로 본다 —
     * 쓰는 자리가 {@link #asReject()}·{@link #asWarn()} 로 수준을 맞춘다.
     */
    public static final Set<String> CALL_CODES = Set.of(CALL_MISSING, CALL_CYCLE, CALL_DEPTH, CALLER_BROKEN);
    /** 이 버전으로 부르는 세트에 없던 경고가 생겼다(WARN, 서버만, 하위 세트 spec §6.1-5, Ruling 10 문구 "부르는 세트에 경고가 생겼다: P1, P2"). 막지 않는다. */
    public static final String CALLER_WARN = "CALLER_WARN";

    /** 노드 위치 없는 검사(목록 입력·세트 단위 거부). */
    public RuleSetCheck(String code, String severity, String ruleId, String otherRuleId, String varName, String message) {
        this(code, severity, ruleId, otherRuleId, varName, message, null, null);
    }

    public boolean rejected() {
        return REJECT.equals(severity);
    }

    /** 같은 검사의 경고(WARN) 사본 — 위치(nodeId·edgeId)는 그대로다. DRAFT 저장이 {@link #CALL_CODES} 를 경고로 돌려줄 때 쓴다. */
    public RuleSetCheck asWarn() {
        return new RuleSetCheck(code, WARN, ruleId, otherRuleId, varName, message, nodeId, edgeId);
    }

    /** 같은 검사의 거부(REJECT) 사본 — 위치는 그대로다. 확정·되살리기가 {@link #CALL_CODES} 를 수준과 상관없이 거부로 볼 때 쓴다. */
    public RuleSetCheck asReject() {
        return new RuleSetCheck(code, REJECT, ruleId, otherRuleId, varName, message, nodeId, edgeId);
    }

    RuleSetCheck withoutLocation() {
        return new RuleSetCheck(code, severity, ruleId, otherRuleId, varName, message);
    }
}
