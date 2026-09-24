package com.dongkuk.dmes.mdm.contract.data;

/**
 * 일시 선분 저장 행위 — {@code TB_MDM_DATA_RECV_ITEM.ACTION} CHECK 목록과 이름이 같다(05:213,697,
 * TSK-07-01 design.md §2).
 */
public enum MdmTemporalSegmentAction {
    INSERT, UPDATE, CLOSE, REOPEN, NONE
}
