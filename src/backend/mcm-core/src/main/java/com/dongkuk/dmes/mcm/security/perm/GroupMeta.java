package com.dongkuk.dmes.mcm.security.perm;

import java.time.LocalDateTime;

/**
 * 역할 그룹 메타.
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 * <p>내용: 역할 그룹의 사용 여부(USE_TP)와 유효 기간.
 */
public record GroupMeta(String roleGroupId, String useTp, LocalDateTime startActiveDate, LocalDateTime endActiveDate) {
}
