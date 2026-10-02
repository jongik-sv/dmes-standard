package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Comparator;
import java.util.Optional;
import java.util.Set;

/**
 * 룰 버전 목록에서 고르기(TSK-08-02 design §6.3.1·I4). 미적용 = DRAFT·REQUESTED·APPROVED·{@code APPLY_FROM > now} 인 RELEASED
 * ({@code VersionWriteGuard} 와 같은 정의), 현재 RELEASED = {@code APPLY_FROM <= now < APPLY_TO}. 버전 비교는 scale 3 VER 의
 * {@code compareTo} 로 한다(D-144).
 */
public final class RuleVersions {

    private static final Set<String> PENDING_STATUSES = Set.of("DRAFT", "REQUESTED", "APPROVED");

    private RuleVersions() {
    }

    public static boolean isUnapplied(MdmRuleVer v, LocalDateTime now) {
        return PENDING_STATUSES.contains(v.getStatus())
                || ("RELEASED".equals(v.getStatus()) && v.getApplyFrom() != null && v.getApplyFrom().isAfter(now));
    }

    public static boolean isCurrentReleased(MdmRuleVer v, LocalDateTime now) {
        return "RELEASED".equals(v.getStatus()) && v.getApplyFrom() != null && !v.getApplyFrom().isAfter(now)
                && (v.getApplyTo() == null || now.isBefore(v.getApplyTo()));
    }

    /** 미적용 버전 가운데 VER 가 가장 큰 것. */
    public static Optional<MdmRuleVer> unapplied(Collection<MdmRuleVer> versions, LocalDateTime now) {
        return versions.stream().filter(v -> isUnapplied(v, now)).max(Comparator.comparing(MdmRuleVer::getVer));
    }

    /** 지금 적용 중인 RELEASED. 여럿이면(겹침은 공통 서비스가 막는다) VER 가 가장 큰 것. */
    public static Optional<MdmRuleVer> currentReleased(Collection<MdmRuleVer> versions, LocalDateTime now) {
        return versions.stream().filter(v -> isCurrentReleased(v, now)).max(Comparator.comparing(MdmRuleVer::getVer));
    }

    /**
     * 룰의 계산 상태(TSK-08-05 design §6.7, ADR-0002 D6) — 저장 CREATED 이면서 {@code APPLY_FROM <= now} 인 RELEASED 가 있으면 INUSE, 그 밖에는
     * 저장값. 공통 확정 서비스는 확정 시각에 apply_from 이 지났을 때만 저장 상태를 올리므로 미래 적용으로 첫 확정한 룰은 조회가 이 값을 쓴다.
     */
    public static String effectiveStatus(String storedStatus, Collection<MdmRuleVer> versions, LocalDateTime now) {
        boolean applied = versions.stream().anyMatch(v -> "RELEASED".equals(v.getStatus()) && v.getApplyFrom() != null
                && !v.getApplyFrom().isAfter(now));
        return "CREATED".equals(storedStatus) && applied ? "INUSE" : storedStatus;
    }

    /** 쓰기 경로 승격 대상 — 저장 CREATED 인데 계산 상태가 INUSE 다(design §6.7, I20). */
    public static boolean needsInUsePromotion(String storedStatus, Collection<MdmRuleVer> versions, LocalDateTime now) {
        return "CREATED".equals(storedStatus) && "INUSE".equals(effectiveStatus(storedStatus, versions, now));
    }

    /** RELEASED 가운데 VER 가 가장 큰 것(적용 시점과 무관 — 새 버전의 복사 원본, 세트 계산 관례 06:754). */
    public static Optional<MdmRuleVer> latestReleased(Collection<MdmRuleVer> versions) {
        return versions.stream().filter(v -> "RELEASED".equals(v.getStatus())).max(Comparator.comparing(MdmRuleVer::getVer));
    }
}
