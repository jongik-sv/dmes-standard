package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import com.dongkuk.dmes.mdm.common.rule.CondIo;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleExprParseResult;
import java.util.Map;

/** {@code ruleSetEdit} action={@code validate} 응답(흐름도 2단계 P5) — IF "그 외"가 아닌 조건식 선 ID → 조건식 입력. */
public class RuleSetCondIoResult {

    private Map<String, CondIo> condIo;
    /** {@code exprText} 요청의 파싱 결과. 흐름 IO 요청이면 null. */
    private RuleExprParseResult expr;

    public RuleSetCondIoResult() {
    }

    public RuleSetCondIoResult(Map<String, CondIo> condIo) {
        this.condIo = condIo;
    }

    public RuleSetCondIoResult(Map<String, CondIo> condIo, RuleExprParseResult expr) {
        this.condIo = condIo;
        this.expr = expr;
    }

    public RuleExprParseResult getExpr() { return expr; }

    public void setExpr(RuleExprParseResult v) { this.expr = v; }

    public Map<String, CondIo> getCondIo() { return condIo; }

    public void setCondIo(Map<String, CondIo> v) { this.condIo = v; }
}
