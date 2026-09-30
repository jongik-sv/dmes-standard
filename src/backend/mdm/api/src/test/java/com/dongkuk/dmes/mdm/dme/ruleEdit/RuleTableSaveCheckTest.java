package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_DEFAULT;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_ROW1;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_ROW2;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_ROW3;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.count;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.RuleTableServiceTest.row;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.RuleTableServiceTest.sample;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.RuleTableServiceTest.table;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleLimits;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveRejections;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleTableService;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.rule.RuleIssueCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-08-04 design §3.1 「RuleTableSaveCheckTest」 — 표 저장이 쓰기 전에 저장 시 검사를 돌린다(D10). ERROR 면 MDM021 거부이고 행·적중
 * 정책·row_version·LAST_ROW_ID 가 그대로다(I1). WARNING 만이면 저장하고 검사 이슈를 분석 이슈 뒤에 발급 번호로 싣는다(I2). 분석기 ERROR
 * (ALL_NA_ROW·UNIQUE OVERLAP)는 거부, UNIQUE 가 아닌 표의 OVERLAP 은 저장(I3). 미완성 거부(I4). 행 수·셀 길이 상한(I23).
 * 시작 상태: QLTY_GRD_JDG VER 1 RELEASED + VER 2 DRAFT(소유자 kim, FIRST, LAST_ROW_ID 4).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import({DmeTestSupport.Config.class, RuleTableSaveCheckTest.ProbeConfig.class})
class RuleTableSaveCheckTest {

    /** 검사 빈 가짜의 심각도. null 이면 아무 이슈도 내지 않는다. 새 행(음수 번호)마다 PROBE 이슈 하나. */
    static volatile String probeSeverity;

    @TestConfiguration
    static class ProbeConfig {

        @Bean
        RuleSaveCheck ruleTableSaveCheckProbe() {
            return context -> probeSeverity == null ? List.of()
                    : context.rows().stream().filter(r -> r.rowId() < 0)
                    .map(r -> RuleCheckReport.issue("PROBE", probeSeverity, List.of(r.rowId()), null, "프로브 " + r.rowId())).toList();
        }
    }

    private static final Set<String> ANALYSIS_CODES = Arrays.stream(RuleIssueCode.values()).map(Enum::name).collect(Collectors.toSet());

    @org.junit.jupiter.api.io.TempDir
    static Path tempDir;

