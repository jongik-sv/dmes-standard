package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.version.VersionCoEditorSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCancelCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionReleasedChangeSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/**
 * 대상별 확정 검사 SPI·DRAFT 삭제 훅 등록부(TSK-01-03 B15, D4).
 *
 * <p>target 마다 정확히 하나. 같은 target 이 둘이면 생성(기동)이 실패하고, 없으면 그 target 의 확정·삭제가
 * {@link IllegalStateException} 으로 실패한다(fail-closed: 검사 없이 확정되는 일을 막는다, PRD AC-4).
 * 생성자는 하나만 둔다 — 등록된 구현이 없을 때 Spring 이 빈 목록을 넣어 준다.
 *
 * <p>확정 취소 검사({@link VersionConfirmCancelCheckSpi}, Ruling P3-23)는 선택이다 — 없으면 아무것도 하지 않는 기본 구현을 돌려준다. 같은
 * target 이 둘이면 마찬가지로 생성이 실패한다.
 *
 * <p>공동 편집자 SPI({@link VersionCoEditorSpi}, ERD 설계 스펙 D15)도 선택이다 — 없으면 {@link Optional#empty()} 이고 그 target 의
 * DRAFT 는 소유자만 쓴다(기존 동작). 이 SPI 는 소유자가 있는 DRAFT 에만 불리고(주인 없는 DRAFT 는 모두 MDM003), 공동 편집자 행은 소유자
 * 넘기기·재선점 뒤에도 DRAFT 버전에 이어진다(Task 7 판정 R7-1·R7-2).
 *
 * <p>「RELEASED 변경」 SPI({@link VersionReleasedChangeSpi}, BE 리팩토링 2회차 C4)는 레이아웃에 반드시 등록한다. 조회는 fail-closed 다 —
 * 등록이 없는 대상을 조회하면 {@link IllegalStateException}. 공통 서비스는 레이아웃에만 이 SPI 를 부르므로 다른 대상에 등록해도 불리지
 * 않는다. 같은 target 이 둘이면 생성이 실패한다.
 */
@Component
public class VersionSpiRegistry {

    private final Map<VersionTarget, VersionConfirmCheckSpi> confirmChecks;
    private final Map<VersionTarget, VersionDraftDeletionSpi> draftDeletions;
    private final Map<VersionTarget, VersionConfirmCancelCheckSpi> cancelChecks;
    private final Map<VersionTarget, VersionCoEditorSpi> coEditors;
    private final Map<VersionTarget, VersionReleasedChangeSpi> releasedChanges;

    public VersionSpiRegistry(List<VersionConfirmCheckSpi> confirmChecks, List<VersionDraftDeletionSpi> draftDeletions,
                              List<VersionConfirmCancelCheckSpi> cancelChecks, List<VersionCoEditorSpi> coEditors,
                              List<VersionReleasedChangeSpi> releasedChanges) {
        this.confirmChecks = byTarget(confirmChecks, VersionConfirmCheckSpi::target, "확정 검사 SPI");
        this.draftDeletions = byTarget(draftDeletions, VersionDraftDeletionSpi::target, "DRAFT 삭제 훅");
        this.cancelChecks = byTarget(cancelChecks, VersionConfirmCancelCheckSpi::target, "확정 취소 검사 SPI");
        this.coEditors = byTarget(coEditors, VersionCoEditorSpi::target, "공동 편집자 SPI");
        this.releasedChanges = byTarget(releasedChanges, VersionReleasedChangeSpi::target, "RELEASED 변경 SPI");
    }

    /** 공동 편집자 판정 — 선택 SPI. 없으면 empty(소유자만 쓴다). */
    public Optional<VersionCoEditorSpi> coEditor(VersionTarget target) {
        return Optional.ofNullable(coEditors.get(target));
    }

    /** 확정 취소 검사 — 등록이 없으면 아무것도 하지 않는다(선택 SPI). */
    public VersionConfirmCancelCheckSpi confirmCancelCheck(VersionTarget target) {
        VersionConfirmCancelCheckSpi spi = cancelChecks.get(target);
        return spi != null ? spi : new VersionConfirmCancelCheckSpi() {
            @Override
            public VersionTarget target() {
                return target;
            }

            @Override
            public void afterConfirmCancel(VersionRef cancelled) {
                // 기본 — 검사 없음
            }
        };
    }

    public VersionConfirmCheckSpi confirmCheck(VersionTarget target) {
        VersionConfirmCheckSpi spi = confirmChecks.get(target);
        if (spi == null) {
            throw new IllegalStateException("확정 검사 SPI 가 등록되지 않았습니다: " + target);
        }
        return spi;
    }

    /** RELEASED 변경 SPI — 등록이 없는 대상을 조회하면 실패한다(fail-closed, 메타 기록 누락 방지). 공통 서비스는 LAYOUT 에만 부른다. */
    public VersionReleasedChangeSpi releasedChange(VersionTarget target) {
        VersionReleasedChangeSpi spi = releasedChanges.get(target);
        if (spi == null) {
            throw new IllegalStateException("RELEASED 변경 SPI 가 등록되지 않았습니다: " + target);
        }
        return spi;
    }

    public VersionDraftDeletionSpi draftDeletion(VersionTarget target) {
        VersionDraftDeletionSpi hook = draftDeletions.get(target);
        if (hook == null) {
            throw new IllegalStateException("DRAFT 삭제 훅이 등록되지 않았습니다: " + target);
        }
        return hook;
    }

    private static <T> Map<VersionTarget, T> byTarget(List<T> items, Function<T, VersionTarget> targetOf, String kind) {
        Map<VersionTarget, T> map = new EnumMap<>(VersionTarget.class);
        for (T item : items) {
            VersionTarget target = targetOf.apply(item);
            T previous = map.putIfAbsent(target, item);
            if (previous != null) {
                throw new IllegalStateException(kind + " 가 같은 대상에 둘 있습니다: " + target + " ("
                        + previous.getClass().getName() + ", " + item.getClass().getName() + ")");
            }
        }
        return map;
    }
}
