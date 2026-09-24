package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Comparator;
import java.util.Optional;
import java.util.Set;

/**
 * 룰 버전 목록에서 고르기(TSK-08-02 design §6.3.1·I4). 미적용 = DRAFT·REQUESTED·APPROVED·{@code APPLY_FROM > now} 인 RELEASED
 * ({@code VersionWriteGuard} 와 같은 정의), 현재 RELEASED = {@code APPLY_FROM <= now < APPLY_TO}. 버전 비교는 정수 VER 로 한다.
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

    /** RELEASED 가운데 VER 가 가장 큰 것(적용 시점과 무관 — 새 버전의 복사 원본, 세트 계산 관례 06:754). */
    public static Optional<MdmRuleVer> latestReleased(Collection<MdmRuleVer> versions) {
        return versions.stream().filter(v -> "RELEASED".equals(v.getStatus())).max(Comparator.comparing(MdmRuleVer::getVer));
    }
}
