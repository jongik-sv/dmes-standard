package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.RuleCaseJudge;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCaseJudge;
import com.dongkuk.dmes.mdm.common.rule.RuleSetRunner;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetCondIoRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManagerFactory;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.function.Supplier;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 룰 세트 편집 서버 부하 가드 — view·validate(조건식 IO)·execute(기록 실행)·execute runCases 가 내는 SQL 문 수(Hibernate
 * {@code prepareStatementCount})의 상한과, 케이스 사이에 룰 정의를 같이 쓰는 runCases 가 케이스마다 새로 실행한 결과와 같은지 본다.
 *
 * <p>테스트는 OASIS 트랜잭션 밖에서 서비스를 부르므로 영속성 컨텍스트 1차 캐시 이득이 없는 상한값이다. 측정한 응답은
 * {@code build/perf-snapshot/} 에 JSON 으로 남긴다(고치기 전후 응답 비교용).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetEditQueryCountTest extends AbstractMdmSharedDbTest {

    static final String SET = "S_PERF";
    static final ObjectMapper JSON = new ObjectMapper();
    static final Path SNAPSHOT = Path.of("build/perf-snapshot");

    @Autowired
    RuleSetEditService service;
    @Autowired
    RuleSetRunner runner;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    EntityManagerFactory emf;

    Statistics stats;
    String flow;

    @BeforeEach
    void seed() {
        RuleSetSimulateTest.seedGolden(jdbc);
        currentUser.set("kim", STEWARD);
        flow = RuleSetSimulateTest.golden("IF_IN_PARALLEL").flowJson();
        DmeTestSupport.ruleSet(jdbc, SET, "부하 세트", "[\"GT_GRADE\",\"GT_FAST\",\"GT_SLOW\",\"GT_SAME1\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, SET, flow);
        for (int i = 1; i <= 5; i++) {
            putCase(SET, i, "{\"GT_THK\":\"" + (8 + i) + "\",\"GT_KIND\":\"x\"}", "2026-06-01 09:00:00", "{\"GT_G\":\"A\"}");
        }
        stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
    }

    @AfterEach
    void stopStatistics() {
        stats.clear();
        stats.setStatisticsEnabled(false);
    }

    private void putCase(String setId, int id, String input, String evalTs, String expected) {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON, EVAL_TS, EXPECTED_JSON) "
                + "VALUES (?, ?, ?, ?, ?, ?)", setId, id, "케이스" + id, input, evalTs, expected);
    }

    /** 한 번 부르고 그동안 Hibernate 가 준비한 SQL 문 수와 응답을 남긴다. */
    private <T> long count(String name, Supplier<T> call) throws IOException {
        stats.clear();
        T result = call.get();
        long n = stats.getPrepareStatementCount();
        Files.createDirectories(SNAPSHOT);
        Files.writeString(SNAPSHOT.resolve(name + ".json"), JSON.writerWithDefaultPrettyPrinter().writeValueAsString(result),
                StandardCharsets.UTF_8);
        System.out.println("[query-count] " + name + " = " + n);
        return n;
    }

    @Test
    void view_validate_execute_runCases_의_SQL_문_수() throws IOException {
        RuleSetViewRequest view = new RuleSetViewRequest();
        view.setSetId(SET);
        long viewCount = count("view", () -> service.view(view));

        RuleSetCondIoRequest cond = new RuleSetCondIoRequest();
        cond.setFlowJson(flow);
        long condCount = count("validate", () -> service.condIo(cond));

        RuleSetSimulateRequest sim = new RuleSetSimulateRequest();
        sim.setFlowJson(flow);
        sim.setRecordJson("{\"GT_THK\":\"12\",\"GT_KIND\":\"x\"}");
        sim.setEvalTs("2026-06-01 09:00:00");
        long simCount = count("execute", () -> service.simulate(sim));

        RuleSetSimulateRequest cases = new RuleSetSimulateRequest();
        cases.setFlowJson(flow);
        cases.setSetId(SET);
        cases.setRunCases(true);
        long casesCount = count("runCases", () -> service.simulate(cases));

        Files.writeString(SNAPSHOT.resolve("counts.txt"), "view=" + viewCount + "\nvalidate=" + condCount + "\nexecute=" + simCount
                + "\nrunCases=" + casesCount + "\n", StandardCharsets.UTF_8);
        // 고치기 전(2026-10-01) view 18·validate 1·execute 29·runCases 141(케이스 5건). 룰 4개 흐름 기준 상한이다.
        assertTrue(viewCount <= 9, "view SQL 문 " + viewCount); // D-144 2단계 — 세트 버전 목록 1문 추가
        assertTrue(condCount <= 1, "validate SQL 문 " + condCount);
        assertTrue(simCount <= 9, "execute SQL 문 " + simCount);
        assertTrue(casesCount <= 10, "runCases SQL 문 " + casesCount);
    }

    /** 케이스 수가 늘어도 같은 판정 시각이면 룰 정의를 다시 읽지 않는다 — 케이스 1건과 5건의 SQL 문 수가 같다. */
    @Test
    void runCases_의_SQL_문_수는_케이스_수에_따라_늘지_않는다() throws IOException {
        RuleSetSimulateRequest one = new RuleSetSimulateRequest();
        one.setFlowJson(flow);
        one.setSetId(SET);
        one.setRunCases(true);
        one.setCaseIds("1");
        long single = count("runCases-1", () -> service.simulate(one));
        RuleSetSimulateRequest all = new RuleSetSimulateRequest();
        all.setFlowJson(flow);
        all.setSetId(SET);
        all.setRunCases(true);
        long five = count("runCases-5", () -> service.simulate(all));
        assertEquals(single, five);
    }

    /**
     * runCases 가 케이스 사이에 룰 정의 조회기를 같이 써도 판정 시각마다 그 시각의 RELEASED 버전으로 판정한다 — 경계 앞·뒤 케이스가 서로 다른
     * 버전 결과를 내고, 각 케이스 결과가 케이스마다 새로 실행한 결과와 같다.
     */
    @Test
    void runCases_는_판정_시각이_다른_케이스를_각_시각의_버전으로_판정한다_케이스마다_새로_실행한_결과와_같다() {
        DmeTestSupport.rule(jdbc, "GT_DATED", "시각 룰", "DECISION", "INUSE");
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 2, LAST_ROW_ID = 1 WHERE MARU_RULE_ID = 'GT_DATED'");
        datedVersion(1, "2026-01-01 00:00:00", "2026-06-01 00:00:00", "old");
        datedVersion(2, "2026-06-01 00:00:00", null, "new");
        RuleSetSimulateTest.Flow f = new RuleSetSimulateTest.Flow();
        f.node("start", "START", null, null).node("r1", "RULE", "GT_DATED", null).node("end", "END", null, null);
        f.edge("e1", "start", "r1", null, null, false).edge("e2", "r1", "end", null, null, false);
        String dated = f.canonical();
        DmeTestSupport.ruleSet(jdbc, "S_DATED", "시각 세트", "[\"GT_DATED\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_DATED", dated);
        putCase("S_DATED", 1, "{\"GT_THK\":\"1\"}", "2026-05-31 23:59:59", "{\"GT_D\":\"old\"}");
        putCase("S_DATED", 2, "{\"GT_THK\":\"1\"}", "2026-06-01 00:00:00", "{\"GT_D\":\"new\"}");
        putCase("S_DATED", 3, "{\"GT_THK\":\"1\"}", "2026-05-01 00:00:00", "{\"GT_D\":\"old\"}");

        RuleSetSimulateRequest r = new RuleSetSimulateRequest();
        r.setFlowJson(dated);
        r.setSetId("S_DATED");
        r.setRunCases(true);
        RuleSetSimulateResult out = service.simulate(r);

        assertEquals(3, out.getCases().size());
        String[] ts = {"2026-05-31 23:59:59", "2026-06-01 00:00:00", "2026-05-01 00:00:00"};
        String[] expected = {"{\"GT_D\":\"old\"}", "{\"GT_D\":\"new\"}", "{\"GT_D\":\"old\"}"};
        for (int i = 0; i < 3; i++) {
            Map<String, Object> fresh = RuleSetCaseJudge.judge(i + 1, "케이스" + (i + 1), expected[i],
                    runner.trace(dated, RuleCaseJudge.object("{\"GT_THK\":\"1\"}"), RuleSetRunner.parseKst(ts[i])));
            assertEquals(fresh, out.getCases().get(i), "케이스 " + (i + 1));
            assertEquals(Boolean.TRUE, out.getCases().get(i).get("pass"), out.getCases().get(i).toString());
        }
        assertNotEquals(out.getCases().get(0).get("finalValues"), out.getCases().get(1).get("finalValues"));
    }

    private void datedVersion(int ver, String from, String to, String value) {
        DmeTestSupport.released(jdbc, "GT_DATED", ver, "FIRST", from, to);
        DmeTestSupport.var(jdbc, "GT_DATED", ver, 1, "COND", "1", "GT_THK", 1);
        DmeTestSupport.var(jdbc, "GT_DATED", ver, 2, "RESULT", "Value", "GT_D", 1, "STRING");
        DmeTestSupport.row(jdbc, "GT_DATED", ver, 1, 0, "DEFAULT", "{\"2\":{\"val\":\"" + value + "\"}}");
    }
}
