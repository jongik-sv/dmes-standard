package kr.dongkuk.maru.mdm.engine.rule;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;

/**
 * 행을 고른 뒤(ROW_SELECT 이후) 난 판정 오류 — 그때까지 본 행 추적을 함께 싣는다.
 *
 * <p>UNIQUE 적중이 둘 이상인데도 어느 행이 맞고 어느 칸에서 떨어졌는지 보여야 룰 화면이 표에 칠할 수 있다.
 * 판정 결과로는 여전히 오류이므로 {@link EngineEvaluationException} 으로 잡는 호출부는 그대로다.
 */
public class RuleEvaluationException extends EngineEvaluationException {

    private static final long serialVersionUID = 1L;

    private final transient List<RuleResult.RowTrace> trace;

    public RuleEvaluationException(List<Violation> violations, List<RuleResult.RowTrace> trace) {
        super(violations);
        this.trace = List.copyOf(trace);
    }

    /** 평가한 행마다 적중 여부와 첫 거짓 셀({@link RuleResult#trace()} 와 같은 모양). */
    public List<RuleResult.RowTrace> trace() {
        return trace;
    }
}
