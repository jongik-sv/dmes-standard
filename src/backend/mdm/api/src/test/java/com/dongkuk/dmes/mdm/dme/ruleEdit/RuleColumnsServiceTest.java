package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.count;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.rowVersion;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleColumnsService;
import com.ezylang.evalex.parser.ParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-03 design §3.1 「RuleColumnsServiceTest」 — 열 설정 저장(part COLUMNS): 초안 전체를 한 번에 검사해 거부가 하나라도 있으면
 * 아무것도 반영하지 않는 원자 적용, 신규 열 var_id 발급, 표시 타입·변수 변경 열의 셀 비움, 삭제 열의 변수·셀 삭제, seq 재배열, 그룹 검사 전부,
 * DERIVE 산출 순서, axis 규칙, COLLECT_AGG 기본값(불변 규칙 1·2·5·7·8·10·12·14).
 * 시작 상태: QLTY_GRD_JDG VER 1 RELEASED + VER 2 DRAFT(소유자 kim, base 1, FIRST, LAST_VAR_ID 5·LAST_ROW_ID 4).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleColumnsServiceTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleColumnsService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    MdmEvaluator evaluator;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", 2);
    }

    // ── 요청 헬퍼 — rows 의 각 Map 이 칼럼 줄이다(grids.rows B4 규칙). ──

    static Map<String, Object> col(Object varId, String kind, String disp, String name) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("varId", varId);
        m.put("varKind", kind);
        m.put("dispType", disp);
        m.put("varName", name);
        return m;
    }

    static Map<String, Object> with(Map<String, Object> m, Object... kv) {
        for (int i = 0; i < kv.length; i += 2) {
            m.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return m;
    }

    static RuleEditSaveRequest columns(long rowVersion, List<Map<String, Object>> cols) {
        RuleEditSaveRequest r = new RuleEditSaveRequest();
        r.setPart("COLUMNS");
        r.setMaruRuleId("QLTY_GRD_JDG");
        r.setVer(2);
        r.setRowVersion(rowVersion);
        r.setRows(cols);
        return r;
    }

    /** QLTY_GRD_JDG v2 현재 정의를 요청 줄로 옮긴 것. */
    static List<Map<String, Object>> qCols() {
        return new ArrayList<>(List.of(
                col(1, "COND", "2", "COIL_THK"),
                col(2, "COND", "1", "COIL_WID"),
                col(3, "COND", "1", "SURF_GRD"),
                with(col(4, "RESULT", "Value", "QLTY_GRD"), "dataType", "STRING"),
                with(col(5, "RESULT", "Value", "PRC_FCT"), "dataType", "NUMBER")));
    }

    static String mdm(org.junit.jupiter.api.function.Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    private List<Map<String, Object>> storedVars() {
        return jdbc.queryForList("SELECT VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, SEQ FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 "
                + "ORDER BY CASE VAR_KIND WHEN 'COND' THEN 0 ELSE 1 END, SEQ");
    }

    private List<Map<String, Object>> storedCells() {
        return jdbc.queryForList("SELECT CELLS FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 "
                + "AND ROW_KIND = 'NORMAL' ORDER BY ROW_ID"); // 셀 비움은 NORMAL 행 몫(불변 8) — DEFAULT 행은 결과 셀만 가진다
    }

    // ── 원자 적용·발급·셀 비움 ──

    @Test
    void 순서대로_저장하고_seq_는_조건과_결과_각각_1부터이며_신규_열은_발급한다() {
        DmeTestSupport.column(jdbc, "COIL_LEN", DmeTestSupport.domain(jdbc, "COIL_LEN_D", "QTY", "NUMBER", 2));
        List<Map<String, Object>> cols = List.of(
                col(3, "COND", "1", "SURF_GRD"),
                col(1, "COND", "2", "COIL_THK"),
                col(-1, "COND", "2", "COIL_LEN"),
                col(2, "COND", "1", "COIL_WID"),
                with(col(5, "RESULT", "Value", "PRC_FCT"), "dataType", "NUMBER"),
                with(col(4, "RESULT", "Value", "QLTY_GRD"), "dataType", "STRING"));

        RuleEditSaveResult r = service.save(columns(0, cols));

        List<Integer> condSeq = storedVars().stream().filter(v -> "COND".equals(v.get("VAR_KIND"))).map(v -> ((Number) v.get("SEQ")).intValue()).toList();
        List<Integer> resultSeq = storedVars().stream().filter(v -> "RESULT".equals(v.get("VAR_KIND"))).map(v -> ((Number) v.get("SEQ")).intValue()).toList();
        assertEquals(List.of(1, 2, 3, 4), condSeq, "조건끼리 1..n");
        assertEquals(List.of(1, 2), resultSeq, "결과끼리 1..n");
        assertEquals(6, jdbc.queryForObject("SELECT LAST_VAR_ID FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'", Integer.class), "카운터 갱신");
        assertEquals(Map.of("-1", 6), r.getRowIdMap());
        assertEquals(1L, r.getRowVersion());
        assertEquals(1L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
    }

    @Test
    void 거부_줄이_하나라도_있으면_변수와_셀_어디도_바꾸지_않는다() {
        List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 ORDER BY VAR_ID");
        List<Map<String, Object>> rowsBefore = jdbc.queryForList("SELECT * FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 ORDER BY ROW_ID");

        List<Map<String, Object>> cols = qCols();
        with(cols.get(1), "axis", "LEFT"); // COND 2 축 값 오류

        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, cols))));

        assertEquals(before, jdbc.queryForList("SELECT * FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 ORDER BY VAR_ID"));
        assertEquals(rowsBefore, jdbc.queryForList("SELECT * FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 ORDER BY ROW_ID"));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
    }

    @Test
    void 표시_타입이나_변수가_바뀐_열의_셀은_비우고_삭제_열은_변수와_셀을_함께_지운다() {
        List<Map<String, Object>> cols = qCols();
        with(cols.get(0), "dispType", "1"); // COIL_THK 2 → 1
        with(cols.get(2), "deleted", true); // SURF_GRD 삭제

        service.save(columns(0, cols));

        assertTrue(storedVars().stream().noneMatch(v -> ((Number) v.get("VAR_ID")).intValue() == 3), "삭제 열은 행이 없다");
        for (Map<String, Object> r : storedCells()) {
            String cells = (String) r.get("CELLS");
            assertFalse(cells.contains("\"1\":"), "표시 타입이 바뀐 열의 셀 키가 사라진다: " + cells);
            assertFalse(cells.contains("\"3\":"), "삭제 열의 셀 키가 사라진다: " + cells);
            assertTrue(cells.contains("\"2\":"), "안 바뀐 열의 셀은 남는다: " + cells);
        }
    }

    @Test
    void 이_DRAFT_에_없던_var_id_와_중복은_거부한다() {
        List<Map<String, Object>> cols = qCols();
        cols.set(0, col(9, "COND", "2", "COIL_THK"));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, cols))));
        List<Map<String, Object>> dup = qCols();
        dup.add(col(1, "COND", "2", "COIL_THK"));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, dup))));
    }

    // ── 프로그램 변수·결과 변수명·axis ──

    @Test
    void 프로그램_변수는_값_타입을_선언해야_하고_결과_변수명은_버전_안에서_유일하다() {
        List<Map<String, Object>> prog = qCols();
        with(prog.get(2), "varName", "UNKNOWN_PARAM");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, prog))), "사전·앞 룰 결과 밖 이름은 타입 선언 필수");

        List<Map<String, Object>> declared = qCols();
        with(declared.get(2), "varName", "UNKNOWN_PARAM", "dataType", "NUMBER");
        long rv = service.save(columns(0, declared)).getRowVersion();
        assertEquals("UNKNOWN_PARAM", jdbc.queryForObject(
                "SELECT VAR_NAME FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 3", String.class));

        List<Map<String, Object>> dupName = qCols();
        with(dupName.get(3), "varName", "PRC_FCT");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(rv, dupName))), "결과 변수명 중복");
    }

    @Test
    void axis_는_COND_전용이고_ROW_COL_NONE_중_하나다() {
        List<Map<String, Object>> result = qCols();
        with(result.get(3), "axis", "ROW");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, result))));
        List<Map<String, Object>> bad = qCols();
        with(bad.get(0), "axis", "LEFT");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, bad))));
        List<Map<String, Object>> ok = qCols();
        with(ok.get(0), "axis", "ROW");
        with(ok.get(1), "axis", "COL");
        with(ok.get(2), "axis", "NONE");
        service.save(columns(0, ok));
        assertEquals("ROW", jdbc.queryForObject("SELECT AXIS FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 1", String.class));
        assertNull(jdbc.queryForObject("SELECT AXIS FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 4", String.class),
                "결과 열의 axis 는 NULL");
    }

    @Test
    void EvalEx_상수와_밑줄_예약어는_변수명으로_쓰지_못한다() {
        List<Map<String, Object>> consts = qCols();
        with(consts.get(2), "varName", "TRUE", "dataType", "BOOLEAN");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, consts))));
        List<Map<String, Object>> under = qCols();
        with(under.get(2), "varName", "_TMP", "dataType", "STRING");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, under))));
    }

    // ── 집계·순위(hit_policy 연계) ──

    @Test
    void COLLECT_결과열의_기본_집계는_LIST_이고_PRIORITY_는_순위를_받는다() {
        jdbc.update("UPDATE TB_MDM_RULE_VER SET HIT_POLICY = 'COLLECT' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2");
        service.save(columns(0, qCols())); // collectAgg 를 보내지 않는다
        assertEquals("LIST", jdbc.queryForObject("SELECT COLLECT_AGG FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 4", String.class),
                "JPA 가 DB 기본값을 덮으므로 저장 로직이 명시한다(불변 10)");
        assertEquals("LIST", jdbc.queryForObject("SELECT COLLECT_AGG FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 5", String.class),
                "COLLECT 결과 열 전부가 기본 집계를 받는다(06: collect_agg 는 COLLECT 결과열만, 기본 'LIST')");

        jdbc.update("UPDATE TB_MDM_RULE_VER SET HIT_POLICY = 'FIRST' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2");
        List<Map<String, Object>> agg = qCols();
        with(agg.get(3), "collectAgg", "SUM");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(1, agg))), "COLLECT 밖의 집계는 거부(위 저장에서 row_version 이 1로 올랐다)");

        jdbc.update("UPDATE TB_MDM_RULE_VER SET HIT_POLICY = 'PRIORITY' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2");
        List<Map<String, Object>> prio = qCols();
        with(prio.get(3), "prioList", List.of("A", "B", "C"));
        service.save(columns(1, prio));
        assertEquals("[\"A\",\"B\",\"C\"]", jdbc.queryForObject(
                "SELECT PRIO_LIST FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 4", String.class).replace(" ", ""));
    }

    // ── 결과 열 그룹(BASE_SPD_LKP 모양) ──

    /** 그룹 시더 — BASE_SPD_LKP v1 RELEASED + v2 DRAFT(UNIQUE): COND 두께 하나 + 그룹 BASE_SPD 결과 8열(GENERAL 이 기본 열). 사전에 TOP_RESIN_CD·COAT_SIDE. */
    private void seedGroup() {
        DmeTestSupport.column(jdbc, "TOP_RESIN_CD", DmeTestSupport.domain(jdbc, "TOP_RESIN_CD_D", "TEXT", "STRING", null));
        DmeTestSupport.column(jdbc, "COAT_SIDE", DmeTestSupport.domain(jdbc, "COAT_SIDE_D", "TEXT", "STRING", null));
        long spd = DmeTestSupport.domain(jdbc, "SPEED_MPM_D", "QTY", "NUMBER", 0);
        DmeTestSupport.rule(jdbc, "BASE_SPD_LKP", "기본 L/S 조회", "DECISION", "INUSE");
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 9, LAST_ROW_ID = 7 WHERE MARU_RULE_ID = 'BASE_SPD_LKP'");
        DmeTestSupport.released(jdbc, "BASE_SPD_LKP", 1, "UNIQUE", "2026-01-01 00:00:00", null); // NOW(2026-06-15) 이전이어야 미적용 2개(MDM007)로 안 센다
        DmeTestSupport.pending(jdbc, "BASE_SPD_LKP", 2, "DRAFT", "kim", "UNIQUE", 1);
        for (int ver : List.of(1, 2)) {
            jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, SEQ, RES_GRP, GRP_COND, DOMAIN_ID, LABEL) "
                    + "VALUES ('BASE_SPD_LKP', ?, 1, 'COND', '2', 'COIL_THK', 1, NULL, NULL, NULL, '두께')", ver);
            String[][] grp = {{"2", "TEXTURE", "STR_STARTS_WITH(TOP_RESIN_CD, \"2\")"}, {"3", "AKZO", "STR_STARTS_WITH(TOP_RESIN_CD, \"6\")"},
                    {"4", "FLUORO", "TOP_RESIN_CD == \"F\""}, {"5", "WXL1", "STR_STARTS_WITH(TOP_RESIN_CD, \"W\") && COAT_SIDE == \"1\""},
                    {"6", "WXL2", "STR_STARTS_WITH(TOP_RESIN_CD, \"W\") && COAT_SIDE == \"2\""}, {"7", "BACK1", "STR_STARTS_WITH(TOP_RESIN_CD, \"B\") && COAT_SIDE == \"1\""},
                    {"8", "BACK2", "STR_STARTS_WITH(TOP_RESIN_CD, \"B\") && COAT_SIDE == \"2\""}, {"9", "GENERAL", null}};
            for (String[] g : grp) {
                jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, SEQ, RES_GRP, GRP_COND, DOMAIN_ID, LABEL) "
                        + "VALUES ('BASE_SPD_LKP', ?, ?, 'RESULT', 'Value', ?, ?, 'BASE_SPD', ?, ?, NULL)", ver, Integer.parseInt(g[0]), g[1],
                        Integer.parseInt(g[0]) - 1, g[2], spd);
            }
            jdbc.update("INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES ('BASE_SPD_LKP', ?, 1, 1, 'NORMAL', ?)", ver,
                    "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"0\",\"right\":\"0.5\"},\"2\":{\"val\":\"100\"},\"3\":{\"val\":\"100\"}}");
            jdbc.update("INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES ('BASE_SPD_LKP', ?, 2, 2, 'NORMAL', ?)", ver,
                    "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"0.5\",\"right\":\"0.6\"},\"2\":{\"val\":\"100\"},\"9\":{\"val\":\"110\"}}");
        }
    }

    /** BASE_SPD_LKP v2 칼럼 9줄을 요청으로 옮긴다. domainId 는 SPEED_MPM_D. */
    private List<Map<String, Object>> gCols() {
        List<Map<String, Object>> out = new ArrayList<>();
        out.add(with(col(1, "COND", "2", "COIL_THK"), "axis", "NONE"));
        String[][] grp = {{"2", "TEXTURE", "STR_STARTS_WITH(TOP_RESIN_CD, \"2\")"}, {"3", "AKZO", "STR_STARTS_WITH(TOP_RESIN_CD, \"6\")"},
                {"4", "FLUORO", "TOP_RESIN_CD == \"F\""}, {"5", "WXL1", "STR_STARTS_WITH(TOP_RESIN_CD, \"W\") && COAT_SIDE == \"1\""},
                {"6", "WXL2", "STR_STARTS_WITH(TOP_RESIN_CD, \"W\") && COAT_SIDE == \"2\""}, {"7", "BACK1", "STR_STARTS_WITH(TOP_RESIN_CD, \"B\") && COAT_SIDE == \"1\""},
                {"8", "BACK2", "STR_STARTS_WITH(TOP_RESIN_CD, \"B\") && COAT_SIDE == \"2\""}, {"9", "GENERAL", null}};
        for (String[] g : grp) {
            Map<String, Object> m = with(col(Integer.parseInt(g[0]), "RESULT", "Value", g[1]), "resGrp", "BASE_SPD",
                    "domainId", jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM_D'", Long.class));
            if (g[2] != null) {
                m.put("grpCond", g[2]);
            }
            out.add(m);
        }
        return out;
    }

    private RuleEditSaveRequest grpColumns(long rowVersion, List<Map<String, Object>> cols) {
        RuleEditSaveRequest r = columns(rowVersion, cols);
        r.setMaruRuleId("BASE_SPD_LKP");
        return r;
    }

    @Test
    void 그룹은_FIRST_UNIQUE_룰에만_두고_열이_2개_이상이어야_한다() {
        seedGroup();
        service.save(grpColumns(0, gCols())); // UNIQUE — 원본 그대로 저장 왕복
        assertEquals(9, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'BASE_SPD_LKP' AND VER = 2"));

        jdbc.update("UPDATE TB_MDM_RULE_VER SET HIT_POLICY = 'PRIORITY' WHERE MARU_RULE_ID = 'BASE_SPD_LKP' AND VER = 2");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(grpColumns(1, gCols()))), "PRIORITY 거부");
        jdbc.update("UPDATE TB_MDM_RULE_VER SET HIT_POLICY = 'UNIQUE' WHERE MARU_RULE_ID = 'BASE_SPD_LKP' AND VER = 2");

        List<Map<String, Object>> one = gCols();
        one.removeIf(m -> !"TEXTURE".equals(m.get("varName")) && !"COIL_THK".equals(m.get("varName")));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(grpColumns(1, one))), "그룹 열 2개 미만(그룹에 TEXTURE 하나만 남는다)");
    }

    @Test
    void 그룹_내_데이터_타입은_일치해야_하고_res_grp_는_그룹_밖_결과_변수명과_같을_수_없다() {
        seedGroup();
        long text = DmeTestSupport.domain(jdbc, "SPD_TEXT_D", "TEXT", "STRING", null);
        List<Map<String, Object>> mixed = gCols();
        with(mixed.get(1), "domainId", text);
        assertEquals("INVALID_VALUE", mdm(() -> service.save(grpColumns(0, mixed))), "그룹 내 타입 불일치");

        List<Map<String, Object>> extra = gCols();
        extra.add(with(col(-1, "RESULT", "Value", "BASE_SPD"), "dataType", "NUMBER"));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(grpColumns(0, extra))), "res_grp 값과 같은 그룹 밖 결과 변수명");
    }

    @Test
    void 기본_열은_그룹마다_마지막_seq_하나뿐이고_그룹이_아닌_열에_열_조건을_두지_못한다() {
        seedGroup();
        List<Map<String, Object>> first = gCols();
        first.remove(1); // TEXTURE 삭제 — GENERAL(seq 8)이 기본 열인 채로 남는다
        first.add(1, with(col(-1, "RESULT", "Value", "NEWDFLT"), "resGrp", "BASE_SPD", "domainId",
                jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM_D'", Long.class)));
        // grp_cond 를 안 보낸 새 열을 그룹 첫 줄에 두면 기본 열(grp_cond NULL)이 둘에 마지막 seq 가 아니다
        assertEquals("INVALID_VALUE", mdm(() -> service.save(grpColumns(0, first))), "기본 열이 마지막 seq 가 아님");

        List<Map<String, Object>> twoDefault = gCols();
        twoDefault.add(with(col(-1, "RESULT", "Value", "NEWDFLT"), "resGrp", "BASE_SPD", "domainId",
                jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'SPEED_MPM_D'", Long.class)));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(grpColumns(0, twoDefault))), "기본 열 둘");

        List<Map<String, Object>> outside = qCols();
        with(outside.get(3), "grpCond", "COIL_THK > 1");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, outside))), "그룹 아닌 열의 grp_cond");
    }

    @Test
    void grp_cond_는_파싱과_참조_변수_해결이_되어야_하고_AST_를_한_번_만든다() {
        seedGroup();
        List<Map<String, Object>> parseErr = gCols();
        with(parseErr.get(1), "grpCond", "STR_STARTS_WITH(TOP_RESIN_CD, \"2\"");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(grpColumns(0, parseErr))), "파싱 실패");

        List<Map<String, Object>> unresolved = gCols();
        with(unresolved.get(1), "grpCond", "UNKNOWN_VAR == \"F\"");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(grpColumns(0, unresolved))), "참조 변수 미해결");

        service.save(grpColumns(0, gCols()));
        String cond = jdbc.queryForObject("SELECT GRP_COND FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'BASE_SPD_LKP' AND VER = 2 AND VAR_ID = 2", String.class);
        String ast = jdbc.queryForObject("SELECT GRP_COND_AST FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'BASE_SPD_LKP' AND VER = 2 AND VAR_ID = 2", String.class);
        assertEquals(astOf(cond), ast, "AST 는 파싱 결과와 같고 텍스트와 같은 줄에 들어간다");
        assertNull(jdbc.queryForObject("SELECT GRP_COND_AST FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'BASE_SPD_LKP' AND VER = 2 AND VAR_ID = 9", String.class),
                "기본 열은 AST 도 없다");
    }

    private String astOf(String expr) {
        try {
            return DomainJson.write(AstExporter.export(expr, evaluator.configuration()));
        } catch (ParseException e) {
            throw new IllegalStateException(e);
        }
    }

    // ── DERIVE(WGT_CALC 모양) ──

    private void seedDerive() {
        DmeTestSupport.column(jdbc, "COIL_LEN", DmeTestSupport.domain(jdbc, "COIL_LEN_D", "QTY", "NUMBER", 2));
        DmeTestSupport.column(jdbc, "SPEC_GRAV", DmeTestSupport.domain(jdbc, "SPEC_GRAV_D", "QTY", "NUMBER", 3));
        long wgt = DmeTestSupport.domain(jdbc, "WGT_KG_D", "QTY", "NUMBER", 1);
        DmeTestSupport.rule(jdbc, "WGT_CALC", "코일 중량 산출", "DERIVE", "CREATED");
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 1, LAST_ROW_ID = 1 WHERE MARU_RULE_ID = 'WGT_CALC'");
        DmeTestSupport.pending(jdbc, "WGT_CALC", 1, "DRAFT", "kim", null, null);
        jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, SEQ, DOMAIN_ID, LABEL) "
                + "VALUES ('WGT_CALC', 1, 1, 'RESULT', 'Expression', 'COIL_WGT', 1, ?, '코일 중량')", wgt);
        jdbc.update("INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES ('WGT_CALC', 1, 1, 1, 'NORMAL', ?)",
                "{\"1\":{\"expr\":\"ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)\",\"ast\":\"\"}}");
    }

    private Map<String, Object> deriveCol(Object varId, String name, String expr) {
        return with(col(varId, "RESULT", "Expression", name), "domainId",
                jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'WGT_KG_D'", Long.class), "expr", expr);
    }

    private RuleEditSaveRequest deriveColumns(long rowVersion, List<Map<String, Object>> cols) {
        RuleEditSaveRequest r = columns(rowVersion, cols);
        r.setMaruRuleId("WGT_CALC");
        r.setVer(1);
        return r;
    }

    @Test
    void DERIVE_결과_식은_자기_자신과_뒤_seq_결과_변수를_참조할_수_없다() {
        seedDerive();
        RuleEditSaveResult r = service.save(deriveColumns(0, List.of(deriveCol(1, "COIL_WGT", "ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)"))));
        assertEquals(1L, r.getRowVersion());

        assertEquals("INVALID_VALUE", mdm(() -> service.save(deriveColumns(1, List.of(deriveCol(1, "COIL_WGT", "COIL_WGT * 2"))))), "자기 참조");

        List<Map<String, Object>> two = List.of(deriveCol(1, "FIRST_WGT", "COIL_THK * 2"), deriveCol(-1, "SECOND_WGT", "FIRST_WGT + 1"));
        RuleEditSaveResult twoSaved = service.save(deriveColumns(1, two)); // 두 결과 열 — 뒤 식이 앞 결과를 참조(허용)
        int secondVarId = twoSaved.getRowIdMap().get("-1");
        assertEquals("FIRST_WGT + 1", cellExpr(secondVarId));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(deriveColumns(twoSaved.getRowVersion(),
                List.of(deriveCol(1, "FIRST_WGT", "SECOND_WGT + 1"), deriveCol(secondVarId, "SECOND_WGT", "FIRST_WGT + 1"))))),
                "앞 식이 뒤 결과를 참조");
        assertEquals("FIRST_WGT + 1", cellExpr(secondVarId), "거부로 아무 것도 반영되지 않는다");
    }

    private String cellExpr(int varId) {
        String cells = jdbc.queryForObject("SELECT CELLS FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'WGT_CALC' AND VER = 1", String.class);
        return com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec.parse(cells).get(varId).get("expr").toString();
    }

    @Test
    void DERIVE_룰에는_조건열과_그룹과_hit_policy를_둘_수_없다() {
        seedDerive();
        List<Map<String, Object>> cond = List.of(col(-1, "COND", "2", "COIL_THK"), deriveCol(1, "COIL_WGT", "COIL_THK * 2"));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(deriveColumns(0, cond))), "조건 열");

        List<Map<String, Object>> grp = List.of(with(deriveCol(1, "COIL_WGT", "COIL_THK * 2"), "resGrp", "WGT"));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(deriveColumns(0, grp))), "그룹");

        RuleEditSaveRequest hit = deriveColumns(0, List.of(deriveCol(1, "COIL_WGT", "COIL_THK * 2")));
        hit.setHitPolicy("FIRST");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(hit)), "적중 정책");
    }

    @Test
    void DERIVE_결과_식은_셀에_저장되고_AST_는_파싱_결과와_같다() throws Exception {
        seedDerive();
        String expr = "ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)";
        service.save(deriveColumns(0, List.of(deriveCol(1, "COIL_WGT", expr))));
        String cells = jdbc.queryForObject("SELECT CELLS FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'WGT_CALC' AND VER = 1", String.class);
        assertTrue(cells.contains("\"expr\":\"" + expr + "\""), cells);
        // RR1(TSK-08-04 반려 재작업) — 결과 식 셀의 ast 는 JSON 객체다. RuleCellsCodec.parse 는 문자열도 풀어 주므로 회귀를 못
        // 잡는다(§R6-2) — 원문 CELLS·평범한 Jackson 으로 본다.
        assertTrue(cells.contains("\"ast\":{"), cells);
        assertFalse(cells.contains("\"ast\":\""), cells);
        com.fasterxml.jackson.databind.ObjectMapper plain = new com.fasterxml.jackson.databind.ObjectMapper();
        com.fasterxml.jackson.databind.JsonNode ast = plain.readTree(cells).get("1").get("ast");
        assertTrue(ast.isObject(), cells);
        assertEquals(plain.valueToTree(AstExporter.export(expr, evaluator.configuration())), ast, "식 셀의 AST");
        // 불변 1 — 셀 JSON 키는 7개(op,left,right,list,expr,ast,val)뿐이고 문자열 키의 값은 문자열이다.
        for (Object cell : com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec.parse(cells).values()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> keys = (Map<String, Object>) cell;
            assertTrue(com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec.CELL_KEYS.containsAll(keys.keySet()), "셀 키: " + keys.keySet());
            assertTrue(keys.get("expr") instanceof String, "expr 는 문자열");
        }
        assertFalse(cells.contains("\"note\""), cells);
    }

    @Test
    void Expression_조건_열은_변수_칸을_비우고_표시명만_두며_다시_저장해도_셀이_남는다() {
        // 2026-09-28 결정 — 변수 칸에는 이름만 적는다. Expression 조건 열은 행 칸마다 식을 적는 열이라 변수 칸이 NULL 이다(06:1011).
        List<Map<String, Object>> cols = qCols();
        cols.add(with(col(-1, "COND", "Expression", null), "label", "두께 확인"));
        RuleEditSaveResult r = service.save(columns(0, cols));
        int varId = r.getRowIdMap().get("-1");
        Map<String, Object> stored = jdbc.queryForMap("SELECT VAR_NAME, VAR_AST, LABEL FROM TB_MDM_RULE_VAR "
                + "WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = " + varId);
        assertNull(stored.get("VAR_NAME"));
        assertNull(stored.get("VAR_AST"), "식 변수를 새로 저장하지 않는다");
        assertEquals("두께 확인", stored.get("LABEL"));
        for (Map<String, Object> row : storedCells()) {
            assertTrue(row.get("CELLS").toString().contains("\"" + varId + "\":{\"op\":\"NA\"}"), "새 Expression 조건 열은 NORMAL 행을 무관으로 채운다: " + row);
        }

        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND ROW_ID = 1",
                DmeTestSupport.Q_ROW1.replace("}}", "},\"" + varId + "\":{\"expr\":\"COIL_THK < 2\",\"ast\":" + astOf("COIL_THK < 2") + "}}"));
        List<Map<String, Object>> again = qCols();
        again.add(with(col(varId, "COND", "Expression", null), "label", "두께 확인(수정)"));
        service.save(columns(r.getRowVersion(), again));
        assertTrue(storedCells().get(0).get("CELLS").toString().contains("COIL_THK < 2"), "표시명만 바꾸면 셀을 비우지 않는다");
    }

    @Test
    void 조건_열을_Expression_으로_바꾸면_그_열의_셀을_무관으로_바꾼다() {
        List<Map<String, Object>> cols = qCols();
        cols.set(1, with(col(2, "COND", "Expression", null), "label", "폭 확인"));
        service.save(columns(0, cols));
        for (Map<String, Object> row : storedCells()) {
            String cells = row.get("CELLS").toString();
            assertTrue(cells.contains("\"2\":{\"op\":\"NA\"}"), cells);
            assertFalse(cells.contains("\"GT\""), "옛 COIL_WID 조건(GT 1000)은 비운다: " + cells);
        }
    }

    @Test
    void 변수_칸에는_이름만_받고_Expression_조건_열은_이름을_받지_않는다() {
        List<Map<String, Object>> named = qCols();
        named.add(with(col(-1, "COND", "Expression", "COIL_THK * 2"), "label", "두께*2"));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, named))), "Expression 조건 열에 이름·식");

        List<Map<String, Object>> noLabel = qCols();
        noLabel.add(col(-1, "COND", "Expression", null));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, noLabel))), "Expression 조건 열 표시명 없음");

        List<Map<String, Object>> exprVar = qCols();
        exprVar.add(with(col(-1, "COND", "2", "COIL_THK * 2"), "label", "두께*2", "dataType", "NUMBER"));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, exprVar))), "구간 열 변수 칸에 식");

        List<Map<String, Object>> result = qCols();
        result.add(with(col(-1, "RESULT", "Value", "1ST_GRD"), "dataType", "STRING"));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(columns(0, result))), "숫자로 시작하는 결과 변수명");
        assertEquals(5, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"), "거부로 아무것도 반영되지 않는다");
    }

    // ── 피벗 축(화면 표현) 경고·권한 ──

    private void seedPivot() {
        DmeTestSupport.rule(jdbc, "PVT_LKP", "피벗 데모", "DECISION", "CREATED");
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 3, LAST_ROW_ID = 3 WHERE MARU_RULE_ID = 'PVT_LKP'");
        DmeTestSupport.pending(jdbc, "PVT_LKP", 1, "DRAFT", "kim", "UNIQUE", null);
        jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, SEQ, AXIS) VALUES "
                + "('PVT_LKP', 1, 1, 'COND', '2', 'COIL_THK', 1, 'ROW')");
        jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, SEQ, AXIS) VALUES "
                + "('PVT_LKP', 1, 2, 'COND', 'Equal', 'SURF_GRD', 2, 'COL')");
        jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, SEQ, DATA_TYPE) VALUES "
                + "('PVT_LKP', 1, 3, 'RESULT', 'Value', 'PVT_OUT', 1, 'NUMBER')");
        String[][] rows = {{"1", "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"0\",\"right\":\"0.5\"},\"2\":{\"op\":\"EQ\",\"left\":\"A\"},\"3\":{\"val\":\"10\"}}"},
                {"2", "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"0.5\",\"right\":\"0.6\"},\"2\":{\"op\":\"EQ\",\"left\":\"A\"},\"3\":{\"val\":\"11\"}}"},
                {"3", "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"0\",\"right\":\"0.5\"},\"2\":{\"op\":\"EQ\",\"left\":\"B\"},\"3\":{\"val\":\"12\"}}"}};
        for (String[] r : rows) {
            jdbc.update("INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES ('PVT_LKP', 1, ?, ?, 'NORMAL', ?)",
                    Integer.parseInt(r[0]), Integer.parseInt(r[0]), r[1]);
        }
    }

    private List<Map<String, Object>> pCols() {
        return new ArrayList<>(List.of(
                with(col(1, "COND", "2", "COIL_THK"), "axis", "ROW"),
                with(col(2, "COND", "Equal", "SURF_GRD"), "axis", "COL"),
                with(col(3, "RESULT", "Value", "PVT_OUT"), "dataType", "NUMBER")));
    }

    @Test
    void 축_조합_빈틈은_경고만_하고_저장을_막지_않는다() {
        seedPivot();
        RuleEditSaveRequest r = columns(0, pCols());
        r.setMaruRuleId("PVT_LKP");
        r.setVer(1);
        RuleEditSaveResult out = service.save(r); // ROW 2구간 × COL 2값 = 4조각, 행 3개 → 빈틈
        assertEquals(1L, out.getRowVersion());
        assertTrue(out.getIssues().stream().anyMatch(i -> "PIVOT_COVER_INCOMPLETE".equals(i.get("code")) && "WARNING".equals(i.get("severity"))),
                String.valueOf(out.getIssues()));
        assertEquals(3, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'PVT_LKP' AND VER = 1"), "저장은 됐다");
    }

    @Test
    void EXTERNAL_룰_비소유자_row_version_불일치는_거부한다() {
        DmeTestSupport.externalRule(jdbc, "EXT_JDG", "외부");
        DmeTestSupport.pending(jdbc, "EXT_JDG", 1, "DRAFT", "kim", "FIRST", null);
        RuleEditSaveRequest ext = columns(0, qCols());
        ext.setMaruRuleId("EXT_JDG");
        ext.setVer(1);
        assertEquals("BUSINESS_ERROR", mdm(() -> service.save(ext)));

        currentUser.set("lee", STEWARD);
        assertEquals("MDM003", mdm(() -> service.save(columns(0, qCols()))));
        currentUser.set("kim", STEWARD);
        assertEquals("MDM001", mdm(() -> service.save(columns(7, qCols()))));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
    }
}
