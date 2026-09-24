package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.MdmMssqlServer;
import com.dongkuk.dmes.mdm.contract.common.MdmDialect;
import com.dongkuk.dmes.mdm.contract.common.MdmDialectResolver;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdIssuer;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdKind;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdRange;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-08-02 design §3.1 「DefaultMdmRuleIdIssuerMssqlTest」·I11 — SQLite 판과 같은 단언을 {@code UPDATE … OUTPUT inserted} 로 본다.
 *
 * <p>docker 가 필요하다. {@code :api:mssqlMigrationTest} 로만 돌고 test·testAll 에 들어가지 않는다(워커 게이트는 SQLite 판).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local-db")
class DefaultMdmRuleIdIssuerMssqlTest {

    static final String DB_URL = MdmMssqlServer.newDatabase("ruleid");

    @Autowired
    MdmRuleIdIssuer issuer;
    @Autowired
    MdmDialectResolver dialectResolver;
    @Autowired
    JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> DB_URL);
        registry.add("spring.datasource.username", MdmMssqlServer::user);
        registry.add("spring.datasource.password", MdmMssqlServer::password);
    }

    @BeforeEach
    void seed() {
        jdbc.update("DELETE FROM TB_MDM_RULE_ROW");
        jdbc.update("DELETE FROM TB_MDM_RULE_VAR");
        jdbc.update("DELETE FROM TB_MDM_RULE_VER");
        jdbc.update("DELETE FROM TB_MDM_RULE");
        jdbc.update("INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND) VALUES ('QLTY_GRD_JDG', N'품질', 'DECISION', 'MDM')");
        AuditHolder.setAudit(new CactusAudit("kim", "ruleEditMenu", "ruleEdit"));
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
    }

    @Test
    void 방언은_MSSQL_이다() {
        assertEquals(MdmDialect.MSSQL, dialectResolver.current());
    }

    @Test
    void 카운터_0_에서_셋을_받으면_1부터_3이고_다음_하나는_4다() {
        assertEquals(new MdmRuleIdRange("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 1, 3), issuer.issue("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 3));
        assertEquals(new MdmRuleIdRange("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 4, 4), issuer.issue("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 1));
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'");
        assertEquals(4, ((Number) row.get("LAST_ROW_ID")).intValue());
        assertEquals(0, ((Number) row.get("LAST_VAR_ID")).intValue());
        assertEquals(0, ((Number) row.get("LAST_CASE_ID")).intValue());
        assertEquals("kim", row.get("U_USR_ID"));
        assertEquals(2, ((Number) row.get("VER")).intValue());
    }

    @Test
    void 없는_룰은_INVALID_VALUE_다() {
        assertEquals(ErrorCode.INVALID_VALUE,
                assertThrows(BusinessException.class, () -> issuer.issue("NO_SUCH", MdmRuleIdKind.ROW, 1)).getErrorCode());
    }
}
