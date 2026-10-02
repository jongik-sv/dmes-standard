package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-08-05 design §3.1 「RuleVersionsEffectiveStatusTest」(I18) — 룰의 계산 상태. 저장 CREATED 이면서 {@code applyFrom <= now} 인
 * RELEASED 가 있으면 INUSE(경계 포함, ADR-0002 D6), 그 밖에는 저장값.
 */
class RuleVersionsEffectiveStatusTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 15, 9, 0, 0);

    private static MdmRuleVer ver(int ver, String status, LocalDateTime applyFrom) {
        MdmRuleVer v = new MdmRuleVer("R", BigDecimal.valueOf(ver).setScale(3), VersionKind.MAJOR, null);
        v.setStatus(status);
        v.setApplyFrom(applyFrom);
        return v;
    }

    @Test
    void ES1_저장_CREATED_에_적용된_RELEASED_가_있으면_INUSE_다() {
        assertEquals("INUSE", RuleVersions.effectiveStatus("CREATED", List.of(ver(1, "RELEASED", NOW.minusDays(1))), NOW));
        assertEquals("INUSE", RuleVersions.effectiveStatus("CREATED", List.of(ver(1, "RELEASED", NOW)), NOW), "경계 applyFrom == now 는 적용된 것이다");
        assertEquals("INUSE", RuleVersions.effectiveStatus("CREATED",
                List.of(ver(2, "DRAFT", null), ver(1, "RELEASED", NOW.minusSeconds(1))), NOW));
    }

    @Test
    void ES2_RELEASED_가_미래이거나_없으면_CREATED_다() {
        assertEquals("CREATED", RuleVersions.effectiveStatus("CREATED", List.of(ver(1, "RELEASED", NOW.plusSeconds(1))), NOW));
        assertEquals("CREATED", RuleVersions.effectiveStatus("CREATED", List.of(ver(1, "DRAFT", null)), NOW));
        assertEquals("CREATED", RuleVersions.effectiveStatus("CREATED", List.of(), NOW));
        assertEquals("CREATED", RuleVersions.effectiveStatus("CREATED", List.of(ver(1, "APPROVED", NOW.minusDays(1))), NOW),
                "RELEASED 가 아닌 버전의 적용 시작은 보지 않는다");
    }

    @Test
    void ES3_저장_INUSE_DEPRECATED_는_그대로_돌려준다() {
        List<MdmRuleVer> none = List.of();
        List<MdmRuleVer> applied = List.of(ver(1, "RELEASED", NOW.minusDays(1)));
        assertEquals("INUSE", RuleVersions.effectiveStatus("INUSE", none, NOW));
        assertEquals("DEPRECATED", RuleVersions.effectiveStatus("DEPRECATED", applied, NOW));
        assertEquals("INUSE", RuleVersions.effectiveStatus("INUSE", applied, NOW));
    }
}
