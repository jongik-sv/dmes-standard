package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.Expression;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.functions.AbstractFunction;
import com.ezylang.evalex.functions.FunctionParameter;
import com.ezylang.evalex.parser.Token;
import java.math.BigDecimal;

/**
 * {@code INSTR(s, sub)} — 대소문자를 구분하고 위치는 1부터 센다. 없으면 0, 인자가 NULL 이면 NULL(06:443, EG:215).
 * 위치는 UTF-16 코드 단위다. 표준 {@code STR_CONTAINS} 는 대소문자를 무시하므로 대신 쓰지 않는다.
 */
@FunctionParameter(name = "s")
@FunctionParameter(name = "sub")
final class InstrFunction extends AbstractFunction {

    @Override
    public EvaluationValue evaluate(Expression expression, Token functionToken, EvaluationValue... parameters) {
        EvaluationValue s = parameters[0];
        EvaluationValue sub = parameters[1];
        if (s.isNullValue() || sub.isNullValue()) {
            return EvaluationValue.NULL_VALUE;
        }
        return EvaluationValue.numberValue(BigDecimal.valueOf(s.getStringValue().indexOf(sub.getStringValue()) + 1L));
    }
}
