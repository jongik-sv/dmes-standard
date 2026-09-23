package kr.dongkuk.maru.mdm.engine.corpus;

import com.ezylang.evalex.EvaluationException;
import com.ezylang.evalex.Expression;
import com.ezylang.evalex.data.EvaluationValue;
import com.ezylang.evalex.functions.AbstractFunction;
import com.ezylang.evalex.functions.FunctionParameter;
import com.ezylang.evalex.parser.Token;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 코퍼스 서버 러너 전용 MDM 함수 대역(TSK-03-04 design §6.11, D3). 실물은 TSK-03-02 가 만든다.
 * TSK-03-02 가 머지되면 하네스 설정을 {@code MdmExpressionConfig.create} 로 바꾸고 이 파일을 지운다(design §6.15 P4).
 */
final class CorpusFunctions {

    private CorpusFunctions() {}

    /** {@code INSTR(s, sub)} — 06:160·EG 8.4. 어느 쪽이든 NULL 이면 NULL, 아니면 {@code s.indexOf(sub) + 1}(대소문자 구분). */
    @FunctionParameter(name = "s")
    @FunctionParameter(name = "sub")
    static final class InstrStandIn extends AbstractFunction {

        @Override
        public EvaluationValue evaluate(Expression expression, Token functionToken, EvaluationValue... p) {
            if (p[0].isNullValue() || p[1].isNullValue()) {
                return EvaluationValue.NULL_VALUE;
            }
            return EvaluationValue.numberValue(
                    BigDecimal.valueOf(p[0].getStringValue().indexOf(p[1].getStringValue()) + 1L));
        }
    }

    /**
     * {@code MASTER(id, cate, key)} — engine-contract §7·§11. key NULL 이면 false, 코드 집합 {@code id|cate} 가 있으면 소속 여부,
     * 없으면 false(마루 데이터 대상 {@code MasterLookup.NONE}). attr 형태는 코퍼스에 없어 오류로 둔다.
     */
    @FunctionParameter(name = "id")
    @FunctionParameter(name = "cate")
    @FunctionParameter(name = "key")
    @FunctionParameter(name = "attr", isVarArg = true)
    static final class MasterStandIn extends AbstractFunction {

        private final Map<String, List<String>> codeSets;

        MasterStandIn(Map<String, List<String>> codeSets) {
            this.codeSets = codeSets;
        }

        @Override
        public EvaluationValue evaluate(Expression expression, Token functionToken, EvaluationValue... p)
                throws EvaluationException {
            if (p.length != 3) {
                throw new EvaluationException(functionToken, "MASTER attr 형태는 코퍼스 대역에 없다");
            }
            if (p[2].isNullValue()) {
                return EvaluationValue.booleanValue(false);
            }
            List<String> set = codeSets.get(p[0].getStringValue() + "|" + p[1].getStringValue());
            return EvaluationValue.booleanValue(set != null && set.contains(p[2].getStringValue()));
        }
    }
}
