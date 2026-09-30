package kr.dongkuk.maru.mdm.engine.rule;

import com.ezylang.evalex.data.EvaluationValue;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;

/**
 * IF 갈래 조건식 판정(룰 세트 흐름도 spec §4 "조건식 평가", plan C5). {@code RuleEvaluator.test} 와 같은 값 맵(ctx + EVAL_TS)·
 * 같은 평가 경로({@link ExpressionRunner#run})·같은 NULL 규칙을 쓴다. 이 패키지에는 record·enum 을 두지 않는다
 * (EngineContractSchemaTest) — 결과는 정수 상수다.
 *
 * <p>조건식 변수는 세트 안 룰이 선언한 타입({@link FlowKeys#condTypes})으로 바꾼 사본 값으로 평가한다 — 룰 입력이
 * {@code ValueConverter.toDeclared} 로 계약 타입을 맞추는 것과 같은 변환기다. ctx 는 바꾸지 않는다.
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

    /**
     * @param types 조건식 변수의 선언 타입({@link FlowKeys#condTypes}). ctx 키와는 대소문자를 가리지 않고 맞춘다. 없는 변수는 ctx 값 그대로
     */
    static BranchCondition test(ExpressionRunner runner, String text, Map<String, Object> ctx, Map<String, DataType> types,
            Instant evalTs) {
        Map<String, Object> values = new LinkedHashMap<>(ctx);
        for (Map.Entry<String, DataType> t : types.entrySet()) {
            String key = keyIgnoringCase(values, t.getKey());
            if (key == null) {
                continue;
            }
            try {
                values.put(key, ValueConverter.toDeclared(values.get(key), t.getValue()));
            } catch (IllegalArgumentException e) {
                return new BranchCondition(ERROR, "식 '" + text + "' 변수 " + t.getKey() + " 타입 변환 오류: " + e.getMessage());
            }
        }
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

    /**
     * 값 맵에서 대소문자를 무시하고 같은 이름의 키(EvalEx 변수 조회와 같은 규칙). 바꾼 값은 이 키 자리에 다시 넣어 대소문자만 다른
     * 키가 둘 생기지 않게 한다 — ctx 에는 대소문자만 다른 키가 둘 이상 없다({@link RecordKeys}).
     */
    private static String keyIgnoringCase(Map<String, Object> values, String name) {
        if (values.containsKey(name)) {
            return name;
        }
        for (String k : values.keySet()) {
            if (k.equalsIgnoreCase(name)) {
                return k;
            }
        }
        return null;
    }
}
