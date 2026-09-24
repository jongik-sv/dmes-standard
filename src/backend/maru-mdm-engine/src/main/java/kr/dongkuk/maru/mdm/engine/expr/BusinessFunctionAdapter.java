package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.EvaluationException;
import com.ezylang.evalex.Expression;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.functions.FunctionIfc;
import com.ezylang.evalex.functions.FunctionParameterDefinition;
import com.ezylang.evalex.parser.Token;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.BusinessFunction;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider.Param;

/**
 * {@link BusinessFunction} → EvalEx 함수(engine-contract §5 적재 규칙 2-4). 인자 수가 실행 시에 정해지므로
 * {@code AbstractFunction} 주석 대신 {@link FunctionParameterDefinition} 빌더로 인자를 선언한다(F12).
 *
 * <p>인자는 평가된 값만 받는다(지연 인자 없음). NUMBER → BigDecimal, STRING → String, BOOLEAN → Boolean, NULL → null.
 * {@code nullable=false} 자리에 NULL 이 오면 본문을 부르지 않는다. 허용 밖 반환·본문 예외는 평가 오류다.
 */
final class BusinessFunctionAdapter implements FunctionIfc {

    private final BusinessFunction function;
    private final List<FunctionParameterDefinition> definitions;

    BusinessFunctionAdapter(BusinessFunction function) {
        this.function = function;
        List<FunctionParameterDefinition> defs = new ArrayList<>();
        List<Param> params = function.params();
        for (int i = 0; i < params.size(); i++) {
            defs.add(FunctionParameterDefinition.builder()
                    .name(params.get(i).name())
                    .isVarArg(function.varArgs() && i == params.size() - 1)
                    .build());
        }
        this.definitions = List.copyOf(defs);
    }

    @Override
    public List<FunctionParameterDefinition> getFunctionParameterDefinitions() {
        return definitions;
    }

    @Override
    public boolean hasVarArgs() {
        return function.varArgs();
    }

    @Override
    public void validatePreEvaluation(Token token, EvaluationValue... parameterValues) {
        // 값 제약(nonZero·nonNegative)은 두지 않는다. NULL 검사는 evaluate 가 본문을 부르기 전에 한다.
    }

    @Override
    public EvaluationValue evaluate(Expression expression, Token token, EvaluationValue... parameters)
            throws EvaluationException {
        List<Param> params = function.params();
        // 인자는 null 을 담을 수 있어 List.copyOf 대신 수정 불가 목록으로 감싸 넘긴다.
        List<Object> args = new ArrayList<>(parameters.length);
        for (int i = 0; i < parameters.length; i++) {
            Param param = params.get(Math.min(i, params.size() - 1));
            Object arg = toJava(token, parameters[i]);
            if (arg == null && !param.nullable()) {
                throw new EvaluationException(token, function.name() + " 의 인자 " + param.name() + " 가 NULL 이다");
            }
            args.add(arg);
        }
        Object result;
        try {
            result = function.body().apply(Collections.unmodifiableList(args));
        } catch (RuntimeException e) {
            throw new EvaluationException(token, function.name() + " 본문 예외: " + e);
        }
        return toEvalEx(token, result);
    }

    private Object toJava(Token token, EvaluationValue value) throws EvaluationException {
        if (value.isNullValue()) {
            return null;
        }
        if (value.isNumberValue()) {
            return value.getNumberValue();
        }
        if (value.isStringValue()) {
            return value.getStringValue();
        }
        if (value.isBooleanValue()) {
            return value.getBooleanValue();
        }
        throw new EvaluationException(token, function.name() + " 는 " + value.getDataType() + " 인자를 받지 않는다");
    }

    private EvaluationValue toEvalEx(Token token, Object result) throws EvaluationException {
        if (result == null) {
            return EvaluationValue.NULL_VALUE;
        }
        if (result instanceof BigDecimal d) {
            return EvaluationValue.numberValue(d);
        }
        if (result instanceof String s) {
            return EvaluationValue.stringValue(s);
        }
        if (result instanceof Boolean b) {
            return EvaluationValue.booleanValue(b);
        }
        throw new EvaluationException(token, function.name() + " 가 허용 밖 타입을 돌려줬다: " + result.getClass().getName());
    }
}
