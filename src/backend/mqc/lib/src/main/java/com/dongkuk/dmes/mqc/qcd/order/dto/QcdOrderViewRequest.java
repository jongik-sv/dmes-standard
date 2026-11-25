package com.dongkuk.dmes.mqc.qcd.order.dto;

/** qcdOrder view params — 주문 키(ORD_REQ_NO-ORD_REQ_LN). */
public class QcdOrderViewRequest {
    private String orderKey;
    public String getOrderKey() { return orderKey; }
    public void setOrderKey(String v) { this.orderKey = v; }
}
