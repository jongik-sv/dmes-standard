package kr.dongkuk.maru.mdm.engine.rule.fixture;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.derive;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.expr;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.row;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rowContract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vt;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.rule.CellTextGenerator;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;

/** 흐름 실행 테스트용 계산 룰(DERIVE 한 행, 결과 하나). 평가 시각은 {@link SampleRules#EVAL_TS}. */
public final class FlowRules {

    public static final LocalDateTime FROM = LocalDateTime.of(2026, 9, 1, 0, 0);

    private FlowRules() {}

    /** {@code result = expr}. {@code inputs} 는 행 계약의 필수 입력(NUMBER) — 세트 입력 키 검사가 본다. */
    public static RuleDefinition calc(String ruleId, String result, String exprText, String... inputs) {
        List<VarType> required = new ArrayList<>();
        for (String in : inputs) {
            required.add(vt(in, DataType.NUMBER));
        }
        return CellTextGenerator.withTexts(derive(ruleId, 1, FROM,
                List.of(resultVar(1, DispType.EXPRESSION, result, DataType.NUMBER, 1)),
                contract(List.of(), rowContract(1, List.copyOf(required))),
                row(1, 1, 1, expr(exprText))), d -> null);
    }

    public static InMemoryDefinitionLookup lookup(RuleDefinition... rules) {
        return new InMemoryDefinitionLookup().add(rules);
    }
}
