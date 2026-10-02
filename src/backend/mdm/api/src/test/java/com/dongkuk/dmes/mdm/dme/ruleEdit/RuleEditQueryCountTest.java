package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.perf.QueryCountProbe;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.RulePerfFixture;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleTestRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * 룰 편집 상세·값 테스트({@code ruleEdit.view}·{@code execute}) 서버 부하 가드 — 이름 변수 수에 따라 SQL 문 수가 어떻게 느는지 본다.
 * 변수는 컬럼 사전·다른 룰 결과·RELEASED 없는 결과·둘 다인 이름이 섞여 있다
 * ({@link RulePerfFixture}).
 *
 * <p>2026-10-01 고치기 전(n 갈래 4개씩 이름 변수): view 22+8n(base 버전 포함 — 변수마다 컬럼 사전 조회, 변수·도메인 트리·결과 변수 재조회),
 * view v1 14+4n, execute 9+4n·runCases 10+4n. 고친 뒤(읽기 경로 해석 범위 — 컬럼 사전은 이름을 모아 한 번): view 12·view v1 10·execute 7·
 * runCases 8(모두 상수).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleEditQueryCountTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager tm;
    @Autowired
    EntityManager em;
    @Autowired
    EntityManagerFactory emf;

    QueryCountProbe probe;
    JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        currentUser.set("kim", STEWARD);
        probe = new QueryCountProbe(tm, em, emf, "ruleEdit");
        probe.start();
    }

    @AfterEach
    void tearDown() {
        probe.stop();
    }

    @Test
    void view_execute_SQL_문_수() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (int n : new int[] {2, 8}) {
            RulePerfFixture.seed(jdbc, n);
            RuleEditViewRequest view = new RuleEditViewRequest();
            view.setMaruRuleId(RulePerfFixture.ID);
            counts.put("view" + n, probe.inTx("view-n" + n, () -> service.view(view)));
            RuleEditViewRequest v1 = new RuleEditViewRequest();
            v1.setMaruRuleId(RulePerfFixture.ID);
            v1.setVer("1.000");
            counts.put("viewV1_" + n, probe.inTx("view-v1-n" + n, () -> service.view(v1)));

            RuleTestRequest run = new RuleTestRequest();
            run.setMaruRuleId(RulePerfFixture.ID);
            run.setTarget("VERSION");
            run.setVer("2.000");
            run.setInputJson(RulePerfFixture.inputJson(n));
            counts.put("execute" + n, probe.inTx("execute-n" + n, () -> service.runTest(run)));
            RuleTestRequest cases = new RuleTestRequest();
            cases.setMaruRuleId(RulePerfFixture.ID);
            cases.setTarget("VERSION");
            cases.setVer("2.000");
            cases.setInputJson(RulePerfFixture.inputJson(n));
            cases.setRunCases(true);
            counts.put("executeCases" + n, probe.inTx("execute-cases-n" + n, () -> service.runTest(cases)));
        }
        for (String k : new String[] {"view", "viewV1_", "execute", "executeCases"}) {
            assertEquals(counts.get(k + 2), counts.get(k + 8), k + " " + counts);
        }
        assertTrue(counts.get("view8") <= 12 && counts.get("viewV1_8") <= 10 && counts.get("execute8") <= 7
                && counts.get("executeCases8") <= 8, counts::toString);
    }
}
