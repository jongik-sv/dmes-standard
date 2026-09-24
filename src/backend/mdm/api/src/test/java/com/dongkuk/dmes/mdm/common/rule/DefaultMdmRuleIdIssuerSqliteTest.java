package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdIssuer;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdKind;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdRange;
import com.dongkuk.oasis.audit.AuditHolder;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-08-02 design §3.1 「DefaultMdmRuleIdIssuerSqliteTest」·I11 — 발급은 결과 집합을 돌려주는 단일 UPDATE 한 문이다.
 *
 * <p>실측(규칙표 #1, SQLite 3.45 / sqlite-jdbc 3.45.3 / Hibernate 7.0): {@code UPDATE … RETURNING} 을 JPA 네이티브
 * {@code getResultList()} 로 부르면 Hibernate 가 {@code executeQuery} 로 실행해 한 행 한 칸(카운터 이후 값, {@code Integer})을
 * 돌려준다. 트랜잭션 없이 부르면 자동 커밋으로 끝나므로 구현은 {@code TransactionTemplate}(REQUIRED)으로 감싼다.
 * 한 문인지는 Hibernate {@link StatementInspector} 로 발급 한 번에 나간 SQL 을 세어 확인한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class DefaultMdmRuleIdIssuerSqliteTest {

    @TempDir
    static Path tempDir;

    @Autowired
    MdmRuleIdIssuer issuer;
    @Autowired
    JdbcTemplate jdbc;

    /** 발급 한 번에 나간 SQL 기록. */
    public static final class RecordingInspector implements StatementInspector {
        static final List<String> SQL = Collections.synchronizedList(new ArrayList<>());

        @Override
        public String inspect(String sql) {
            SQL.add(sql);
            return sql;
        }
    }

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-rule-id-issuer-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
        registry.add("spring.jpa.properties.hibernate.session_factory.statement_inspector", RecordingInspector.class::getName);
    }

    @BeforeEach
    void seed() {
        jdbc.update("DELETE FROM TB_MDM_RULE_ROW");
        jdbc.update("DELETE FROM TB_MDM_RULE_VAR");
        jdbc.update("DELETE FROM TB_MDM_RULE_VER");
        jdbc.update("DELETE FROM TB_MDM_RULE");
        jdbc.update("INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND) VALUES ('QLTY_GRD_JDG', '품질', 'DECISION', 'MDM')");
        AuditHolder.setAudit(new CactusAudit("kim", "ruleEditMenu", "ruleEdit"));
        RecordingInspector.SQL.clear();
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
    }

    @Test
    void 카운터_0_에서_셋을_받으면_1부터_3이고_다음_하나는_4다() {
        assertEquals(new MdmRuleIdRange("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 1, 3), issuer.issue("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 3));
        assertEquals(new MdmRuleIdRange("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 4, 4), issuer.issue("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 1));
        Map<String, Object> row = rule();
        assertEquals(4, ((Number) row.get("LAST_ROW_ID")).intValue());
        assertEquals(0, ((Number) row.get("LAST_VAR_ID")).intValue());
        assertEquals(0, ((Number) row.get("LAST_CASE_ID")).intValue());
    }

    @Test
    void 종류마다_자기_카운터만_올린다() {
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 5, LAST_ROW_ID = 4, LAST_CASE_ID = 1");
        assertEquals(new MdmRuleIdRange("QLTY_GRD_JDG", MdmRuleIdKind.VAR, 6, 7), issuer.issue("QLTY_GRD_JDG", MdmRuleIdKind.VAR, 2));
        assertEquals(new MdmRuleIdRange("QLTY_GRD_JDG", MdmRuleIdKind.CASE, 2, 2), issuer.issue("QLTY_GRD_JDG", MdmRuleIdKind.CASE, 1));
        Map<String, Object> row = rule();
        assertEquals(7, ((Number) row.get("LAST_VAR_ID")).intValue());
        assertEquals(4, ((Number) row.get("LAST_ROW_ID")).intValue());
        assertEquals(2, ((Number) row.get("LAST_CASE_ID")).intValue());
    }

    @Test
    void 감사_칼럼을_쓰고_감사_카운터_VER_를_올린다() {
        issuer.issue("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 1);
        issuer.issue("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 1);
        Map<String, Object> row = rule();
        assertEquals("kim", row.get("U_USR_ID"));
        assertEquals("ruleEdit", row.get("U_SVC_ID"));
        assertEquals("ruleEditMenu", row.get("U_PGM_ID"));
        assertTrue(row.get("U_AT") != null, "U_AT");
        assertEquals(2, ((Number) row.get("VER")).intValue());
    }

    @Test
    void 발급은_결과를_돌려주는_UPDATE_한_문이다() {
        issuer.issue("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 2);
        List<String> touching = RecordingInspector.SQL.stream().filter(s -> s.toUpperCase().contains("TB_MDM_RULE")).toList();
        assertEquals(1, touching.size(), touching.toString());
        String sql = touching.get(0).toUpperCase();
        assertTrue(sql.startsWith("UPDATE TB_MDM_RULE ") && sql.contains("RETURNING LAST_ROW_ID"), sql);
    }

    @Test
    void 없는_룰은_INVALID_VALUE_다() {
        BusinessException e = assertThrows(BusinessException.class, () -> issuer.issue("NO_SUCH", MdmRuleIdKind.ROW, 1));
        assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode());
        assertTrue(e.getMessage().contains("NO_SUCH"), e.getMessage());
    }

    @Test
    void count_가_1보다_작으면_IllegalArgumentException_이고_카운터는_그대로다() {
        assertInstanceOf(IllegalArgumentException.class, assertThrows(RuntimeException.class, () -> issuer.issue("QLTY_GRD_JDG", MdmRuleIdKind.ROW, 0)));
        assertInstanceOf(IllegalArgumentException.class, assertThrows(RuntimeException.class, () -> issuer.issue("QLTY_GRD_JDG", MdmRuleIdKind.ROW, -2)));
        assertEquals(0, ((Number) rule().get("LAST_ROW_ID")).intValue());
    }

    private Map<String, Object> rule() {
        return jdbc.queryForMap("SELECT * FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'");
    }
}
