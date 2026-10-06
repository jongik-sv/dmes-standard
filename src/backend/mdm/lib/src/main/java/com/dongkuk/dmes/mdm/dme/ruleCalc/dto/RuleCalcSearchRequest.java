package com.dongkuk.dmes.mdm.dme.ruleCalc.dto;

/**
 * {@code ruleCalc} action=search 요청(docs/widget-2026-10/rule-calc-api.md §2). 룰·세트 ID 를 찾는 편집기용이다. 사용자 ID 는 받지 않는다 —
 * {@code preview=true} 일 때 서버의 {@code MdmCurrentUser} 로만 내 DRAFT 를 가린다.
 *
 * <p>{@code targetTp} 는 {@code RULE}·{@code SET}·{@code ALL}(기본). {@code limit} 은 기본 50, 최대 200 이다(1 미만은 기본, 초과는 최대).
 * {@code limit} 은 OASIS 가 숫자 칸을 {@code Integer} 로 바인딩할 수 있게 래퍼 타입이다.
 */
public class RuleCalcSearchRequest {

    private String targetTp;
    private String keyword;
    private boolean preview;
    private Integer limit;

    public String getTargetTp() { return targetTp; }
    public String getKeyword() { return keyword; }
    public boolean isPreview() { return preview; }
    public Integer getLimit() { return limit; }

    public void setTargetTp(String v) { this.targetTp = v; }
    public void setKeyword(String v) { this.keyword = v; }
    public void setPreview(boolean v) { this.preview = v; }
    public void setLimit(Integer v) { this.limit = v; }
}
