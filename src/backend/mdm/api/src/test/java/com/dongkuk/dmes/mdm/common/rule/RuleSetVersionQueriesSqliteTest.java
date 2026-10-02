package com.dongkuk.dmes.mdm.common.rule;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** D-144 2단계 — 세트 버전 읽기: 1.000·1.001·2.000 혼합의 정렬·표시 버전·멤버. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetVersionQueriesSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetVersionQueries queries;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.ruleSet(jdbc, "S_MIX", "혼합", "[\"R1\"]", "INUSE", 0);                     // 1.000 RELEASED 2000-01-01~
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-05-01 00:00:00' WHERE MARU_RULE_SET_ID = 'S_MIX'");
        DmeTestSupport.ruleSetVersion(jdbc, "S_MIX", "1.001", "MINOR", "RELEASED", "kim", "[\"R1\",\"R2\",\"R1\"]",
                "2026-05-01 00:00:00", "9999-12-31 00:00:00", 3);
        DmeTestSupport.ruleSetVersion(jdbc, "S_MIX", "2.000", "MAJOR", "DRAFT", "kim", "[\"R3\"]", null, null, 0);
        DmeTestSupport.ruleSet(jdbc, "S_ONE", "하나", "[]", "INUSE", 0);
    }

    @Test
    void versionsAreSortedByValueDescendingAndKeepMinorScale() {
        List<MdmRuleSetVer> vs = queries.versions("S_MIX");
        assertThat(vs).extracting(v -> v.getVer().toPlainString()).containsExactly("2.000", "1.001", "1.000");
        assertThat(vs.get(1).getVer().scale()).isEqualTo(3);
        assertThat(queries.find("S_MIX", new BigDecimal("1.001"))).isPresent();
        assertThat(queries.find("S_MIX", new BigDecimal("1"))).get().extracting(v -> v.getVer().toPlainString()).isEqualTo("1.000");
    }

    @Test
    void displayIsCurrentReleasedElseLargest() {
        List<MdmRuleSetVer> vs = queries.versions("S_MIX");
        assertThat(RuleSetVersionQueries.display(vs, LocalDateTime.of(2026, 4, 30, 23, 59, 59))).get()
                .extracting(v -> v.getVer().toPlainString()).isEqualTo("1.000");
        assertThat(RuleSetVersionQueries.display(vs, LocalDateTime.of(2026, 5, 1, 0, 0, 0))).get()
                .extracting(v -> v.getVer().toPlainString()).isEqualTo("1.001");
        jdbc.update("DELETE FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID = 'S_MIX' AND STATUS = 'RELEASED'");
        assertThat(RuleSetVersionQueries.display(queries.versions("S_MIX"), LocalDateTime.of(2026, 6, 1, 0, 0))).get()
                .extracting(v -> v.getVer().toPlainString()).isEqualTo("2.000");
    }

    @Test
    void membersDropDuplicatesInStoredOrderAndVersionsOfGroups() {
        MdmRuleSetVer minor = queries.find("S_MIX", new BigDecimal("1.001")).orElseThrow();
        assertThat(RuleSetVersionQueries.members(minor)).containsExactly("R1", "R2");
        Map<String, List<MdmRuleSetVer>> by = queries.versionsOf(List.of("S_MIX", "S_ONE", "S_NONE"));
        assertThat(by.get("S_MIX")).hasSize(3);
        assertThat(by.get("S_ONE")).hasSize(1);
        assertThat(by.get("S_NONE")).isEmpty();
    }

    @Test
    void releasedValidFromKeepsCurrentAndFutureReleasedOnly() {
        List<MdmRuleSetVer> vs = queries.versions("S_MIX");
        assertThat(RuleVersions.releasedValidFrom(vs, LocalDateTime.of(2026, 4, 1, 0, 0)))
                .extracting(v -> v.getVer().toPlainString()).containsExactly("1.000", "1.001");
        assertThat(RuleVersions.releasedValidFrom(vs, LocalDateTime.of(2026, 5, 1, 0, 0)))
                .extracting(v -> v.getVer().toPlainString()).containsExactly("1.001");
    }
}
