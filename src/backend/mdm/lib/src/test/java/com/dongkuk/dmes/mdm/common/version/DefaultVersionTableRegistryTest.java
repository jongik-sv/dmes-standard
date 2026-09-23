package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-03 design.md §3.1 L6 — 실제 대상 테이블 명세(B12). 감사 카운터는 decisions D-034 대로 버전 테이블이
 * {@code AUD_VER}, 부모 테이블이 {@code VER} 이고 업무 버전 칼럼은 {@code VER} 그대로다(docs/mdm/erd/04·06 DDL).
 */
class DefaultVersionTableRegistryTest {

    private final DefaultVersionTableRegistry registry = new DefaultVersionTableRegistry();

    @Test
    void 마스터코드_명세() {
        VersionTableSpec spec = registry.spec(VersionTarget.MASTER_CODE);
        assertEquals(new VersionTableSpec("TB_MDM_CODE_VER", "MARU_CODE_ID", "VER", "TB_MDM_CODE", "MARU_CODE_ID", "AUD_VER", "VER"), spec);
        assertEquals(VersionTarget.MASTER_CODE.versionTable(), spec.versionTable());
    }

    @Test
    void 업무기준_명세() {
        VersionTableSpec spec = registry.spec(VersionTarget.BUSINESS_RULE);
        assertEquals(new VersionTableSpec("TB_MDM_RULE_VER", "MARU_RULE_ID", "VER", "TB_MDM_RULE", "MARU_RULE_ID", "AUD_VER", "VER"), spec);
        assertEquals(VersionTarget.BUSINESS_RULE.versionTable(), spec.versionTable());
    }

    @Test
    void 감사_카운터는_버전_테이블_AUD_VER_부모_VER_이고_업무_버전_칼럼은_VER_다() {
        for (VersionTarget target : VersionTarget.values()) {
            VersionTableSpec spec = registry.spec(target);
            assertEquals("AUD_VER", spec.auditCounterColumn(), target.name());
            assertEquals("VER", spec.parentAuditCounterColumn(), target.name());
            assertEquals("VER", spec.versionColumn(), target.name());
        }
    }
}
