package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import java.math.BigDecimal;
import java.util.Map;

/** 파이프라인 입력 주문(정본 주문 항목 → 값). 빈 글은 없음으로 본다. */
public final class OrderInput {

    private final Map<String, String> fields;

    public OrderInput(Map<String, String> fields) {
        this.fields = fields;
    }

    public Map<String, String> fields() {
        return fields;
    }

    /** 값(앞뒤 공백 제거). 비었으면 null. */
    public String get(String key) {
        String v = fields.get(key);
        return v == null || v.isBlank() ? null : v.trim();
    }

    public String get(String key, String dflt) {
        String v = get(key);
        return v == null ? dflt : v;
    }

    public BigDecimal num(String key) {
        return PipelineText.num(get(key));
    }

    public String key() {
        String no = get("ORD_REQ_NO", "");
        String ln = get("ORD_REQ_LN", "");
        return no.isEmpty() && ln.isEmpty() ? "" : no + "-" + ln;
    }

    public String prd() {
        return get("PRD_NM_CD", "");
    }

    public boolean export() {
        String no = get("ORD_REQ_NO", "");
        return no.startsWith("E") || (get("NAT_CD") != null && !"KR".equals(get("NAT_CD")));
    }
}
