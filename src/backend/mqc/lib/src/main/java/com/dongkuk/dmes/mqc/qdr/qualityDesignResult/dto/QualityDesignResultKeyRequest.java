package com.dongkuk.dmes.mqc.qdr.qualityDesignResult.dto;

/** view·calculate·confirm·cancel·history params — 주문 키(ORD_REQ_NO-ORD_REQ_LN), 사유(보류 때 선택). */
public class QualityDesignResultKeyRequest {
    private String orderKey;
    private String note;
    public String getOrderKey() { return orderKey; }
    public void setOrderKey(String v) { this.orderKey = v; }
    public String getNote() { return note; }
    public void setNote(String v) { this.note = v; }
}
