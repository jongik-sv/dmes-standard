package kr.dongkuk.maru.mdm.engine.rule;

import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;

/**
 * 분석 입력의 열 하나 — TS {@code RuleVarDef} 가운데 분석이 읽는 칸만 둔다(TSK-08-02 design §2.1-E·§6.6.3).
 *
 * @param varName    식 변수·Expression 조건 열이면 null
 * @param exprVar    식 변수 열인가({@code VAR_AST} 가 있다)
 * @param scale      값 빈틈 격자의 소수 자리수. null 이면 그 열 리터럴의 최대 소수 자리수를 쓴다
 * @param dateString 일자 String 도메인(1 단위 이산 값으로 본다)
 * @param maruCodeId 코드 도메인의 마루 코드. 분석은 읽지 않는다
 */
public record AnalysisVar(
        int varId,
        VarKind varKind,
        DispType dispType,
        int seq,
        String varName,
        boolean exprVar,
        DataType dataType,
        Integer scale,
        boolean dateString,
        String maruCodeId) {}
