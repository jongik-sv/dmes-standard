package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

/** {@code dataItemMng} 쓰기 응답 — 동작, 사건 뒤 그 키의 마지막 행, 저장 시각. */
public class DataItemSaveResult {

    /** INSERT/UPDATE/CLOSE/REOPEN/NONE. */
    private String action;
    private DataItemRow row;
    private String at;

    public DataItemSaveResult() {
    }

    public DataItemSaveResult(String action, DataItemRow row, String at) {
        this.action = action;
        this.row = row;
        this.at = at;
    }

    public String getAction() { return action; }
    public DataItemRow getRow() { return row; }
    public String getAt() { return at; }

    public void setAction(String v) { this.action = v; }
    public void setRow(DataItemRow v) { this.row = v; }
    public void setAt(String v) { this.at = v; }
}
