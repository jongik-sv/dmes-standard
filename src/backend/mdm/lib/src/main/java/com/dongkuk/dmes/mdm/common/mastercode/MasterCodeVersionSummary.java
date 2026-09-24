package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.contract.version.MaruObjectStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 마루 코드 버전 행 목록의 계산값(TSK-06-02 design.md §6.3, 불변 규칙 I17·I18, 원천 04 「버전 상태와 적용시점」).
 *
 * <p>현재 버전·배포 대기·미적용·표시 상태는 저장 칼럼 없이 {@code now} 기준으로 계산한다. 미적용 정의는 공통 서비스
 * {@code VersionPreconditions.isUnapplied}(package-private)와 같은 식이다: DRAFT, 또는 {@code applyFrom} 이 now 보다 뒤인
 * RELEASED. 경계({@code applyFrom == now})는 적용됨.
 */
public final class MasterCodeVersionSummary {

    static final String NONE_LABEL = "없음";
    static final String UNCONFIRMED_LABEL = "미확정";
    static final String PENDING_PREFIX = "배포 대기 ";

    private MasterCodeVersionSummary() {
    }

    /** TB_MDM_CODE_VER 한 행(조회 모델이 읽은 값). */
    public record VerRow(BigDecimal ver, String verKind, String status, String ownerId, LocalDateTime applyFrom,
                         LocalDateTime applyTo, LocalDateTime releasedAt, BigDecimal restoredFrom, long rowVersion,
                         String description) {
    }

    /**
     * @param currentVer        {@code applyFrom ≤ now < applyTo} 인 RELEASED 번호(없으면 null)
     * @param pending           현재 버전이 없고 RELEASED 가 있음(모두 미래 적용)
     * @param unapplied         미적용 행(ver 오름차순)
     * @param effectiveStatus   표시 상태 — 저장 CREATED 이고 적용된 RELEASED 가 있으면 INUSE
     * @param maxVer            모든 행의 최대 번호(채번 기준, 없으면 null)
     * @param currentAppliedVer 현재 적용 버전 번호 — 계층 칸 줄이기 검사 기준(I19)
     */
    public record Summary(BigDecimal currentVer, String currentVerLabel, boolean pending, List<VerRow> unapplied,
                          String unappliedLabel, String effectiveStatus, BigDecimal maxVer, BigDecimal currentAppliedVer) {
    }

    public static Summary summarize(List<VerRow> rows, String storedStatus, LocalDateTime now) {
        VerRow current = null;
        BigDecimal maxReleased = null;
        boolean anyApplied = false;
        List<VerRow> unapplied = new ArrayList<>();
        for (VerRow row : rows) {
            if (isUnapplied(row, now)) {
                unapplied.add(row);
            }
            if (isReleased(row)) {
                maxReleased = maxReleased == null || row.ver().compareTo(maxReleased) > 0 ? row.ver() : maxReleased;
                if (row.applyFrom() != null && !row.applyFrom().isAfter(now)) {
                    anyApplied = true;
                    if (row.applyTo() == null || now.isBefore(row.applyTo())) {
                        current = current == null || row.ver().compareTo(current.ver()) > 0 ? row : current;
                    }
                }
            }
        }
        unapplied.sort(Comparator.comparing(VerRow::ver));

        BigDecimal currentVer = current == null ? null : current.ver();
        boolean pending = current == null && maxReleased != null;
        String currentLabel = current != null
                ? MasterCodeVersionNumbers.label(currentVer)
                : pending ? PENDING_PREFIX + MasterCodeVersionNumbers.label(maxReleased) : UNCONFIRMED_LABEL;
        String unappliedLabel = unapplied.isEmpty()
                ? NONE_LABEL
                : unapplied.stream().map(r -> MasterCodeVersionNumbers.label(r.ver()) + " " + r.status())
                        .collect(Collectors.joining(", "));
        String effective = MaruObjectStatus.CREATED.name().equals(storedStatus) && anyApplied
                ? MaruObjectStatus.INUSE.name()
                : storedStatus;
        BigDecimal max = MasterCodeVersionNumbers.maxVer(rows.stream().map(VerRow::ver).toList());
        return new Summary(currentVer, currentLabel, pending, List.copyOf(unapplied), unappliedLabel, effective, max,
                currentVer);
    }

    /** DRAFT, 또는 applyFrom 이 now 보다 뒤인 RELEASED. 경계 now 는 적용됨(I5). */
    public static boolean isUnapplied(VerRow row, LocalDateTime now) {
        if (VersionStatus.DRAFT.name().equals(row.status())) {
            return true;
        }
        return isReleased(row) && row.applyFrom() != null && row.applyFrom().isAfter(now);
    }

    private static boolean isReleased(VerRow row) {
        return VersionStatus.RELEASED.name().equals(row.status());
    }
}
