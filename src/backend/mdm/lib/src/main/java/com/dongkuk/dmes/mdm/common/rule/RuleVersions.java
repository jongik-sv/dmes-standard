package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.version.VersionedRow;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * 룰·룰 세트 버전 목록에서 고르기(TSK-08-02 design §6.3.1·I4, D-144 2단계). 미적용 = DRAFT·REQUESTED·APPROVED·{@code APPLY_FROM > now} 인
 * RELEASED ({@code VersionWriteGuard} 와 같은 정의), 현재 RELEASED = {@code APPLY_FROM <= now < APPLY_TO}. 버전 비교는 scale 3 VER 의
 * {@code compareTo} 로 한다(D-144). 입력은 {@link VersionedRow}(룰 버전·세트 버전 엔티티).
 */
public final class RuleVersions {

    private static final Set<String> PENDING_STATUSES = Set.of("DRAFT", "REQUESTED", "APPROVED");

    private RuleVersions() {
    }

    public static <T extends VersionedRow> boolean isUnapplied(T v, LocalDateTime now) {
        return PENDING_STATUSES.contains(v.getStatus())
                || ("RELEASED".equals(v.getStatus()) && v.getApplyFrom() != null && v.getApplyFrom().isAfter(now));
    }

    public static <T extends VersionedRow> boolean isCurrentReleased(T v, LocalDateTime now) {
        return "RELEASED".equals(v.getStatus()) && v.getApplyFrom() != null && !v.getApplyFrom().isAfter(now)
                && (v.getApplyTo() == null || now.isBefore(v.getApplyTo()));
    }

    /** 미적용 버전 가운데 VER 가 가장 큰 것. */
    public static <T extends VersionedRow> Optional<T> unapplied(Collection<T> versions, LocalDateTime now) {
        return versions.stream().filter(v -> isUnapplied(v, now)).max(Comparator.comparing(VersionedRow::getVer));
    }

    /** 지금 적용 중인 RELEASED. 여럿이면(겹침은 공통 서비스가 막는다) VER 가 가장 큰 것. */
    public static <T extends VersionedRow> Optional<T> currentReleased(Collection<T> versions, LocalDateTime now) {
        return versions.stream().filter(v -> isCurrentReleased(v, now)).max(Comparator.comparing(VersionedRow::getVer));
    }

    /** 지금 적용 중인 RELEASED, 없으면 VER 가 가장 큰 버전(상태 무관) — 세트 화면의 "표시 버전"(D-144 2단계 J11). */
    public static <T extends VersionedRow> Optional<T> currentOrLatest(Collection<T> versions, LocalDateTime now) {
        Optional<T> current = currentReleased(versions, now);
        return current.isPresent() ? current : versions.stream().max(Comparator.comparing(VersionedRow::getVer));
    }

    /**
     * {@code at} 이후에 유효한 RELEASED — 지금 구간이 {@code at} 을 덮거나 {@code at} 뒤에 시작하는 것({@code APPLY_TO > at}). VER 오름차순.
     * 룰 확정 때 세트 순서 검사가 볼 세트 버전들(스펙 §6)을 고른다.
     */
    public static <T extends VersionedRow> List<T> releasedValidFrom(Collection<T> versions, LocalDateTime at) {
        return versions.stream()
                .filter(v -> "RELEASED".equals(v.getStatus()) && v.getApplyFrom() != null
                        && (v.getApplyTo() == null || v.getApplyTo().isAfter(at)))
                .sorted(Comparator.comparing(VersionedRow::getVer))
                .toList();
    }

    /**
     * 룰의 계산 상태(TSK-08-05 design §6.7, ADR-0002 D6) — 저장 CREATED 이면서 {@code APPLY_FROM <= now} 인 RELEASED 가 있으면 INUSE, 그 밖에는
     * 저장값. 공통 확정 서비스는 확정 시각에 apply_from 이 지났을 때만 저장 상태를 올리므로 미래 적용으로 첫 확정한 룰은 조회가 이 값을 쓴다.
     */
    public static <T extends VersionedRow> String effectiveStatus(String storedStatus, Collection<T> versions, LocalDateTime now) {
        boolean applied = versions.stream().anyMatch(v -> "RELEASED".equals(v.getStatus()) && v.getApplyFrom() != null
                && !v.getApplyFrom().isAfter(now));
        return "CREATED".equals(storedStatus) && applied ? "INUSE" : storedStatus;
    }

    /** 쓰기 경로 승격 대상 — 저장 CREATED 인데 계산 상태가 INUSE 다(design §6.7, I20). */
    public static <T extends VersionedRow> boolean needsInUsePromotion(String storedStatus, Collection<T> versions, LocalDateTime now) {
        return "CREATED".equals(storedStatus) && "INUSE".equals(effectiveStatus(storedStatus, versions, now));
    }

    /** RELEASED 가운데 VER 가 가장 큰 것(적용 시점과 무관 — 새 버전의 복사 원본, 세트 계산 관례 06:754). */
    public static <T extends VersionedRow> Optional<T> latestReleased(Collection<T> versions) {
        return versions.stream().filter(v -> "RELEASED".equals(v.getStatus())).max(Comparator.comparing(VersionedRow::getVer));
    }
}
