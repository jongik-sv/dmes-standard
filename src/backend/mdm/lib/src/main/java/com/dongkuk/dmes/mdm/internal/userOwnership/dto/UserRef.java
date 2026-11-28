package com.dongkuk.dmes.mdm.internal.userOwnership.dto;

/** 조회 대상 사용자 — 사용자 ID 와 사번. 사번은 사번 칸을 셀 때만 쓴다(없어도 된다). */
public record UserRef(String userId, String empNo) {
}
