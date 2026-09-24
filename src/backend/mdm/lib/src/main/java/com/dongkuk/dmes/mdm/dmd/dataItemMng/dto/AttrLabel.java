package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

/** 추가 컬럼 라벨 — 라벨이 있는 번호만(Q5). {@code field} 는 {@code attr01} 같은 번호다. */
public class AttrLabel {

    private String field;
    private String label;

    public AttrLabel() {
    }

    public AttrLabel(String field, String label) {
        this.field = field;
        this.label = label;
    }

    public String getField() { return field; }
    public String getLabel() { return label; }

    public void setField(String v) { this.field = v; }
    public void setLabel(String v) { this.label = v; }
}
