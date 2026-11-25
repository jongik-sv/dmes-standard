package com.dongkuk.dmes.mqc.qcd.rule.dto;

/** codes 요청 params — 마루 코드 ID 목록(쉼표 구분). */
public class QcdCodeSearchRequest {
    private String codeIds;
    public String getCodeIds() { return codeIds; }
    public void setCodeIds(String v) { this.codeIds = v; }
}
