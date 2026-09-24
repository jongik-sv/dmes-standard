package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code ruleEdit} action={@code parseExpr} 응답 — 서버 EvalEx 파싱 결과(AST Map·참조 변수)와 화면 평가 가능 여부.
 * {@code supported=false} 면 화면({@code previewRule})이 평가하지 못 하고 서버 평가로 넘긴다는 표시를 낸다.
 */
public class RuleExprParseResult {

    private Map<String, Object> ast;
    private List<String> refVars;
    private boolean supported;
    private List<Map<String, Object>> problems;

    public RuleExprParseResult() {
    }

    public RuleExprParseResult(Map<String, Object> ast, List<String> refVars, boolean supported, List<Map<String, Object>> problems) {
        this.ast = ast;
        this.refVars = refVars;
        this.supported = supported;
        this.problems = problems;
    }

    public Map<String, Object> getAst() { return ast; }
    public List<String> getRefVars() { return refVars; }
    public boolean isSupported() { return supported; }
    public List<Map<String, Object>> getProblems() { return problems; }

    public void setAst(Map<String, Object> v) { this.ast = v; }
    public void setRefVars(List<String> v) { this.refVars = v; }
    public void setSupported(boolean v) { this.supported = v; }
    public void setProblems(List<Map<String, Object>> v) { this.problems = v; }
}
