package com.dongkuk.dmes.mdm.dme.ruleConfirm;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.perf.QueryCountProbe;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.RulePerfFixture;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.dto.RuleConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.service.RuleConfirmService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.LinkedHashMap;
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
 * 룰 확정 검사({@code ruleConfirm.validate}) 서버 부하 가드 — 이름 변수 수에 따라 SQL 문 수가 어떻게 느는지 본다.
 * 결과 변수 참조 검사가 컬럼 사전을 묻는 이름(다른 룰이 만드는 이름)이 섞여 있다
 * ({@link RulePerfFixture}).
 *
 * <p>2026-10-01 고치기 전 30+14n(n 갈래 4개씩 이름 변수 — 저장된 변수 해석·결과 변수 참조 검사가 이름마다 컬럼 사전과 도메인 트리를 읽었다),
 * 고친 뒤 28+4n. 남은 이름 변수당 1문은 저장 검사기(RuleSaveValidator 원장 검사 — ContractChangeCheck 가 직전 RELEASED 정의를 호출마다
 * 새로 해석)다. 저장 경로와 같은 검사라 방금 flush 한 값이 보여야 해(I6) 해석 범위로 바꾸지 않는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleConfirmQueryCountTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleConfirmService service;
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
        probe = new QueryCountProbe(tm, em, emf, "ruleConfirm");
        probe.start();
    }

    @AfterEach
    void tearDown() {
        probe.stop();
    }

    @Test
    void validate_SQL_문_수() {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (int n : new int[] {2, 8}) {
            RulePerfFixture.seed(jdbc, n);
            RuleConfirmValidateRequest v = new RuleConfirmValidateRequest();
            v.setMaruRuleId(RulePerfFixture.ID);
            v.setVer("2.000");
            v.setApplyFrom("2026-07-01 00:00:00");
            counts.put("validate" + n, probe.inTx("validate-n" + n, () -> service.validate(v)));
        }
        // 이름 변수 4(n 하나)마다 저장 검사기의 직전 RELEASED 정의 해석 4문만 는다
        assertEquals(6 * 4, counts.get("validate8") - counts.get("validate2"), counts::toString);
        // 37 = 36 + 부르는 세트 재검사(RuleSetCallerCheck, srv:6)의 세트 목록 1문 — 세트가 없으면 버전을 읽지 않는다. 변수 수와 무관하다.
        assertTrue(counts.get("validate2") <= 37, counts::toString);
    }
}
