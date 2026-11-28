package com.dongkuk.dmes.mdm.internal.userOwnership.dto;

/** {@code POST /internal/mdm/userOwnership/releaseClaims} 본문 — 그 사용자의 ERD 작업 중 표시만 지운다. */
public record ReleaseClaimsRequest(String userId) {
}
