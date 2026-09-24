package com.dongkuk.dmes.mdm.common.segment;

/** 일괄 upsert(CSV·API 경로) 입력 한 행 — D2·D3. */
public record UpsertRow(String code, DataItemValue value) {
}
