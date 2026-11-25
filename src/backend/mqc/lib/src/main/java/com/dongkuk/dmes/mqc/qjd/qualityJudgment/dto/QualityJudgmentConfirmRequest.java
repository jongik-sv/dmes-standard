package com.dongkuk.dmes.mqc.qjd.qualityJudgment.dto;

/** confirm 요청 params — 코일 번호(쉼표로 여러 개), 확정 상태(PASS·FAIL·HOLD), 사유(시스템 제안과 다르면 필수). */
public class QualityJudgmentConfirmRequest {
    private String coilNos;
    private String status;
    private String note;
    public String getCoilNos() { return coilNos; }
    public void setCoilNos(String v) { this.coilNos = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getNote() { return note; }
    public void setNote(String v) { this.note = v; }
}
