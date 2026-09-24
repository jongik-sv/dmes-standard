package com.dongkuk.dmes.mdm.common.segment;

/** 항목 선분 키 — {@code TB_MDM_DATA_ITEM} 의 원래 키(PK 에서 VALID_FROM 을 뺀 것). */
public record DataItemKey(String maruDataId, String code) {
}
