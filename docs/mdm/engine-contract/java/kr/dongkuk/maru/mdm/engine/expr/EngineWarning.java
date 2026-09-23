package kr.dongkuk.maru.mdm.engine.expr;

/**
 * 판정을 멈추지 않는 경고(06-business-rule.md:200·425·427).
 *
 * @param ruleId 룰 판정이면 룰 ID, 도메인 검증이면 null
 * @param rowId  행이 정해진 경고면 row_id
 * @param varId  열이 정해진 경고면 var_id
 */
public record EngineWarning(Code code, String ruleId, Integer rowId, Integer varId, String message) {

    public enum Code {
        /** Expression 조건 셀 결과가 NULL — 그 셀만 거짓으로 봤다. */
        EXPR_CELL_NULL,
        /** 결과 열 그룹 열 조건 결과가 NULL — 그 열만 거짓으로 봤다. */
        GRP_COND_NULL
    }
}
