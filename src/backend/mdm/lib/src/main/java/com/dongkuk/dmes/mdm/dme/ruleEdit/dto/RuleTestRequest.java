package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code ruleEdit} action={@code execute} 요청 — 값 테스트(TSK-08-04 design §6.5). 원장에 쓰지 않는다(I19).
 *
 * <p>{@code target} 이 VERSION 이면 저장된 {@code ver} 를 판정하고, BODY 면 편집 중인 {@code rows}·{@code hitPolicy} 를 그 버전의 저장된
 * 변수로 판정한다(D4). {@code rows} 는 표 저장과 같은 모양으로 {@code grids.rows.rows} 로 받는다(JSON 숫자는 Double). {@code inputJson} 은
 * JSON 객체 문자열이다 — 키 없음과 null 을 가르려고 문자열로 받는다(I21).
 */
public class RuleTestRequest {

    private String maruRuleId;
    /** BODY·VERSION. */
    private String target;
    private Integer ver;
    /** BODY 만. */
    private String hitPolicy;
    /** BODY 만 — {@code {rowId(새 행은 음수), rowKind, cells(JSON 문자열), note}}. */
    private List<Map<String, Object>> rows;
    private String inputJson;
    /** 이 룰의 테스트 케이스를 같은 정의로 모두 돌린다. */
    private Boolean runCases;

    public String getMaruRuleId() { return maruRuleId; }
    public String getTarget() { return target; }
    public Integer getVer() { return ver; }
    public String getHitPolicy() { return hitPolicy; }
    public List<Map<String, Object>> getRows() { return rows; }
    public String getInputJson() { return inputJson; }
    public Boolean getRunCases() { return runCases; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setTarget(String v) { this.target = v; }
    public void setVer(Integer v) { this.ver = v; }
    public void setHitPolicy(String v) { this.hitPolicy = v; }
    public void setRows(List<Map<String, Object>> v) { this.rows = v; }
    public void setInputJson(String v) { this.inputJson = v; }
    public void setRunCases(Boolean v) { this.runCases = v; }
}
