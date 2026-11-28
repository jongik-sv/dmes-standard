package com.dongkuk.dmes.mdm.internal.userOwnership.dto;

/**
 * {@code POST /internal/mdm/userOwnership/handover} 본문 — 퇴직자(from)가 가진 것을 받는 사람(to)에게 넘긴다. 사용자 ID 는 둘 다 필수이고 서로 달라야
 * 한다. 사번은 사번 칸에만 쓰며, 없으면 그 칸은 건너뛴다.
 */
public record OwnershipHandoverRequest(String fromUserId, String fromEmpNo, String toUserId, String toEmpNo) {
}
