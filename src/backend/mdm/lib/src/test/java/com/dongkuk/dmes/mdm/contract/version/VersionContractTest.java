package com.dongkuk.dmes.mdm.contract.version;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-02 design.md §3.1 T2 — 버전 상태·상위 객체 상태·전이 표·row_version 규약 상수(불변 규칙 I1~I4).
 */
class VersionContractTest {

    @Test
    void 버전_상태는_원천_순서대로_정확히_5종이다() {
        assertEquals(List.of("DRAFT", "REQUESTED", "APPROVED", "RELEASED", "CANCELLED"),
                Arrays.stream(VersionStatus.values()).map(Enum::name).toList());
    }

    @Test
    void 상위_객체_상태는_정확히_3종이다() {
        assertEquals(List.of("CREATED", "INUSE", "DEPRECATED"),
                Arrays.stream(MaruObjectStatus.values()).map(Enum::name).toList());
    }

    @Test
    void 전이_표는_원천_7종과_담당자_확정_1종과_확정_취소_1종이다() {
        assertEquals(List.of("REQUEST", "REJECT", "APPROVE", "UNAPPROVE", "RELEASE", "CANCEL", "DELETE_DRAFT", "CONFIRM",
                        "REVERT_CONFIRM"),
                Arrays.stream(VersionTransition.values()).map(Enum::name).toList());

        assertTransition(VersionTransition.REQUEST, VersionStatus.DRAFT, VersionStatus.REQUESTED, false);
        assertTransition(VersionTransition.REJECT, VersionStatus.REQUESTED, VersionStatus.DRAFT, false);
        assertTransition(VersionTransition.APPROVE, VersionStatus.REQUESTED, VersionStatus.APPROVED, false);
        assertTransition(VersionTransition.UNAPPROVE, VersionStatus.APPROVED, VersionStatus.DRAFT, false);
        assertTransition(VersionTransition.RELEASE, VersionStatus.APPROVED, VersionStatus.RELEASED, false);
        assertTransition(VersionTransition.CANCEL, VersionStatus.RELEASED, VersionStatus.CANCELLED, false);
        assertTransition(VersionTransition.DELETE_DRAFT, VersionStatus.DRAFT, null, true);
        assertTransition(VersionTransition.CONFIRM, VersionStatus.DRAFT, VersionStatus.RELEASED, true);
        assertTransition(VersionTransition.REVERT_CONFIRM, VersionStatus.RELEASED, VersionStatus.DRAFT, true);
    }

    @Test
    void 이번_범위_전이는_담당자_확정과_DRAFT_삭제와_확정_취소_3종뿐이다() {
        Set<VersionTransition> inScope = Arrays.stream(VersionTransition.values())
                .filter(VersionTransition::inScope)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(VersionTransition.class)));
        assertEquals(EnumSet.of(VersionTransition.DELETE_DRAFT, VersionTransition.CONFIRM,
                VersionTransition.REVERT_CONFIRM), inScope);
    }

    @Test
    void 확정_취소는_철회가_아니라_DRAFT_로_돌아간다() {
        // D8 — 되돌린 자리에 다시 확정할 수 있어야 하므로 CANCELLED 가 아니라 DRAFT 다(ADR-0002 D4-1, TSK-02-01 D4-1).
        assertEquals(VersionStatus.DRAFT, VersionTransition.REVERT_CONFIRM.to());
        assertEquals(false, VersionTransition.CANCEL.inScope());
    }

    @Test
    void row_version_규약과_열린_끝_일시() {
        assertEquals("ROW_VERSION", VersionConventions.ROW_VERSION_COLUMN);
        assertEquals(0L, VersionConventions.INITIAL_ROW_VERSION);
        assertEquals(1L, VersionConventions.ROW_VERSION_STEP);
        assertEquals(LocalDateTime.of(9999, 12, 31, 0, 0, 0, 0), VersionConventions.OPEN_END);
    }

    @Test
    void 버전_대상은_04_마스터코드와_06_업무기준과_룰_세트다() {
        assertEquals(List.of("MASTER_CODE", "BUSINESS_RULE", "RULE_SET"),
                Arrays.stream(VersionTarget.values()).map(Enum::name).toList());
        assertEquals("TB_MDM_CODE_VER", VersionTarget.MASTER_CODE.versionTable());
        assertEquals(3, VersionTarget.MASTER_CODE.versionScale());
        assertEquals("TB_MDM_RULE_VER", VersionTarget.BUSINESS_RULE.versionTable());
        assertEquals(3, VersionTarget.BUSINESS_RULE.versionScale());
        assertEquals("TB_MDM_RULE_SET_VER", VersionTarget.RULE_SET.versionTable());
        assertEquals(3, VersionTarget.RULE_SET.versionScale());
    }

    @Test
    void diff_종류는_4종이다() {
        assertEquals(List.of("ADDED", "REMOVED", "CHANGED", "SAME"),
                Arrays.stream(DiffKind.values()).map(Enum::name).toList());
    }

    private static void assertTransition(VersionTransition t, VersionStatus from, VersionStatus to, boolean inScope) {
        assertEquals(from, t.from(), t + ".from");
        if (to == null) {
            assertNull(t.to(), t + ".to 는 행 삭제(null)여야 한다");
        } else {
            assertEquals(to, t.to(), t + ".to");
        }
        assertEquals(inScope, t.inScope(), t + ".inScope");
    }
}
