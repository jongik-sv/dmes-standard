package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import java.util.ArrayList;
import java.util.List;

/**
 * {@code ruleSetEdit} action={@code execute} 요청(흐름도 2단계 P5) — 저장 전 흐름을 기록 실행한다(디버거). 흐름·레코드는 JSON 문자열로 받는다
 * (OASIS params 는 Map 을 받지 못한다, D-111). {@code recordJson} 이 없으면 {@code {}}, {@code evalTs} 는 KST {@code yyyy-MM-dd HH:mm:ss}(없으면
 * 서비스 시계).
 *
 * <p>{@code runCases=true} 면 단건 실행 대신 저장된 케이스를 {@code flowJson} 으로 돌린다(흐름도 3단계 P7·P-D12) — {@code setId} 가 필요하고
 * {@code caseIds} 는 콤마로 이은 케이스 ID(비면 전체)다. OASIS params 는 목록을 받지 못해 문자열로 받는다.
 *
 * <p>{@code editsJson} 은 디버거에서 고친 값(4단계 spec §2.3) — JSON 배열 문자열 {@code [{beforeSeq, nodeId, values}]}, values 는 recordJson 과
 * 같은 변환기로 푼다. {@code runCases} 면 읽지 않는다. OASIS params 는 목록을 받지 못해 문자열로 받는다(D-111).
 */
public class RuleSetSimulateRequest {

    private String flowJson;
    private String recordJson;
    private String evalTs;
    private String setId;
    private Boolean runCases;
    private String caseIds;
    private String editsJson;

    public String getFlowJson() { return flowJson; }
    public String getRecordJson() { return recordJson; }
    public String getEvalTs() { return evalTs; }

    public String getSetId() { return setId; }
    public Boolean getRunCases() { return runCases; }
    public String getCaseIds() { return caseIds; }
    public String getEditsJson() { return editsJson; }

    /**
     * {@code caseIds} 문자열을 목록으로 — 콤마로 나눠 빈 항목을 버린다. 숫자가 아니면 조용히 넘기지 않고 {@code -1} 로 밀어 넣어 어떤 케이스와도
     * 맞지 않게 한다({@code RuleTestRequest.caseIdList} 와 같은 규칙).
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

    public void setSetId(String v) { this.setId = v; }
    public void setRunCases(Boolean v) { this.runCases = v; }
    public void setCaseIds(String v) { this.caseIds = v; }
    public void setEditsJson(String v) { this.editsJson = v; }
    public void setFlowJson(String v) { this.flowJson = v; }
    public void setRecordJson(String v) { this.recordJson = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
}
