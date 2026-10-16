package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionCoEditorSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCancelCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionReleasedChangeSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-03 design.md §3.1 L3 — target 마다 확정 검사 SPI·삭제 훅이 정확히 하나(D4, 불변 규칙 I14).
 * 둘이면 생성(기동) 실패, 없으면 조회 때 fail-closed.
 */
class VersionSpiRegistryTest {

    @Test
    void 같은_target_의_확정_검사_SPI_가_둘이면_생성이_실패한다() {
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> new VersionSpiRegistry(
                List.of(check(VersionTarget.MASTER_CODE), check(VersionTarget.MASTER_CODE)), List.of(), List.of(), List.of(), List.of()));
        assertTrue(e.getMessage().contains("MASTER_CODE"), e.getMessage());
    }

    @Test
    void 같은_target_의_삭제_훅이_둘이면_생성이_실패한다() {
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> new VersionSpiRegistry(
                List.of(), List.of(deletion(VersionTarget.BUSINESS_RULE), deletion(VersionTarget.BUSINESS_RULE)), List.of(), List.of(), List.of()));
        assertTrue(e.getMessage().contains("BUSINESS_RULE"), e.getMessage());
    }

    @Test
    void 등록되지_않은_target_의_확정_검사는_실패한다() {
        VersionSpiRegistry registry = new VersionSpiRegistry(List.of(check(VersionTarget.MASTER_CODE)), List.of(), List.of(), List.of(), List.of());
        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> registry.confirmCheck(VersionTarget.BUSINESS_RULE));
        assertTrue(e.getMessage().contains("BUSINESS_RULE"), e.getMessage());
    }

    @Test
    void 등록되지_않은_target_의_삭제_훅은_실패한다() {
        VersionSpiRegistry registry = new VersionSpiRegistry(List.of(), List.of(deletion(VersionTarget.MASTER_CODE)), List.of(), List.of(), List.of());
        IllegalStateException e = assertThrows(IllegalStateException.class,
                () -> registry.draftDeletion(VersionTarget.BUSINESS_RULE));
        assertTrue(e.getMessage().contains("BUSINESS_RULE"), e.getMessage());
    }

    @Test
    void 등록된_구현을_target_으로_찾는다() {
        VersionConfirmCheckSpi code = check(VersionTarget.MASTER_CODE);
        VersionConfirmCheckSpi rule = check(VersionTarget.BUSINESS_RULE);
        VersionDraftDeletionSpi codeHook = deletion(VersionTarget.MASTER_CODE);
        VersionSpiRegistry registry = new VersionSpiRegistry(List.of(code, rule), List.of(codeHook), List.of(), List.of(), List.of());
        assertSame(code, registry.confirmCheck(VersionTarget.MASTER_CODE));
        assertSame(rule, registry.confirmCheck(VersionTarget.BUSINESS_RULE));
        assertSame(codeHook, registry.draftDeletion(VersionTarget.MASTER_CODE));
    }

    @Test
    void 아무것도_없어도_생성은_된다() {
        // 운영 컨텍스트에는 아직 SPI 가 없다(TSK-06-05·08-05 전) — 기동은 되고 확정·삭제만 실패한다.
        VersionSpiRegistry registry = new VersionSpiRegistry(List.of(), List.of(), List.of(), List.of(), List.of());
        assertThrows(IllegalStateException.class, () -> registry.confirmCheck(VersionTarget.MASTER_CODE));
    }

    @Test
    void 확정_취소_검사는_선택이다_없으면_아무것도_하지_않고_둘이면_생성이_실패한다() {
        VersionSpiRegistry registry = new VersionSpiRegistry(List.of(), List.of(), List.of(), List.of(), List.of());
        registry.confirmCancelCheck(VersionTarget.BUSINESS_RULE)
                .afterConfirmCancel(new VersionRef(VersionTarget.BUSINESS_RULE, "1", java.math.BigDecimal.ONE));
        VersionConfirmCancelCheckSpi layout = cancelCheck(VersionTarget.LAYOUT);
        assertSame(layout, new VersionSpiRegistry(List.of(), List.of(), List.of(layout), List.of(), List.of()).confirmCancelCheck(VersionTarget.LAYOUT));
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> new VersionSpiRegistry(List.of(), List.of(),
                List.of(cancelCheck(VersionTarget.LAYOUT), cancelCheck(VersionTarget.LAYOUT)), List.of(), List.of()));
        assertTrue(e.getMessage().contains("LAYOUT"), e.getMessage());
    }

    @Test
    void 공동_편집자_SPI는_선택이다_없으면_empty_있으면_그_대상만_돌려주고_둘이면_생성이_실패한다() {
        assertTrue(new VersionSpiRegistry(List.of(), List.of(), List.of(), List.of(), List.of())
                .coEditor(VersionTarget.ERD_MODEL).isEmpty());
        VersionCoEditorSpi erd = coEditor(VersionTarget.ERD_MODEL);
        VersionSpiRegistry registry = new VersionSpiRegistry(List.of(), List.of(), List.of(), List.of(erd), List.of());
        assertSame(erd, registry.coEditor(VersionTarget.ERD_MODEL).orElseThrow());
        assertTrue(registry.coEditor(VersionTarget.MASTER_CODE).isEmpty());
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> new VersionSpiRegistry(List.of(), List.of(),
                List.of(), List.of(coEditor(VersionTarget.ERD_MODEL), coEditor(VersionTarget.ERD_MODEL)), List.of()));
        assertTrue(e.getMessage().contains("ERD_MODEL"), e.getMessage());
    }

    @Test
    void RELEASED_변경_SPI_조회는_fail_closed_이고_둘이면_생성이_실패한다() {
        IllegalStateException missing = assertThrows(IllegalStateException.class,
                () -> new VersionSpiRegistry(List.of(), List.of(), List.of(), List.of(), List.of()).releasedChange(VersionTarget.LAYOUT));
        assertTrue(missing.getMessage().contains("LAYOUT"), missing.getMessage());
        VersionReleasedChangeSpi layout = releasedChange(VersionTarget.LAYOUT);
        VersionSpiRegistry registry = new VersionSpiRegistry(List.of(), List.of(), List.of(), List.of(), List.of(layout));
        assertSame(layout, registry.releasedChange(VersionTarget.LAYOUT));
        assertThrows(IllegalStateException.class, () -> registry.releasedChange(VersionTarget.BUSINESS_RULE));
        IllegalStateException dup = assertThrows(IllegalStateException.class, () -> new VersionSpiRegistry(List.of(), List.of(),
                List.of(), List.of(), List.of(releasedChange(VersionTarget.LAYOUT), releasedChange(VersionTarget.LAYOUT))));
        assertTrue(dup.getMessage().contains("LAYOUT"), dup.getMessage());
    }

    private static VersionReleasedChangeSpi releasedChange(VersionTarget target) {
        return new VersionReleasedChangeSpi() {
            @Override
            public VersionTarget target() {
                return target;
            }

            @Override
            public void afterReleasedChange(VersionRef changed) {
                throw new AssertionError("불리지 않아야 한다");
            }
        };
    }

    private static VersionCoEditorSpi coEditor(VersionTarget target) {
        return new VersionCoEditorSpi() {
            @Override
            public VersionTarget target() {
                return target;
            }

            @Override
            public boolean isCoEditor(VersionRef draft, String userId) {
                return false;
            }
        };
    }

    private static VersionConfirmCancelCheckSpi cancelCheck(VersionTarget target) {
        return new VersionConfirmCancelCheckSpi() {
            @Override
            public VersionTarget target() {
                return target;
            }

            @Override
            public void afterConfirmCancel(VersionRef cancelled) {
                throw new AssertionError("불리지 않아야 한다");
            }
        };
    }

    private static VersionConfirmCheckSpi check(VersionTarget target) {
        return new VersionConfirmCheckSpi() {
            @Override
            public VersionTarget target() {
                return target;
            }

            @Override
            public VersionDiff diff(VersionRef draft) {
                return null;
            }

            @Override
            public ConfirmCheckResult check(ConfirmCheckRequest request) {
                return new ConfirmCheckResult(List.of(), List.of());
            }
        };
    }

    private static VersionDraftDeletionSpi deletion(VersionTarget target) {
        return new VersionDraftDeletionSpi() {
            @Override
            public VersionTarget target() {
                return target;
            }

            @Override
            public void beforeDraftDelete(VersionRef draft) {
            }
        };
    }
}
