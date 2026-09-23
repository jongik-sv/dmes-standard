package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-03 design.md §3.1 L6 — 실제 대상 테이블 명세(B12). 감사 카운터 칼럼은 잠정값 null 이다(D2):
 * TSK-06-01·08-01 이 감사 VER 와 업무 VER 의 이름 충돌(F25)을 푼 뒤 이 단언과 명세를 함께 고친다.
 */
class DefaultVersionTableRegistryTest {

    private final DefaultVersionTableRegistry registry = new DefaultVersionTableRegistry();

    @Test
    void 마스터코드_명세() {
        VersionTableSpec spec = registry.spec(VersionTarget.MASTER_CODE);
        assertEquals(new VersionTableSpec("TB_MDM_CODE_VER", "MARU_CODE_ID", "VER", "TB_MDM_CODE", "MARU_CODE_ID", null), spec);
        assertEquals(VersionTarget.MASTER_CODE.versionTable(), spec.versionTable());
    }

    @Test
    void 업무기준_명세() {
        VersionTableSpec spec = registry.spec(VersionTarget.BUSINESS_RULE);
        assertEquals(new VersionTableSpec("TB_MDM_RULE_VER", "MARU_RULE_ID", "VER", "TB_MDM_RULE", "MARU_RULE_ID", null), spec);
        assertEquals(VersionTarget.BUSINESS_RULE.versionTable(), spec.versionTable());
    }

    @Test
    void 감사_카운터_칼럼은_잠정값_null_이다() {
        for (VersionTarget target : VersionTarget.values()) {
            assertNull(registry.spec(target).auditCounterColumn(), target.name());
        }
    }
}
