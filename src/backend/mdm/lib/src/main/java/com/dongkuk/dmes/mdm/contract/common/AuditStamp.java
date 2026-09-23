package com.dongkuk.dmes.mdm.contract.common;

import java.time.Instant;

/**
 * 네이티브 쓰기용 감사 값 — 규칙표 §2. {@code at} 은 {@code CactusAuditEntity} 의 C_AT·U_AT 와 같은 {@link Instant}.
 * OASIS 요청 문맥 밖이면 userId·serviceId·programId 는 null 일 수 있다.
 */
public record AuditStamp(String userId, String serviceId, String programId, Instant at) {
}
