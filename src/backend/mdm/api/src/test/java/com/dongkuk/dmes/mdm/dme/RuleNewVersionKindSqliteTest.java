package com.dongkuk.dmes.mdm.dme;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngViewResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.service.RuleMngService;
import com.dongkuk.dmes.mdm.dme.ruleMng.service.RuleVersionService;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 룰 새 버전의 종류(MAJOR/MINOR) 선택과 view 의 새 버전 가능 여부 플래그(D-144, Task 6). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleNewVersionKindSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    RuleVersionService ruleVersion;
    @Autowired
    RuleMngService ruleMng;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
    }

    private void releasedRule(String id, String ver) {
        DmeTestSupport.rule(jdbc, id, "룰 " + id, "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, id, new BigDecimal(ver), ver.endsWith(".000") ? "MAJOR" : "MINOR", "FIRST",
                "2026-01-01 00:00:00", null);
    }

    private String verKind(String id, String ver) {
        return jdbc.queryForObject("SELECT VER_KIND FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = ? AND VER = ?", String.class, id,
                new BigDecimal(ver));
    }

    private RuleMngViewResult view(String id) {
        RuleMngViewRequest req = new RuleMngViewRequest();
        req.setMaruRuleId(id);
        return ruleMng.view(req);
    }

    @Test
    void minorAddsOneThousandthAndRecordsKind() {
        releasedRule("R_K", "2.004");
        var result = ruleVersion.newVersion(request("R_K", "MINOR"));
        assertThat(result.getVer()).isEqualTo("2.005");
        assertThat(result.getVerKind()).isEqualTo("MINOR");
        assertThat(verKind("R_K", "2.005")).isEqualTo("MINOR");
    }

    @Test
    void majorFloorsAndAddsOne() {
        releasedRule("R_K2", "2.004");
        var result = ruleVersion.newVersion(request("R_K2", "MAJOR"));
        assertThat(result.getVer()).isEqualTo("3.000");
        assertThat(verKind("R_K2", "3.000")).isEqualTo("MAJOR");
    }

    @Test
    void missingKindDefaultsToMajor() {
        releasedRule("R_K3", "1.000");
        assertThat(ruleVersion.newVersion(request("R_K3", null)).getVer()).isEqualTo("2.000");
        releasedRule("R_K3B", "1.000");
        assertThat(ruleVersion.newVersion(request("R_K3B", " ")).getVer()).isEqualTo("2.000");
    }

    @Test
    void invalidKindIsRejected() {
        releasedRule("R_K6", "1.000");
        assertThatThrownBy(() -> ruleVersion.newVersion(request("R_K6", "PATCH"))).hasMessageContaining("버전 종류는 MAJOR 또는 MINOR 입니다");
    }

    @Test
    void minorAt999IsRejectedAndFlaggedOff() {
        releasedRule("R_K4", "1.999");
        var flags = view("R_K4").getFlags();
        assertThat(flags.isCanNewMinor()).isFalse();
        assertThat(flags.getNextMinor()).isNull();
        assertThat(flags.isCanNewMajor()).isTrue();
        assertThat(flags.getNextMajor()).isEqualTo("2.000");
        assertThatThrownBy(() -> ruleVersion.newVersion(request("R_K4", "MINOR"))).hasMessageContaining("major 를 올리십시오");
    }

    @Test
    void flagsOnWhenNoUnappliedVersion() {
        releasedRule("R_K7", "1.000");
        var flags = view("R_K7").getFlags();
        assertThat(flags.isCanNewMajor()).isTrue();
        assertThat(flags.isCanNewMinor()).isTrue();
        assertThat(flags.getNextMajor()).isEqualTo("2.000");
        assertThat(flags.getNextMinor()).isEqualTo("1.001");
    }

    @Test
    void flagsOffWhileUnappliedVersionExists() {
        releasedRule("R_K5", "1.000");
        DmeTestSupport.pending(jdbc, "R_K5", new BigDecimal("1.001"), "MINOR", "DRAFT", "kim", "FIRST", new BigDecimal("1.000"));
        var flags = view("R_K5").getFlags();
        assertThat(flags.isCanNewMajor()).isFalse();
        assertThat(flags.isCanNewMinor()).isFalse();
        assertThat(flags.getNextMajor()).isNull();
        assertThat(flags.getNextMinor()).isNull();
    }

    @Test
    void ruleWithoutVersionsAllowsOnlyFirstMajor() {
        DmeTestSupport.rule(jdbc, "R_K8", "룰 R_K8", "DECISION", "CREATED");
        var flags = view("R_K8").getFlags();
        assertThat(flags.isCanNewMajor()).isTrue();
        assertThat(flags.getNextMajor()).isEqualTo("1.000");
        assertThat(flags.isCanNewMinor()).isFalse();
        assertThat(flags.getNextMinor()).isNull();
        assertThatThrownBy(() -> ruleVersion.newVersion(request("R_K8", "MINOR"))).hasMessageContaining("버전이 없으면 major 만");
        var result = ruleVersion.newVersion(request("R_K8", "MAJOR"));
        assertThat(result.getVer()).isEqualTo("1.000");
        assertThat(verKind("R_K8", "1.000")).isEqualTo("MAJOR");
    }

    private static RuleVersionRequest request(String id, String kind) {
        RuleVersionRequest r = new RuleVersionRequest();
        r.setMaruRuleId(id);
        r.setVerKind(kind);
        return r;
    }
}
