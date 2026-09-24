package kr.dongkuk.maru.mdm.engine.rule;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;

/**
 * 겹침·빈틈·도달 불가 분석 입력 — TS {@code RuleDef}(m-mdm {@code src/evalex/rule-model.ts}) 대응(TSK-08-02 design §2.1-E).
 * 칼럼 이름·순서는 08-04 가 그대로 쓰도록 고정한다(design §6.6.3).
 *
 * @param hitPolicy DECISION 에서 null 이면 FIRST 로 본다
 * @param rows      셀의 생성 텍스트({@code RuleCell.text})는 읽지 않는다
 */
public record AnalysisRule(String ruleId, RuleKind ruleKind, HitPolicy hitPolicy, List<AnalysisVar> vars, List<RuleRow> rows) {}
