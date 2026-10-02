package com.dongkuk.dmes.mdm.common.rule.check;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper.StoredRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.rule.RuleIssue;

/**
 * {@link RuleSaveCheck} 입력 — 저장하려는 정의(쓰기 전, 정규화한 행)와 그 분석 결과(TSK-08-04 design §2.2). 분석을 돌리지 않는 적용 지점
 * (COLUMNS·TEST_BODY)에서는 {@code analysis} 가 비어 있다. {@code rows} 의 새 행 번호는 임시 번호(음수)다. {@code referenceTime} 은 세트 순서
 * 검사의 기준 시각 — 룰 확정이면 요청한 apply_from, 저장이면 null(지금 시각, D-144 2단계 J10).
 */
public record RuleSaveContext(String ruleId, BigDecimal ver, String ruleKind, String hitPolicy, List<MdmRuleVar> rawVars, List<ResolvedVar> vars,
                              List<StoredRow> rows, List<RuleIssue> analysis, RuleSaveTarget target, LocalDateTime referenceTime) {

    public RuleSaveContext(String ruleId, BigDecimal ver, String ruleKind, String hitPolicy, List<MdmRuleVar> rawVars, List<ResolvedVar> vars,
                           List<StoredRow> rows, List<RuleIssue> analysis, RuleSaveTarget target) {
        this(ruleId, ver, ruleKind, hitPolicy, rawVars, vars, rows, analysis, target, null);
    }
}
