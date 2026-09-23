package kr.dongkuk.maru.mdm.engine.rule.fixture;

import com.ezylang.evalex.EvaluationException;
import com.ezylang.evalex.Expression;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.functions.AbstractFunction;
import com.ezylang.evalex.functions.FunctionIfc;
import com.ezylang.evalex.functions.FunctionParameter;
import com.ezylang.evalex.parser.Token;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;

/**
 * 테스트 전용 {@code INSTR}·{@code MASTER}·{@code MASTER_AT}(TSK-03-03 design §6.16, D1).
 *
 * <p>이름·인자 수는 계약 {@code MdmFunction} 그대로다. 운영 구현은 TSK-03-02 몫이라, 03-02 머지 뒤 이 클래스를 지우고
 * {@code MdmExpressionConfig.create(...)} 로 바꾼다. 코드 집합은 테스트가 주입하고, MASTER 계열이 본 {@code EVAL_TS} 값을 원본
 * {@link EvaluationValue} 그대로 기록한다(E14).
 */
public final class TestFunctions {

    private final Map<String, Set<String>> codeSets = new HashMap<>();
    private final Map<String, String> attrs = new HashMap<>();
    private final List<EvaluationValue> seenEvalTs = new ArrayList<>();

    /** (마루 코드, 카테고리) 에 코드 값을 더한다. */
    public TestFunctions code(String maruCodeId, String cateId, String... keys) {
        codeSets.computeIfAbsent(maruCodeId + "|" + cateId, k -> new HashSet<>()).addAll(List.of(keys));
        return this;
    }

    /** 소속 코드의 속성 값. */
    public TestFunctions attr(String maruCodeId, String cateId, String key, String attr, String value) {
        attrs.put(maruCodeId + "|" + cateId + "|" + key + "|" + attr, value);
        return this;
    }

    /** MASTER·MASTER_AT 이 데이터 접근자에서 읽은 {@code EVAL_TS} 값(부른 순서). */
    public List<EvaluationValue> seenEvalTs() {
        return seenEvalTs;
    }

    /** 함수 사전에 넣을 이름 → 함수. */
    public Map<String, FunctionIfc> functions() {
        Map<String, FunctionIfc> m = new LinkedHashMap<>();
        m.put("INSTR", new InstrFn());
        m.put("MASTER", new MasterFn());
        m.put("MASTER_AT", new MasterAtFn());
        return m;
    }

    private EvaluationValue member(Expression expression, Token token, EvaluationValue id, EvaluationValue cate,
            EvaluationValue key, EvaluationValue attr) {
        seenEvalTs.add(expression.getDataAccessor().getData(ReservedNames.EVAL_TS));
        boolean in = !key.isNullValue()
                && codeSets.getOrDefault(id.getStringValue() + "|" + cate.getStringValue(), Set.of())
                        .contains(key.getStringValue());
        if (attr == null) {
            return in ? EvaluationValue.TRUE : EvaluationValue.FALSE;
        }
        if (!in) {
            return EvaluationValue.NULL_VALUE;
        }
        String v = attrs.get(id.getStringValue() + "|" + cate.getStringValue() + "|" + key.getStringValue() + "|"
                + attr.getStringValue());
        return v == null ? EvaluationValue.NULL_VALUE : EvaluationValue.stringValue(v);
    }

    /** INSTR(s, sub) — 대소문자 구분, 1부터, 없으면 0, 인자가 NULL 이면 NULL. */
    @FunctionParameter(name = "s")
    @FunctionParameter(name = "sub")
    public static final class InstrFn extends AbstractFunction {
        @Override
        public EvaluationValue evaluate(Expression expression, Token functionToken, EvaluationValue... p)
                throws EvaluationException {
            if (p[0].isNullValue() || p[1].isNullValue()) {
                return EvaluationValue.NULL_VALUE;
            }
            return EvaluationValue.numberValue(
                    BigDecimal.valueOf(p[0].getStringValue().indexOf(p[1].getStringValue()) + 1L));
        }
    }

    /** MASTER(id, cate, key[, attr]). */
    @FunctionParameter(name = "id")
    @FunctionParameter(name = "cate")
    @FunctionParameter(name = "key")
    @FunctionParameter(name = "attr", isVarArg = true)
    public final class MasterFn extends AbstractFunction {
        @Override
        public EvaluationValue evaluate(Expression expression, Token functionToken, EvaluationValue... p)
                throws EvaluationException {
            if (p.length > 4) {
                throw new EvaluationException(functionToken, "MASTER 인자가 너무 많다: " + p.length);
            }
            return member(expression, functionToken, p[0], p[1], p[2], p.length == 4 ? p[3] : null);
        }
    }

    /** MASTER_AT(id, cate, key, base_dt[, attr]). base_dt 는 NULL 검사만 한다. */
    @FunctionParameter(name = "id")
    @FunctionParameter(name = "cate")
    @FunctionParameter(name = "key")
    @FunctionParameter(name = "base_dt")
    @FunctionParameter(name = "attr", isVarArg = true)
    public final class MasterAtFn extends AbstractFunction {
        @Override
        public EvaluationValue evaluate(Expression expression, Token functionToken, EvaluationValue... p)
                throws EvaluationException {
            if (p.length > 5) {
                throw new EvaluationException(functionToken, "MASTER_AT 인자가 너무 많다: " + p.length);
            }
            if (p[3].isNullValue()) {
                return p.length == 5 ? EvaluationValue.NULL_VALUE : EvaluationValue.FALSE;
            }
            return member(expression, functionToken, p[0], p[1], p[2], p.length == 5 ? p[4] : null);
        }
    }

    /**
     * 부른 횟수를 세고 인자를 그대로 돌려주는 함수(I30·I31 "평가하지 않음" 단언용). 이름은 {@code FunctionSets} 와 겹치지 않게
     * 테스트가 정한다(예 {@code COUNT_CALL}).
     */
    @FunctionParameter(name = "x")
    public static final class CountingFn extends AbstractFunction {
        private int calls;

        public int calls() {
            return calls;
        }

        @Override
        public EvaluationValue evaluate(Expression expression, Token functionToken, EvaluationValue... p) {
            calls++;
            return p[0];
        }
    }
}
