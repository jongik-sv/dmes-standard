package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code ruleEdit} action={@code execute} 응답 — 값 테스트 결과(TSK-08-04 design §6.5, 화면 {@code ValueTestResult}).
 *
 * <p>{@code outcome} 이 ERROR 면 판정 오류({@code errors})이고 {@code results}·{@code hits}·{@code trace} 는 없다(엔진 한계 G4). 결과 값은
 * NUMBER 는 {@code toPlainString} 문자열, BOOLEAN 은 boolean, 목록은 원소마다 같은 규칙이다. 원소 모양:
 * {@code hits[{rowId, seq, groupChoices}]}, {@code trace[{rowId, seq, evaluated, hit, firstFalseVarId}]},
 * {@code errors[{stage, code, rowId, name, message}]}, {@code warnings[{code, rowId, varId, message}]},
 * {@code cellErrors[{rowId, varId, code, message}]}, {@code contract{always[name], rows[{rowId, required[name], optional[name]}]}},
 * {@code cases[{caseId, caseName, outcome, pass(true|false|null), mismatches[{key, expected, actual}], results, hit, errors}]}.
 * {@code draftCase} 는 요청 {@code judgeInput} 일 때만 — {@code cases} 원소와 같은 모양(caseId·caseName 은 null).
 */
public class RuleTestResult {

    private String target;
    private String ver;
    private String evalTs;
    private String outcome;
    private Map<String, Object> results;
    private List<Map<String, Object>> hits;
    private boolean defaultApplied;
    private List<Map<String, Object>> trace;
    private List<Map<String, Object>> errors;
    private List<Map<String, Object>> warnings;
    private List<Map<String, Object>> cellErrors;
    private List<Integer> skippedRows;
    private Map<String, Object> contract;
    private List<Map<String, Object>> cases;
    private Map<String, Object> draftCase;

    public String getTarget() { return target; }
    public String getVer() { return ver; }
    public String getEvalTs() { return evalTs; }
    public String getOutcome() { return outcome; }
    public Map<String, Object> getResults() { return results; }
    public List<Map<String, Object>> getHits() { return hits; }
    public boolean isDefaultApplied() { return defaultApplied; }
    public List<Map<String, Object>> getTrace() { return trace; }
    public List<Map<String, Object>> getErrors() { return errors; }
    public List<Map<String, Object>> getWarnings() { return warnings; }
    public List<Map<String, Object>> getCellErrors() { return cellErrors; }
    public List<Integer> getSkippedRows() { return skippedRows; }
    public Map<String, Object> getContract() { return contract; }
    public List<Map<String, Object>> getCases() { return cases; }
    public Map<String, Object> getDraftCase() { return draftCase; }

    public void setTarget(String v) { this.target = v; }
    public void setVer(String v) { this.ver = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
    public void setOutcome(String v) { this.outcome = v; }
    public void setResults(Map<String, Object> v) { this.results = v; }
    public void setHits(List<Map<String, Object>> v) { this.hits = v; }
    public void setDefaultApplied(boolean v) { this.defaultApplied = v; }
    public void setTrace(List<Map<String, Object>> v) { this.trace = v; }
    public void setErrors(List<Map<String, Object>> v) { this.errors = v; }
    public void setWarnings(List<Map<String, Object>> v) { this.warnings = v; }
    public void setCellErrors(List<Map<String, Object>> v) { this.cellErrors = v; }
    public void setSkippedRows(List<Integer> v) { this.skippedRows = v; }
    public void setContract(Map<String, Object> v) { this.contract = v; }
    public void setCases(List<Map<String, Object>> v) { this.cases = v; }
    public void setDraftCase(Map<String, Object> v) { this.draftCase = v; }
}
