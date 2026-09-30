package com.dongkuk.dmes.mdm.common.rule;

/**
 * 룰 세트 저장 시 검사 한 건(TSK-08-06 design §6.3, 흐름도 계획 C4). 서버 {@link RuleSetAnalyzer#checks} 와 화면 {@code set-model.ts} 가 같은
 * 코드·문구·순서로 만든다.
 *
 * @param severity    {@link #REJECT}(저장·되살리기 거부) 또는 {@link #WARN}
 * @param ruleId      검사가 걸린 룰. {@link #EMPTY}·구조·조건식 검사는 null
 * @param otherRuleId 상대 룰(ORDER·CYCLE·DUP_RESULT·IF_SIBLING·PAR_SIBLING). 그 밖은 null
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

    /** 노드 위치 없는 검사(목록 입력·세트 단위 거부). */
    public RuleSetCheck(String code, String severity, String ruleId, String otherRuleId, String varName, String message) {
        this(code, severity, ruleId, otherRuleId, varName, message, null, null);
    }

    public boolean rejected() {
        return REJECT.equals(severity);
    }

    RuleSetCheck withoutLocation() {
        return new RuleSetCheck(code, severity, ruleId, otherRuleId, varName, message);
    }
}
