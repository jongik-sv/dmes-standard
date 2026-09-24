package com.dongkuk.dmes.mdm.contract.mastercode;

/** 선분(from_ver·to_ver)을 갖는 세 표 — 04:37. diff 키의 표 접두는 {@link #name()} 이다(D10). */
public enum MasterCodeSegmentTable {
    ITEM("TB_MDM_CODE_ITEM"),
    CATE("TB_MDM_CODE_CATE"),
    CATE_ITEM("TB_MDM_CODE_CATE_ITEM");

    private final String physicalTable;

    MasterCodeSegmentTable(String physicalTable) {
        this.physicalTable = physicalTable;
    }

    public String physicalTable() {
        return physicalTable;
    }
}
