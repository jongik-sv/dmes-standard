package com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * {@code codeItemEdit} action={@code execute} 요청 params(TSK-06-03 design.md §6.6). RELEASED 코드 행 경미 수정. <b>이름·약칭·순서·설명 외의 칸이 없다</b> — 코드·선분·계층·추가 컬럼은 구조로 잠긴다(불변 규칙 28).
 * getter/setter 일반 클래스다(record·Lombok 없음 — OASIS dto 바인딩 관례).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class CodeItemPatchRequest {

    private String maruCodeId;
    private String code;
    private String fromVer;
    private String name;
    private String alterName;
    private Integer seq;
    private String description;

    public String getMaruCodeId() { return maruCodeId; }
    public String getCode() { return code; }
    public String getFromVer() { return fromVer; }
    public String getName() { return name; }
    public String getAlterName() { return alterName; }
    public Integer getSeq() { return seq; }
    public String getDescription() { return description; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setCode(String v) { this.code = v; }
    public void setFromVer(String v) { this.fromVer = v; }
    public void setName(String v) { this.name = v; }
    public void setAlterName(String v) { this.alterName = v; }
    public void setSeq(Integer v) { this.seq = v; }
    public void setDescription(String v) { this.description = v; }
}
