package com.dongkuk.dmes.mdm.dme.ruleCalc.dto;

import java.util.Map;

/**
 * {@code ruleCalc} 요청(io·run 공통, docs/widget-2026-10/rule-calc-api.md §1·§3). 사용자 ID 는 받지 않는다 — 서버의
 * {@code MdmCurrentUser} 에서만 얻는다. {@code values}·{@code valuesJson}·{@code evalTs} 는 run 만 쓴다.
 *
 * <p><b>입력 값 두 가지 길</b> — 문서의 {@code values} 는 JSON 객체인데, OASIS 요청 변환기({@code CactusRequestConverter})가 {@code params} 의
 * 값을 {@code new TypedObject(value)} 로 감싸 중첩 객체(Map)를 {@code Generic type} 예외로 거절한다(HTTP 로는 {@code values} 가 닿지 않는다).
 * 그래서 {@code params.valuesJson}(입력 이름 → 값 JSON 객체를 글자로)을 같은 뜻으로 받는다(기존 {@code recordJson} 관례). 둘 다 오면
 * {@code values} 가 이긴다. 소수는 {@code valuesJson} 쪽이 BigDecimal 로 정확히 읽힌다.
 */
public class RuleCalcRequest {

    private String targetTp;
    private String targetId;
    private boolean preview;
    private Map<String, Object> values;
    private String valuesJson;
    private String evalTs;

    public String getTargetTp() { return targetTp; }
    public String getTargetId() { return targetId; }
    public boolean isPreview() { return preview; }
    public Map<String, Object> getValues() { return values; }
    public String getValuesJson() { return valuesJson; }
    public String getEvalTs() { return evalTs; }

    public void setTargetTp(String v) { this.targetTp = v; }
    public void setTargetId(String v) { this.targetId = v; }
    public void setPreview(boolean v) { this.preview = v; }
    public void setValues(Map<String, Object> v) { this.values = v; }
    public void setValuesJson(String v) { this.valuesJson = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
}
