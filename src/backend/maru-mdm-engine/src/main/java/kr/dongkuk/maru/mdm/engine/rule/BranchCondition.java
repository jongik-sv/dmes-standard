package kr.dongkuk.maru.mdm.engine.rule;

import com.ezylang.evalex.data.EvaluationValue;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;

/**
 * IF 갈래 조건식 판정(룰 세트 흐름도 spec §4 "조건식 평가", plan C5). {@code RuleEvaluator.test} 와 같은 값 맵(ctx + EVAL_TS)·
 * 같은 평가 경로({@link ExpressionRunner#run})·같은 NULL 규칙을 쓴다. 이 패키지에는 record·enum 을 두지 않는다
 * (EngineContractSchemaTest) — 결과는 정수 상수다.
 */
final class BranchCondition {

    static final int FALSE = 0;
    static final int TRUE = 1;
    static final int NULL = 2;
    static final int ERROR = -1;

    final int outcome;
    /** ERROR 일 때 원인 문구. 그 밖은 null. */
    final String message;

    private BranchCondition(int outcome, String message) {
        this.outcome = outcome;
        this.message = message;
    }

    static BranchCondition test(ExpressionRunner runner, String text, Map<String, Object> ctx, Instant evalTs) {
        Map<String, Object> values = new LinkedHashMap<>(ctx);
        values.put(ReservedNames.EVAL_TS, evalTs);
        EvaluationValue v;
        try {
            v = runner.run(text, values, evalTs);
        } catch (ExpressionFailure f) {
            return new BranchCondition(ERROR, "식 '" + text + "' 평가 오류: " + f.getMessage());
        }
        if (v.isNullValue()) {
            return new BranchCondition(NULL, null);
        }
        if (!v.isBooleanValue()) {
            return new BranchCondition(ERROR, "식 '" + text + "' 결과가 불린이 아니다: " + v.getDataType());
        }
        return new BranchCondition(v.getBooleanValue() ? TRUE : FALSE, null);
    }
}
