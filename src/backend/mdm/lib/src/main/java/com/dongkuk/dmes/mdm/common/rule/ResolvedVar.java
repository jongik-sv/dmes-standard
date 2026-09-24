package com.dongkuk.dmes.mdm.common.rule;

/**
 * 서버가 해석한 룰 변수 — {@code view}·저장 응답으로 화면에 넘기고 두 분석기의 입력이 된다(TSK-08-02 design §6.4, D13).
 * 칼럼 이름·순서는 08-03·08-04 가 그대로 쓰도록 고정한다(design §6.6.3).
 *
 * @param dispType   06 표기({@code Equal}·{@code 1}·{@code 2}·{@code Expression}·{@code Value})
 * @param varName    이름 변수면 이름, 식 변수면 식 텍스트(저장 값 그대로)
 * @param exprVar    식 변수인가({@code VAR_AST} 가 있다)
 * @param dataType   BOOLEAN·NUMBER·STRING·DATE. 해석하지 못하면 STRING
 * @param dateString 일자 String 도메인(종류 DATE·데이터 타입 STRING·길이 4·6·8)
 * @param typeSource COLUMN·RULE_RESULT·DECLARED·EXPRESSION_COLUMN·UNRESOLVED
 */
public record ResolvedVar(
        int varId,
        String varKind,
        String dispType,
        int seq,
        String varName,
        boolean exprVar,
        String label,
        String dataType,
        Integer scale,
        boolean dateString,
        String maruCodeId,
        Long domainId,
        String domainName,
        String typeSource,
        String description) {
}
