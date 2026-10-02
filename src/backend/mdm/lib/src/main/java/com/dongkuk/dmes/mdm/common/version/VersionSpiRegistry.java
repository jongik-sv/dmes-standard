package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCancelCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
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
 */
@Component
public class VersionSpiRegistry {

    private final Map<VersionTarget, VersionConfirmCheckSpi> confirmChecks;
    private final Map<VersionTarget, VersionDraftDeletionSpi> draftDeletions;
    private final Map<VersionTarget, VersionConfirmCancelCheckSpi> cancelChecks;

    public VersionSpiRegistry(List<VersionConfirmCheckSpi> confirmChecks, List<VersionDraftDeletionSpi> draftDeletions,
                              List<VersionConfirmCancelCheckSpi> cancelChecks) {
        this.confirmChecks = byTarget(confirmChecks, VersionConfirmCheckSpi::target, "확정 검사 SPI");
        this.draftDeletions = byTarget(draftDeletions, VersionDraftDeletionSpi::target, "DRAFT 삭제 훅");
        this.cancelChecks = byTarget(cancelChecks, VersionConfirmCancelCheckSpi::target, "확정 취소 검사 SPI");
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
