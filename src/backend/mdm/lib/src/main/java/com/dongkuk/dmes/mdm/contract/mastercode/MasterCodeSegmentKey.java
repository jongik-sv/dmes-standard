package com.dongkuk.dmes.mdm.contract.mastercode;

/** 되돌리기 대상 키. ITEM 이면 cateId 가 null, CATE 면 code 가 null, CATE_ITEM 이면 둘 다 있다. */
public record MasterCodeSegmentKey(MasterCodeSegmentTable table, String cateId, String code) {
}
