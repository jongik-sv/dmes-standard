package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/** 레이아웃 버전 고르기 규칙(D-144 3단계). 버전 비교·정렬은 Java 에서만 한다(SQLite NUMERIC 친화도). 구간은 [APPLY_FROM, APPLY_TO). */
public final class LayoutVersions {

    private static final Comparator<MdmLayoutVer> BY_VER = Comparator.comparing(MdmLayoutVer::getVer);

    private LayoutVersions() {
    }

    /** 요청 업무 버전 문자열({@code "1.000"}) → 버전. 비거나 형식이 틀리면 INVALID_INPUT. */
    public static BigDecimal requireVer(String raw) {
        if (raw == null || raw.isBlank()) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "버전이 필요합니다", List.of());
        }
        try {
            return VersionNumbers.parse(raw);
        } catch (IllegalArgumentException e) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "버전 형식이 올바르지 않습니다: " + raw, List.of());
        }
    }

    /** DRAFT 저장의 기대 row_version. 없으면 INVALID_INPUT. */
    public static long requireRowVersion(Long raw) {
        if (raw == null) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "rowVersion 이 필요합니다", List.of());
        }
        return raw;
    }

    public static List<MdmLayoutVer> sortedDesc(Collection<MdmLayoutVer> versions) {
        return versions.stream().sorted(BY_VER.reversed()).toList();
    }

    public static Optional<MdmLayoutVer> releasedAt(Collection<MdmLayoutVer> versions, LocalDateTime t) {
        return versions.stream()
                .filter(v -> v.isReleased() && v.getApplyFrom() != null && v.getApplyTo() != null
                        && !v.getApplyFrom().isAfter(t) && t.isBefore(v.getApplyTo()))
                .max(BY_VER);
    }

    /**
     * EAI 표준 헤더를 시각 T 로 해석한다(D-144 K1, Ruling P3-15) — 헤더마다 T 에 유효한 RELEASED 버전의 {@code EAI_CODE} 가 그 EAI 를
     * 주장한다. 같은 EAI 를 여러 헤더가 주장하면 apply_from 이 늦은 쪽(나중에 전환한 쪽), 같으면 큰 헤더 ID 가 이긴다 — 새 헤더를 미래
     * 시각 F 에 확정하면 F 전에는 옛 헤더, F 부터 새 헤더이고, 확정취소하면 새 헤더 버전이 RELEASED 가 아니게 되어 저절로 옛 헤더로 돌아온다.
     * {@code TB_MDM_EAI.HEADER_LAYOUT_ID} 는 읽지 않는다(이행 전 값만 남은 옛 칼럼).
     *
     * @param headerVersions 헤더 ID → 그 헤더의 버전 행(RELEASED 만 있어도 된다)
     * @param t              판정 시각 — null 불가
     * @return EAI 코드 → 표준 헤더 ID
     */
    public static Map<String, Long> eaiHeadersAt(Map<Long, ? extends Collection<MdmLayoutVer>> headerVersions, LocalDateTime t) {
        Objects.requireNonNull(t, "t");
        Map<String, MdmLayoutVer> best = new HashMap<>();
        for (Map.Entry<Long, ? extends Collection<MdmLayoutVer>> e : headerVersions.entrySet()) {
            releasedAt(e.getValue(), t).filter(v -> v.getEaiCode() != null).ifPresent(v -> best.merge(v.getEaiCode(), v,
                    (a, b) -> CLAIM_ORDER.compare(a, b) >= 0 ? a : b));
        }
        Map<String, Long> out = new HashMap<>();
        best.forEach((eai, v) -> out.put(eai, v.getLayoutId()));
        return out;
    }

    /** 같은 EAI 를 주장하는 헤더 버전의 우선순위 — apply_from 이 늦을수록, 같으면 헤더 ID 가 클수록 앞선다. */
    private static final Comparator<MdmLayoutVer> CLAIM_ORDER = Comparator.comparing(MdmLayoutVer::getApplyFrom)
            .thenComparing(MdmLayoutVer::getLayoutId);

    public static Optional<MdmLayoutVer> draft(Collection<MdmLayoutVer> versions) {
        return versions.stream().filter(MdmLayoutVer::isDraft).max(BY_VER);
    }

    public static Optional<MdmLayoutVer> previousReleased(Collection<MdmLayoutVer> versions, BigDecimal ver) {
        return versions.stream().filter(v -> v.isReleased() && v.getVer().compareTo(ver) < 0).max(BY_VER);
    }

    public static Optional<MdmLayoutVer> latestReleased(Collection<MdmLayoutVer> versions) {
        return versions.stream().filter(MdmLayoutVer::isReleased).max(BY_VER);
    }

    /** 미적용 = DRAFT 이거나 apply_from 이 now 보다 뒤인 RELEASED(04:284). */
    public static boolean hasUnapplied(Collection<MdmLayoutVer> versions, LocalDateTime now) {
        return versions.stream().anyMatch(v -> v.isDraft()
                || v.isReleased() && v.getApplyFrom() != null && v.getApplyFrom().isAfter(now));
    }

    public static BigDecimal maxVer(Collection<MdmLayoutVer> versions) {
        return VersionNumbers.maxVer(versions.stream().map(MdmLayoutVer::getVer).toList());
    }

    /**
     * 화면 조회 버전 — 요청 버전이 있으면 그 버전(없으면 L11 {@link LayoutRejections#noVersion}), 비면 {@link #editTarget}. 버전이 하나도
     * 없으면 L11. layoutMng·headerMng view 가 같이 쓴다.
     */
    public static MdmLayoutVer select(long layoutId, Collection<MdmLayoutVer> versions, String requested, String me, LocalDateTime now) {
        if (requested != null && !requested.isBlank()) {
            BigDecimal ver = requireVer(requested);
            return versions.stream().filter(v -> VersionNumbers.same(v.getVer(), ver)).findFirst()
                    .orElseThrow(() -> LayoutRejections.noVersion(layoutId, ver));
        }
        if (versions.isEmpty()) {
            throw LayoutRejections.noVersion(layoutId, VersionNumbers.FIRST);
        }
        return editTarget(versions, me, now);
    }

    /** 화면이 열 버전 — 내 DRAFT → 남의 DRAFT → 지금 적용 중 RELEASED → 가장 큰 버전. */
    public static MdmLayoutVer editTarget(Collection<MdmLayoutVer> versions, String me, LocalDateTime now) {
        Optional<MdmLayoutVer> draft = draft(versions);
        if (draft.isPresent() && Objects.equals(draft.get().getOwnerId(), me)) {
            return draft.get();
        }
        return draft.or(() -> releasedAt(versions, now)).orElseGet(() -> versions.stream().max(BY_VER).orElseThrow());
    }

    /** DRAFT · CURRENT(지금 적용 중) · FUTURE(확정됐으나 미적용) · PAST(닫힌 구간). */
    public static String state(MdmLayoutVer v, LocalDateTime now) {
        if (v.isDraft()) {
            return "DRAFT";
        }
        if (v.getApplyFrom() != null && v.getApplyFrom().isAfter(now)) {
            return "FUTURE";
        }
        return v.getApplyTo() != null && !now.isBefore(v.getApplyTo()) ? "PAST" : "CURRENT";
    }
}
