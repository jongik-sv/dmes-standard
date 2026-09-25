package com.dongkuk.dmes.mdm.common.rule;

/**
 * 룰 세트 저장 시 검사 한 건(TSK-08-06 design §6.3). 서버 {@link RuleSetAnalyzer#checks} 와 화면 {@code set-model.ts} 가 같은 코드·문구·순서로 만든다.
 *
 * @param severity    {@link #REJECT}(저장·되살리기 거부) 또는 {@link #WARN}
 * @param ruleId      검사가 걸린 룰. {@link #EMPTY} 는 null
 * @param otherRuleId 상대 룰(ORDER·CYCLE·DUP_RESULT). 그 밖은 null
 * @param varName     걸린 변수 이름(2단계 검사). 1단계·EMPTY 는 null
 */
public record RuleSetCheck(String code, String severity, String ruleId, String otherRuleId, String varName, String message) {

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

    public boolean rejected() {
        return REJECT.equals(severity);
    }
}
