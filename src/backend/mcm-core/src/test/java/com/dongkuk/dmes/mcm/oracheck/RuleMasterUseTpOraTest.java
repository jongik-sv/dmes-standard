package com.dongkuk.dmes.mcm.oracheck;

import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link RuleMasterRepository#searchRuleMasterList} 의 활성 조건이 {@code COALESCE(USE_TP,'N') <> 'N'} 에서
 * {@code USE_TP <> 'N'} 으로 바뀐 것(sargable-1008 s3)이 USE_TP 의 NULL·'N'·'Y' 에서 같은 행을 돌려주는지 실제 Oracle 에서 확인한다.
 * NULL 은 비교가 알 수 없음이라 양쪽 다 제외된다.
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class RuleMasterUseTpOraTest {

    @Autowired RuleMasterRepository repo;

    private HikariDataSource mcaDs;
    private JdbcTemplate mca;

    @BeforeEach
    void insertRows() {
        mcaDs = McmCoreOraTestDb.dataSource("MCAAPUSER", "oracheck-s3");
        mcaDs.setMaximumPoolSize(2);
        mca = new JdbcTemplate(mcaDs);
        cleanRows();
        insert("T_S3Y", "Y", null);                // 활성 — 나온다
        insert("T_S3N", "N", null);                // 사용 안 함 — 빠진다
        insert("T_S3Z", null, null);               // USE_TP 없음 — 빠진다(COALESCE 때도 'N' 이 되어 빠졌다)
        insert("T_S3H", "Y", "T_S3H");             // 활성이어도 이력 행(RULE_ID = OLD_RULE_ID) — 빠진다
    }

    @AfterEach
    void cleanUp() {
        try {
            cleanRows();
        } finally {
            mcaDs.close();
        }
    }

    @Test
    @DisplayName("searchRuleMasterList — USE_TP 가 Y 인 행만 나오고 N·NULL·이력 행은 빠진다")
    void onlyActiveRows() {
        List<Object[]> rows = repo.searchRuleMasterList(null, "-s3");

        assertThat(rows).extracting(r -> (String) r[0]).containsExactly("T_S3Y");
    }

    private void insert(String ruleId, String useTp, String oldRuleId) {
        mca.update("INSERT INTO MCAAPUSER.TB_MCA_RULE_MASTER (RULE_ID, RULE_NM, USE_TP, OLD_RULE_ID) VALUES (?, ?, ?, ?)",
                ruleId, ruleId + "-s3", useTp, oldRuleId);
    }

    private void cleanRows() {
        mca.update("DELETE FROM MCAAPUSER.TB_MCA_RULE_MASTER WHERE RULE_ID IN ('T_S3Y', 'T_S3N', 'T_S3Z', 'T_S3H')");
    }
}
