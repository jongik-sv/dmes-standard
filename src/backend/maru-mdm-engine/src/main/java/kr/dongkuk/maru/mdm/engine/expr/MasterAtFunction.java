package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.EvaluationException;
import com.ezylang.evalex.Expression;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.functions.AbstractFunction;
import com.ezylang.evalex.functions.FunctionParameter;
import com.ezylang.evalex.parser.Token;

/**
 * {@code MASTER_AT(id, cate, key, base_dt[, attr])} — {@code MASTER} 와 같되 기준 시각을 넷째 인자로 받는다
 * (05:363-400, 사용자 결정 2026-09-09). base_dt 해석은 {@link MasterQuery#baseDt}.
 */
@FunctionParameter(name = "id")
@FunctionParameter(name = "cate")
@FunctionParameter(name = "key")
@FunctionParameter(name = "base_dt")
@FunctionParameter(name = "attr", isVarArg = true)
final class MasterAtFunction extends AbstractFunction {

    private final MasterQuery query;

    MasterAtFunction(MasterQuery query) {
        this.query = query;
    }

    @Override
    public EvaluationValue evaluate(Expression expression, Token functionToken, EvaluationValue... parameters)
            throws EvaluationException {
        MdmFunction shape = MdmFunction.MASTER_AT;
        if (parameters.length < shape.minArgs() || parameters.length > shape.maxArgs()) {
            throw new EvaluationException(functionToken, "MASTER_AT 인자는 " + shape.minArgs() + "-" + shape.maxArgs()
                    + "개여야 한다: " + parameters.length + "개");
        }
        return query.query(functionToken, parameters[0], parameters[1], parameters[2],
                MasterQuery.baseDt(functionToken, parameters[3]), parameters.length == 5 ? parameters[4] : null);
    }
}
