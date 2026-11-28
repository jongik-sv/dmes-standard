package com.dongkuk.dmes.mdm.internal.userOwnership.dto;

/** 종류별 넘긴(작업 중 표시는 지운) 건수. {@code skipped} 는 사번 칸인데 사번이 없어 손대지 않았다는 뜻이다. */
public record OwnershipHandoverItem(String kind, String kindNm, long cnt, boolean skipped) {
}