    @Autowired
    RuleTableService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-rule-table-check-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        probeSeverity = null;
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", 2);
    }

    /** 조건 셋·결과 둘이 다 찬 행. {@code thk} 는 COIL_THK = 값. */
    private static String complete(int thk) {
        return "{\"1\":{\"op\":\"EQ\",\"left\":\"" + thk + "\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NA\"},\"4\":{\"val\":\"A\"},\"5\":{\"val\":\"1\"}}";
    }

    /** JSON 공백으로 정확히 {@code length} 자로 늘린다. */
    private static String pad(String cells, int length) {
        return "{" + " ".repeat(length - cells.length()) + cells.substring(1);
    }

    private Map<String, Object> state() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rows", jdbc.queryForList("SELECT ROW_ID, SEQ, ROW_KIND, CELLS, NOTE FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 "
                + "ORDER BY ROW_ID"));
        m.put("ver", jdbc.queryForMap("SELECT HIT_POLICY, ROW_VERSION FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));
        m.put("lastRowId", jdbc.queryForObject("SELECT LAST_ROW_ID FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'", Integer.class));
        return m;
    }

    /** 거부(MDM021, "룰 저장 거부:")이고 원장이 그대로인지 보고 details 의 이슈 코드를 돌려준다. */
    /** 적중 정책은 요청으로 받지 않는다(D-105 (4)) — 저장된 값을 검사 입력으로 쓴다. */
    private List<String> rejected(long rowVersion, List<Map<String, Object>> rows) {
        Map<String, Object> before = state();
        BusinessException e = assertThrows(BusinessException.class, () -> service.save(table(rowVersion, rows)));
        assertEquals("MDM021", e.getErrors().get(0).code(), e.getMessage());
        assertTrue(e.getMessage().startsWith(RuleSaveRejections.PREFIX), e.getMessage());
        assertEquals(before, state(), "거부된 저장은 행·적중 정책·row_version·LAST_ROW_ID 를 바꾸지 않는다(I1)");
        return e.getErrors().stream().skip(1).map(ErrorDetail::code).toList();
    }

    private List<Map<String, Object>> storedRows() {
        return jdbc.queryForList("SELECT ROW_ID, CELLS FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 ORDER BY ROW_ID");
    }

    @Test
    void 조건_전부_NA_행이_있으면_거부하고_아무것도_쓰지_않는다() {
        List<Map<String, Object>> rows = sample();
        rows.remove(1);
        rows.add(2, row(-1, "NORMAL", "{\"1\":{\"op\":\"NA\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NA\"},\"4\":{\"val\":\"D\"},\"5\":{\"val\":\"1\"}}", null));

        List<String> codes = rejected(0, rows);

        assertTrue(codes.contains("ALL_NA_ROW"), codes.toString());
    }

    @Test
    void UNIQUE_겹침은_거부하고_같은_표를_FIRST_로는_저장하고_OVERLAP_경고를_싣는다() {
        // 적중 정책은 이제 헤더·버전 화면이 저장하고 표 저장은 저장된 값을 읽는다(D-105 (4)).
        // 그래서 "UNIQUE 로 검사"를 하려면 저장된 버전을 먼저 UNIQUE 로 만들어 둔다.
        setStoredHitPolicy("UNIQUE");
        List<Map<String, Object>> rows = sample();
        rows.set(1, row(2, "NORMAL", Q_ROW2.replace("[\"B\"]", "[\"A\",\"B\"]"), null));

        assertEquals(List.of("OVERLAP"), rejected(0, rows));

        setStoredHitPolicy("FIRST"); // FIRST 로 바꾸면 겹침이 경고로 내려간다
        RuleEditSaveResult r = service.save(table(0, rows));
        assertEquals(1L, r.getRowVersion());
        assertTrue(r.getIssues().stream().anyMatch(i -> "OVERLAP".equals(i.get("code")) && "WARNING".equals(i.get("severity"))), r.getIssues().toString());
    }

    /** 헤더·버전 화면({@code ruleMng save target VERSION})이 저장하는 값을 테스트에서 그대로 흉내 낸다. */
    private void setStoredHitPolicy(String hit) {
        jdbc.update("UPDATE TB_MDM_RULE_VER SET HIT_POLICY = ? WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2", hit);
    }

    @Test
    void 미완성_행은_거부한다() {
        List<Map<String, Object>> missingCond = sample();
        missingCond.add(3, row(-1, "NORMAL", "{\"1\":{\"op\":\"GE\",\"left\":\"3\"},\"2\":{\"op\":\"NA\"},\"4\":{\"val\":\"D\"},\"5\":{\"val\":\"1\"}}", null));
        assertEquals(List.of("INCOMPLETE_COND"), rejected(0, missingCond));

        List<Map<String, Object>> missingResult = sample();
        missingResult.set(3, row(4, "DEFAULT", "{\"4\":{\"val\":\"C\"}}", null));
        assertEquals(List.of("INCOMPLETE_RESULT"), rejected(0, missingResult));
    }

    @Test
    void 셀_규칙_ERROR_는_거부한다() {
        List<Map<String, Object>> rows = sample();
        rows.set(0, row(1, "NORMAL", Q_ROW1.replace("\"left\":\"1.6\"", "\"left\":\" 1.60\""), null));
        assertEquals(List.of("TYPE_LITERAL"), rejected(0, rows));
    }

    @Test
    void 경고만_있으면_저장하고_검사_경고를_분석_이슈_뒤에_발급_번호로_싣는다() {
        probeSeverity = RuleCheckReport.WARNING;
        List<Map<String, Object>> rows = sample();
        rows.add(3, row(-1, "NORMAL", "{\"1\":{\"op\":\"GE\",\"left\":\"2.5\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NA\"},\"4\":{\"val\":\"D\"},\"5\":{\"val\":\"1\"}}",
                null));

        RuleEditSaveResult r = service.save(table(0, rows));

        assertEquals(Map.of("-1", 5), r.getRowIdMap());
        assertEquals(5, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));
        List<Map<String, Object>> issues = r.getIssues();
        Map<String, Object> probe = issues.get(issues.size() - 1);
        assertEquals("PROBE", probe.get("code"), issues.toString());
        assertEquals(List.of(5), probe.get("rowIds"), "임시 번호 -1 을 발급 번호로 바꾼다");
        List<Map<String, Object>> head = issues.subList(0, issues.size() - 1);
        assertTrue(!head.isEmpty() && head.stream().allMatch(i -> ANALYSIS_CODES.contains(String.valueOf(i.get("code")))),
                "분석 이슈(3행과 새 행 겹침)가 앞에 있다: " + issues);
    }

    @Test
    void 검사_빈이_ERROR_를_내면_쓰기_전에_거부한다() {
        probeSeverity = RuleCheckReport.ERROR;
        List<Map<String, Object>> rows = sample();
        rows.add(3, row(-1, "NORMAL", "{\"1\":{\"op\":\"LT\",\"left\":\"1\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NA\"},\"4\":{\"val\":\"D\"},"
                + "\"5\":{\"val\":\"1\"}}", null));
        assertEquals(List.of("PROBE"), rejected(0, rows), "분석 ERROR 가 없는 UNIQUE 표(새 행은 두께 1 미만)");
    }

    @Test
    void 한쪽_빈_구간은_1_타입_op_로_바꿔_저장하고_응답_rows_도_정규화한_값이다() {
        List<Map<String, Object>> rows = sample();
        rows.set(0, row(1, "NORMAL", Q_ROW1.replace("\"right\":\"2.5\"", "\"right\":\"\"").replace("[\"A\"]", "[\"C\",\"A\",\"C\"]"), null));

        RuleEditSaveResult r = service.save(table(0, rows));

        Map<Integer, Map<String, Object>> first = RuleCellsCodec.parse((String) storedRows().get(0).get("CELLS"));
        assertEquals(Map.of("op", "GE", "left", "1.6"), first.get(1));
        assertEquals(Map.of("op", "IN", "list", List.of("A", "C")), first.get(3));
        assertEquals(storedRows().get(0).get("CELLS"), r.getRows().get(0).get("cells"), "응답 rows 는 저장한 셀이다");
    }

    @Test
    void 비소유자는_검사보다_먼저_MDM003_이다() {
        currentUser.set("lee", STEWARD);
        List<Map<String, Object>> rows = sample();
        rows.add(0, row(-1, "NORMAL", "{\"1\":{\"op\":\"NA\"}}", null));
        BusinessException e = assertThrows(BusinessException.class, () -> service.save(table(0, rows)));
        assertEquals("MDM003", e.getErrors().get(0).code(), e.getMessage());
    }

    @Test
    void 행_수_상한과_같으면_저장하고_넘으면_거부한다() {
        List<Map<String, Object>> over = new ArrayList<>();
        for (int i = 1; i <= RuleLimits.MAX_ROWS; i++) {
            over.add(row(-i, "NORMAL", complete(i), null));
        }
        over.add(row(4, "DEFAULT", Q_DEFAULT, null));
        assertEquals(List.of("LIMIT_EXCEEDED"), rejected(0, over));

        List<Map<String, Object>> exact = new ArrayList<>(over.subList(1, over.size()));
        service.save(table(0, exact));
        assertEquals(RuleLimits.MAX_ROWS, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));
    }

    @Test
    void 행_셀_길이_상한과_같으면_저장하고_넘으면_거부한다() {
        List<Map<String, Object>> over = sample();
        over.set(2, row(3, "NORMAL", pad(Q_ROW3, RuleLimits.MAX_ROW_CELLS_CHARS + 1), null));
        assertEquals(List.of("LIMIT_EXCEEDED"), rejected(0, over));

        List<Map<String, Object>> exact = sample();
        exact.set(2, row(3, "NORMAL", pad(Q_ROW3, RuleLimits.MAX_ROW_CELLS_CHARS), null));
        service.save(table(0, exact));
        assertEquals(Q_ROW3, storedRows().get(2).get("CELLS"), "저장은 공백 없는 JSON 이다");
    }

    @Test
    void 셀_길이_합_상한과_같으면_저장하고_넘으면_거부한다() {
        int per = RuleLimits.MAX_ROW_CELLS_CHARS;
        int n = RuleLimits.MAX_TOTAL_CELLS_CHARS / per;
        assertEquals(RuleLimits.MAX_TOTAL_CELLS_CHARS, n * per, "행 상한으로 합 상한을 정확히 채울 수 있다");

        List<Map<String, Object>> over = new ArrayList<>();
        for (int i = 1; i < n - 1; i++) {
            over.add(row(-i, "NORMAL", pad(complete(i), per), null));
        }
        over.add(row(-(n - 1), "NORMAL", pad(complete(n - 1), per - 1), null));
        over.add(row(-n, "NORMAL", "{}", null));
        over.add(row(4, "DEFAULT", pad(Q_DEFAULT, per), null));
        assertEquals(RuleLimits.MAX_TOTAL_CELLS_CHARS + 1, over.stream().mapToInt(m -> ((String) m.get("cells")).length()).sum());
        assertEquals(List.of("LIMIT_EXCEEDED"), rejected(0, over));

        List<Map<String, Object>> exact = new ArrayList<>();
        for (int i = 1; i < n; i++) {
            exact.add(row(-i, "NORMAL", pad(complete(i), per), null));
        }
        exact.add(row(4, "DEFAULT", pad(Q_DEFAULT, per), null));
        assertEquals(RuleLimits.MAX_TOTAL_CELLS_CHARS, exact.stream().mapToInt(m -> ((String) m.get("cells")).length()).sum());
        service.save(table(0, exact));
        assertEquals(n, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));
    }
}
