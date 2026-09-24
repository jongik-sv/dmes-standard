package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper.StoredRow;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.rule.RuleIssue;

/** {@link RuleSaveCheck} 입력 — 방금 저장한 DRAFT 의 정의(해석된 변수 타입 포함)와 그 분석 결과. */
public record RuleSaveContext(String ruleId, int ver, String ruleKind, String hitPolicy, List<ResolvedVar> vars, List<StoredRow> rows,
                              List<RuleIssue> analysis) {
}
