package com.dongkuk.dmes.mdm.contract.dictionary;

/** 마스터 코드 참조(TSK-04-01 design.md §7.2) — 마루 코드 ID 와 그 안의 카테고리 ID. */
public record MdmCodeRef(String maruCodeId, String cateId) {
}
