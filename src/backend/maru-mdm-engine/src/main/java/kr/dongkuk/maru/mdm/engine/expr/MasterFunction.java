package kr.dongkuk.maru.mdm.engine.expr;

import com.ezylang.evalex.EvaluationException;
import com.ezylang.evalex.Expression;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.functions.AbstractFunction;
import com.ezylang.evalex.functions.FunctionParameter;
import com.ezylang.evalex.parser.Token;
import java.time.LocalDateTime;

/**
 * {@code MASTER(id, cate, key[, attr])} — 평가 시각 {@code EVAL_TS} 에 항목이 유효한가, 또는 추가 컬럼 값(05:363-400).
 * 평가 시각은 데이터 접근자의 예약 변수에서 읽어 {@link MdmExpressionConfig#ZONE} 벽시계로 바꾼다(EG:223, engine-contract §7).
 * 함수가 시계를 직접 읽지 않는다.
 *
 * <p>마지막 인자가 가변이라 파서는 최소 인자 수만 본다. 초과 인자는 저장 시 검사가 거르고, 평가에서 만나면 평가 오류다(05:400).
 */
@FunctionParameter(name = "id")
@FunctionParameter(name = "cate")
@FunctionParameter(name = "key")
@FunctionParameter(name = "attr", isVarArg = true)
final class MasterFunction extends AbstractFunction {

    private final MasterQuery query;

    MasterFunction(MasterQuery query) {
        this.query = query;
    }

    @Override
    public EvaluationValue evaluate(Expression expression, Token functionToken, EvaluationValue... parameters)
            throws EvaluationException {
        MdmFunction shape = MdmFunction.MASTER;
        if (parameters.length < shape.minArgs() || parameters.length > shape.maxArgs()) {
            throw new EvaluationException(functionToken, "MASTER 인자는 " + shape.minArgs() + "-" + shape.maxArgs()
                    + "개여야 한다: " + parameters.length + "개");
        }
        EvaluationValue ts = expression.getDataAccessor().getData(ReservedNames.EVAL_TS);
        if (ts == null || !ts.isDateTimeValue()) {
            throw new EvaluationException(functionToken, "MASTER 평가 시각 EVAL_TS 가 없다");
        }
        LocalDateTime baseDt = LocalDateTime.ofInstant(ts.getDateTimeValue(), MdmExpressionConfig.ZONE);
        return query.query(functionToken, parameters[0], parameters[1], parameters[2], baseDt,
                parameters.length == 4 ? parameters[3] : null);
    }
}
