package com.dongkuk.dmes.mdm.common.rule.check;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import java.util.List;
import java.util.Map;

/**
 * {@link RuleSaveValidator} 입력 — 검사할 정의와 적용 지점(TSK-08-04 design §2.2). 행 셀은 {@code RuleCellsCodec.validateShape} 를
 * 이미 통과한 모양이다. {@code ResolvedVar} 에 없는 값(식 변수 AST·열 조건 등)은 {@code rawVars} 에서 읽는다(I31).
 */
public record RuleCheckInput(String ruleId, int ver, String ruleKind, String hitPolicy, List<MdmRuleVar> rawVars, List<ResolvedVar> vars,
                             List<DraftRow> rows, RuleSaveTarget target) {

    /**
     * 검사할 행 하나.
     *
     * @param rowId 저장된 행 번호. 새 행이면 화면이 준 임시 번호(음수)
     * @param seq   NORMAL 행 순서(1부터), DEFAULT 행은 0
     */
    public record DraftRow(int rowId, int seq, String rowKind, Map<Integer, Map<String, Object>> cells) {
    }
}
