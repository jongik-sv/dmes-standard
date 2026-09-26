package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import com.dongkuk.dmes.mdm.common.rule.RuleTestCaseQueries;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.common.rule.definition.RuleDefinitionAssembler;
import com.dongkuk.dmes.mdm.common.rule.definition.SingleRuleDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.entity.MdmRuleTestCase;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Expression 결과 타입(06:346·446, D9) — 결과 타입은 정적으로 알 수 없어 이 룰에 저장된 테스트 케이스로 저장하려는 정의를 돌려 본다. 조건 식이
 * 불린이 아니거나(행 선택 평가 오류) 결과 식이 결과 변수 타입으로 바뀌지 않으면(결과 단계 평가 오류·타입 변환) 경고한다. 케이스가 낡았을 수 있어
 * 거부하지 않는다. 입력 단계 위반(키 없음 등)은 식 타입 문제가 아니라 보지 않는다. 값 테스트와 같은 경로(요청마다 만든 정의 조회 + 운영 평가기)다.
 */
@Component
@Order(8)
public class ExprTypeByCaseCheck implements RuleSaveCheck {

    private static final ObjectMapper INPUT = new ObjectMapper().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);
    private static final Set<Stage> EXPR_STAGES = EnumSet.of(Stage.ROW_SELECT, Stage.RESULT_CHECK, Stage.RESULT_EVAL);
    private static final Set<Code> EXPR_CODES = EnumSet.of(Code.EVALUATION_ERROR, Code.TYPE_CONVERSION);

    private final RuleTestCaseQueries cases;
    private final StoredRuleDefinitions stored;
    private final MdmEvaluator evaluator;
    private final Clock clock;

    public ExprTypeByCaseCheck(RuleTestCaseQueries cases, StoredRuleDefinitions stored, MdmEvaluator evaluator, Clock clock) {
        this.cases = cases;
        this.stored = stored;
        this.evaluator = evaluator;
        this.clock = clock;
    }

    @Override
    public Set<RuleSaveTarget> targets() {
        return EnumSet.of(RuleSaveTarget.TABLE, RuleSaveTarget.COLUMNS);
    }

    @Override
    public List<Map<String, Object>> check(RuleSaveContext ctx) {
        List<MdmRuleTestCase> list = cases.cases(ctx.ruleId());
        if (list.isEmpty()) {
            return List.of();
        }
        MdmRuleEngine engine = new MdmRuleEngine(evaluator, new SingleRuleDefinitionLookup(RuleDefinitionAssembler.assemble(ctx.ruleId(),
                ctx.ver(), ctx.ruleKind(), ctx.hitPolicy(), null, null, ctx.rawVars(), ctx.vars(), LedgerCells.draftRows(ctx.rows()),
                stored.externalTypes(ctx.ruleId(), ctx.ver())).definition()));
        Instant ts = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        List<Map<String, Object>> out = new ArrayList<>();
        for (MdmRuleTestCase c : list) {
            Map<String, Object> input = object(c.getInputJson());
            if (input == null) {
                continue;
            }
            String which = "케이스 " + c.getCaseId() + " '" + c.getCaseName() + "'";
            try {
                engine.evaluate(ctx.ruleId(), input, ts);
            } catch (EngineEvaluationException e) {
                for (Violation v : e.violations()) {
                    if (EXPR_STAGES.contains(v.stage()) && EXPR_CODES.contains(v.code())) {
                        out.add(warning(v.rowId() == null ? List.of() : List.of(v.rowId()), which + " 로 돌리니 " + v.code() + ": " + v.message()));
                    }
                }
            } catch (RuntimeException e) {
                out.add(warning(List.of(), which + " 로 돌리지 못했다: " + e.getMessage()));
            }
        }
        return out;
    }

    private static Map<String, Object> warning(List<Integer> rowIds, String message) {
        return RuleCheckReport.issue(RuleSaveIssueCode.EXPR_TYPE_BY_CASE.name(), RuleCheckReport.WARNING, rowIds, null, message);
    }

    private static Map<String, Object> object(String json) {
        try {
            Object v = INPUT.readValue(json, Object.class);
            return v instanceof Map<?, ?> m ? INPUT.convertValue(m, new TypeReference<LinkedHashMap<String, Object>>() {}) : null;
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
