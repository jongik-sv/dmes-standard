package kr.dongkuk.maru.mdm.engine.domain;

import com.ezylang.evalex.data.EvaluationValue;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionFailure;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.RecordKeys;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.expr.ValueConversionException;
import kr.dongkuk.maru.mdm.engine.expr.ValueConverter;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.ColumnDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DomainKind;

/**
 * 도메인 검증기(02 실행 순서 1-4단계 02:381-389, 06:448, TSK-03-02 design §6.9).
 * 컬럼 정의 → 레코드 예약 키 → 빈 값 정규화 → 필수 → 타입 변환 → 유효 표준식 → 유효 비즈니스식 순이고, 앞 단계가
 * 실패하면 멈춘다. 값이 틀린 것은 결과의 failures, 식 평가 오류는 {@link EngineEvaluationException} 이다.
 *
 * <p>domain 은 code 를 직접 보지 않는다(06:463). CODE 종류는 자동 생성 {@code MASTER} 식을 표준식 자리에서 평가한다.
 * 타입 변환은 룰 판정과 같은 {@link ValueConverter#convert} 한 곳이 한다(D2).
 *
 * <p>Violation 의 stage 는 enum 다섯 값이 모두 룰 단계라 레코드 키 위반은 INPUT_CHECK, 식 평가 오류는 RESULT_EVAL 로 옮긴다
 * (스키마 E6·TS 재생성으로 번지지 않게 enum 을 바꾸지 않는다).
 */
public final class DefaultDomainValidator implements DomainValidator {

    private final DefinitionLookup definitions;
    private final MdmEvaluator evaluator;

    public DefaultDomainValidator(DefinitionLookup definitions, MdmEvaluator evaluator) {
        this.definitions = Objects.requireNonNull(definitions, "definitions");
        this.evaluator = Objects.requireNonNull(evaluator, "evaluator");
    }

    @Override
    public ValidationResult validate(String table, String column, Map<String, Object> record, Instant evalTs) {
        Optional<ColumnDefinition> found = definitions.column(table, column);
        if (found.isEmpty()) {
            return fail(null, Step.NOT_DEFINED, table + "." + column + " 은 컬럼 사전에 없다");
        }
        ColumnDefinition def = found.get();
        Map<String, Object> input = record == null ? Map.of() : record;
        List<Violation> keyViolations = RecordKeys.violations(input);
        if (!keyViolations.isEmpty()) {
            throw new EngineEvaluationException(keyViolations);
        }
        Map<String, Object> ci = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        ci.putAll(input);

        // 1 빈 값 정규화 — 공백만 있는 문자열은 NULL
        Object raw = ci.get(column);
        if (raw instanceof String s && s.isBlank()) {
            raw = null;
        }
        // 2 필수 — NULL 이면 검증식을 돌리지 않는다
        if (raw == null) {
            return def.required()
                    ? fail(null, Step.REQUIRED, column + " 은 필수 입력이다")
                    : new ValidationResult(true, null, List.of());
        }
        // 3 타입 변환
        Object value;
        try {
            value = ValueConverter.convert(raw, def.dataType());
        } catch (ValueConversionException e) {
            return fail(null, Step.TYPE_CONVERSION, e.getMessage());
        }
        // 4 유효 표준식 — CODE 종류는 유효 표준식이 비어 있으면 자동 MASTER 식
        String std = def.effectiveStdExpr();
        if (std == null && def.domainKind() == DomainKind.CODE && def.codeRef() != null) {
            std = EffectiveExpressions.codeRefText(def.codeRef());
        }
        Map<String, Object> ctx = new HashMap<>();
        ctx.put(ReservedNames.DOMAIN_VALUE, value);
        if (std != null && !evalBoolean(std, ctx, evalTs)) {
            return fail(value, Step.STD_EXPR, "유효 표준식이 거짓이다: " + std);
        }
        // 5 유효 비즈니스식 — 요구 변수가 레코드에 없으면 통과가 아니라 실패(06:448). 값이 NULL 인 키는 누락이 아니다
        String biz = def.effectiveBizExpr();
        if (biz != null) {
            Set<String> need = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
            if (def.bizRequiredVars() != null) {
                need.addAll(def.bizRequiredVars());
            }
            need.addAll(EffectiveExpressions.bizRequiredVars(biz, evaluator));
            List<String> missing = need.stream().filter(n -> !ci.containsKey(n)).toList();
            if (!missing.isEmpty()) {
                return fail(value, Step.BIZ_VAR_MISSING, "비즈니스 요구 변수가 레코드에 없다: " + String.join(", ", missing));
            }
            // 요구 변수 값은 변환하지 않고 그대로 넣는다(그 변수의 타입을 이 컬럼 정의로는 알 수 없다, design D2 경계)
            need.forEach(n -> ctx.put(n, ci.get(n)));
            if (!evalBoolean(biz, ctx, evalTs)) {
                return fail(value, Step.BIZ_EXPR, "유효 비즈니스식이 거짓이다: " + biz);
            }
        }
        return new ValidationResult(true, value, List.of());
    }

    /** NULL 결과는 거짓(06 Expression 셀 규칙과 같다). 불린이 아니거나 평가 예외면 판정 오류. */
    private boolean evalBoolean(String text, Map<String, Object> ctx, Instant evalTs) {
        EvaluationValue r;
        try {
            r = evaluator.evaluate(text, ctx, evalTs);
        } catch (ExpressionFailure f) {
            throw new EngineEvaluationException(List.of(
                    new Violation(Stage.RESULT_EVAL, f.code(), null, null, f.name(), f.getMessage())));
        }
        if (r.isNullValue()) {
            return false;
        }
        if (r.isBooleanValue()) {
            return r.getBooleanValue();
        }
        throw new EngineEvaluationException(List.of(new Violation(Stage.RESULT_EVAL, Code.EVALUATION_ERROR, null, null,
                null, "검증식 결과가 불린이 아니다: " + text + " = " + r.getValue())));
    }

    private static ValidationResult fail(Object value, Step step, String message) {
        return new ValidationResult(false, value, List.of(new Failure(step, message)));
    }
}
