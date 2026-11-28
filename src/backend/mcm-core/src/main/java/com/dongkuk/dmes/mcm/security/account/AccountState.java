/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 사용자 계정 상태 — 시안 「사용자 비활성화·퇴직 처리」 A안의 상태 계산을 한 곳에 둔다
 */
package com.dongkuk.dmes.mcm.security.account;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 사용자 계정 상태. DB 에는 상태 칸이 따로 없고(A안) 아래 칸 조합으로 계산한다 — 계산식은 {@link #of} 하나뿐이다.
 *
 * <ul>
 *   <li>{@code RETIRED} 퇴직 — {@code HR_ST='RETIRED'}(ERP 퇴직) 또는 {@code USE_TP='N'} 이고 유효 기한일이 오늘 이하</li>
 *   <li>{@code SUSPENDED} 비활성 — {@code USE_TP='N'}(관리자 비활성) 또는 {@code HR_ST='LEAVE'}(인사 휴직). 둘은 따로 걸리고 따로 풀린다(D5)</li>
 *   <li>{@code EXPIRED} 기한 밖 — {@code USE_TP='Y'} 인데 오늘이 유효 기간 밖(협력업체 계약 종료일 지남 등). 로그인만 막힌다</li>
 *   <li>{@code LOCKED} 잠금 — {@code LOCK_YN='Y'}(비밀번호 실패). 쓰던 세션은 그대로 둔다</li>
 *   <li>{@code ACTIVE} 활성</li>
 * </ul>
 * 우선순위는 위 순서다(퇴직이 가장 앞).
 */
public enum AccountState {
    ACTIVE("활성"),
    LOCKED("잠금"),
    SUSPENDED("비활성"),
    EXPIRED("기한 밖"),
    RETIRED("퇴직");

    /** ERP 인사 상태 — 재직. */
    public static final String HR_ACTIVE = "ACTIVE";
    /** ERP 인사 상태 — 휴직. */
    public static final String HR_LEAVE = "LEAVE";
    /** ERP 인사 상태 — 퇴직. */
    public static final String HR_RETIRED = "RETIRED";

    private final String label;

    AccountState(String label) {
        this.label = label;
    }

    /** 화면 이름. */
    public String label() {
        return label;
    }

    /** 이 상태에서 쓰던 세션을 끊는가 — 비활성·퇴직·기한 밖. 잠금은 세션을 그대로 둔다(시안 상태별 처리표). */
    public boolean cutsSession() {
        return this == SUSPENDED || this == RETIRED || this == EXPIRED;
    }

    /**
     * 칸 조합으로 상태를 계산한다. 날짜는 일 단위(끝 날 포함) — 로그인 검사와 SysadminGuard 의 사람 활성 판정과 같다.
     *
     * @param useTp USE_TP
     * @param start START_ACTIVE_DATE
     * @param end   END_ACTIVE_DATE
     * @param hrSt  HR_ST
     * @param lockYn LOCK_YN
     * @param today 오늘(KST)
     */
    public static AccountState of(String useTp, LocalDateTime start, LocalDateTime end, String hrSt, String lockYn,
                                  LocalDate today) {
        boolean disabled = "N".equals(useTp);
        if (HR_RETIRED.equals(hrSt)) return RETIRED;
        if (disabled && end != null && !end.toLocalDate().isAfter(today)) return RETIRED;
        if (disabled || HR_LEAVE.equals(hrSt)) return SUSPENDED;
        if (end != null && end.toLocalDate().isBefore(today)) return EXPIRED;
        if (start != null && start.toLocalDate().isAfter(today)) return EXPIRED;
        if ("Y".equals(lockYn)) return LOCKED;
        return ACTIVE;
    }

    /** 이름으로 찾는다. 모르는 값이면 null. */
    public static AccountState parse(String name) {
        if (name == null || name.isBlank()) return null;
        try {
            return valueOf(name.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
