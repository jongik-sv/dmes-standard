package com.dongkuk.dmes.mdm.internal.userOwnership.dto;

/** 사용자·종류별 건수 한 줄. 건수가 0 인 종류는 싣지 않는다. */
public record OwnershipSummaryItem(String userId, String kind, String kindNm, long cnt) {
}
