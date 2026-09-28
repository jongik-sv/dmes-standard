package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

import java.util.ArrayList;
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
    /**
     * 이 케이스들만 돌린다 — 콤마로 이은 {@code caseId}. {@code runCases} 와 함께 쓴다(카드 ⑥ "실행").
     * 비면 전체.
     *
     * <p>문자열로 받는 이유: 최상위 dto property 로 {@code List<Integer>} 를 두면 oasis
     * {@code CactusRequestConverter} 가 타입을 알 수 없어 {@code IllegalArgumentException: Generic type} 으로
     * 뻗는다({@code rows} 를 {@code grids} 아래에 숨긴 이유와 같다). {@code inputJson} 과 같은 방식이다.
     * 기대값 비교는 걸러도 {@code RuleCaseJudge.runCase} 가 그대로 하므로 "모두 실행" 과 판정 기준이 같다.
     */
    private String caseIds;

    public String getMaruRuleId() { return maruRuleId; }
    public String getTarget() { return target; }
    public Integer getVer() { return ver; }
    public String getHitPolicy() { return hitPolicy; }
    public List<Map<String, Object>> getRows() { return rows; }
    public String getInputJson() { return inputJson; }
    public Boolean getRunCases() { return runCases; }
    public String getCaseIds() { return caseIds; }

    /**
     * {@code caseIds} 문자열을 목록으로 — 콤마로 나눠 빈 항목을 버린다. 파싱 불가 문자는
     * 조용히 넘기지 않고 {@code -1} 로 밀어 넣어 대상과 안 맞는 판정이 나게 한다.
     */
    public List<Integer> caseIdList() {
        List<Integer> out = new ArrayList<>();
        if (caseIds == null || caseIds.isBlank()) return out;
        for (String part : caseIds.split(",")) {
            String t = part.trim();
            if (t.isEmpty()) continue;
            try {
                out.add(Integer.valueOf(t));
            } catch (NumberFormatException ignored) {
                out.add(-1);
            }
        }
        return out;
    }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setTarget(String v) { this.target = v; }
    public void setVer(Integer v) { this.ver = v; }
    public void setHitPolicy(String v) { this.hitPolicy = v; }
    public void setRows(List<Map<String, Object>> v) { this.rows = v; }
    public void setInputJson(String v) { this.inputJson = v; }
    public void setRunCases(Boolean v) { this.runCases = v; }
    public void setCaseIds(String v) { this.caseIds = v; }
}
