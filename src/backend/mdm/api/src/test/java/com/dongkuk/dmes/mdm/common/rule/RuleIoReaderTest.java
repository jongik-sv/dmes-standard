package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-06 design §3.1 「RuleIoReaderTest」·§6.1·I4~I7·I16 — 룰 하나의 입출력(읽는 이름·만드는 이름·출처·타입)은 최신 RELEASED 버전에서
 * {@link RuleIoReader} 한 곳이 계산한다. 정의는 엔진이 세트 실행 전에 요구하는 키와 같다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class RuleIoReaderTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleIoReader reader;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        jdbc.execute("DROP TRIGGER IF EXISTS TR_RULE_VER_FAIL");
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.column(jdbc, "COIL_THK", DmeTestSupport.domain(jdbc, "COIL_THK_D", "QTY", "NUMBER", 2));
        jdbc.update("UPDATE TB_MDM_COLUMN SET LABEL_MID = '두께' WHERE PHYS_NAME = 'COIL_THK'");
        DmeTestSupport.column(jdbc, "COIL_WID", DmeTestSupport.domain(jdbc, "COIL_WID_D", "QTY", "NUMBER", 0));

        // R_MAIN — §6.1 규칙을 한 룰에 모은다.
        DmeTestSupport.rule(jdbc, "R_MAIN", "주 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_MAIN", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_MAIN", 1, 1, "COND", "1", "COIL_THK", 1, "NUMBER");       // 컬럼 사전에 있고 DATA_TYPE 도 선언 → DICT
        DmeTestSupport.var(jdbc, "R_MAIN", 1, 2, "COND", "1", "X + y_in", 2);                  // 식 변수 → VAR_AST 의 이름
        set("R_MAIN", 1, 2, "VAR_AST", infix("+", ref("X"), ref("Y_IN")));
        DmeTestSupport.var(jdbc, "R_MAIN", 1, 3, "COND", "Expression", "EXPR_COL", 3);         // 열 이름은 conds 가 아니다
        DmeTestSupport.var(jdbc, "R_MAIN", 1, 4, "COND", "1", "P_IN", 4, "STRING");            // 사전에 없고 DATA_TYPE 선언 → PROG
        set("R_MAIN", 1, 4, "LABEL", "프로그램 입력");
        DmeTestSupport.var(jdbc, "R_MAIN", 1, 5, "COND", "1", "coil_thk", 5);                  // 대소문자만 다른 중복 → 버림
        DmeTestSupport.var(jdbc, "R_MAIN", 1, 6, "RESULT", "Value", "OUT_A", 1, "NUMBER");
        DmeTestSupport.var(jdbc, "R_MAIN", 1, 7, "RESULT", "Value", "G_A1", 2, "STRING");      // 결과 열 그룹 GRP — 이름은 GRP 하나
        set("R_MAIN", 1, 7, "RES_GRP", "GRP");
        set("R_MAIN", 1, 7, "GRP_COND_AST", ref("G_IN"));
        DmeTestSupport.var(jdbc, "R_MAIN", 1, 8, "RESULT", "Value", "G_A2", 3, "STRING");
        set("R_MAIN", 1, 8, "RES_GRP", "GRP");
        DmeTestSupport.var(jdbc, "R_MAIN", 1, 9, "RESULT", "Expression", "OUT_E", 4, "NUMBER");
        // 조건 Expression 셀: IF(C_IN = NULL, TRUE, PI) → C_IN 만(상수 제외). 결과 Expression 셀: R_IN * out_a + x → R_IN 만(자기 결과·중복 제외).
        DmeTestSupport.row(jdbc, "R_MAIN", 1, 1, 1, "NORMAL", "{\"3\":{\"ast\":" + fn("IF", infix("=", ref("C_IN"), ref("NULL")), ref("TRUE"), ref("PI"))
                + "},\"9\":{\"ast\":" + infix("+", infix("*", ref("R_IN"), ref("out_a")), ref("x")) + "}}");
        DmeTestSupport.row(jdbc, "R_MAIN", 1, 2, 0, "DEFAULT", "{\"9\":{\"ast\":" + ref("pi") + "}}");

        // R_VER — RELEASED 둘(두 번째는 적용 시작이 미래)·DRAFT 하나. 지금 RELEASED = VER 최대(D3).
        DmeTestSupport.rule(jdbc, "R_VER", "버전 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_VER", 1, "FIRST", "2026-01-01 00:00:00", "2099-01-01 00:00:00");
        DmeTestSupport.var(jdbc, "R_VER", 1, 1, "COND", "1", "A_OLD", 1);
        DmeTestSupport.var(jdbc, "R_VER", 1, 2, "RESULT", "Value", "RES_OLD", 1, "STRING");
        DmeTestSupport.released(jdbc, "R_VER", 2, "UNIQUE", "2099-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_VER", 2, 1, "COND", "1", "A_NEW", 1);
        DmeTestSupport.var(jdbc, "R_VER", 2, 2, "RESULT", "Value", "RES_NEW", 1, "STRING");
        DmeTestSupport.pending(jdbc, "R_VER", 3, "DRAFT", "kim", "FIRST", 2);
        DmeTestSupport.var(jdbc, "R_VER", 3, 1, "COND", "1", "A_DRAFT", 1);

        // R_NOREL — RELEASED 가 없다.
        DmeTestSupport.rule(jdbc, "R_NOREL", "미배포 룰", "DERIVE", "CREATED");
        DmeTestSupport.pending(jdbc, "R_NOREL", 1, "DRAFT", "kim", null, null);
        DmeTestSupport.var(jdbc, "R_NOREL", 1, 1, "COND", "1", "N_IN", 1);

        // R_OLD — DEPRECATED 룰도 계산한다.
        DmeTestSupport.rule(jdbc, "R_OLD", "폐기 룰", "DECISION", "DEPRECATED");
        DmeTestSupport.released(jdbc, "R_OLD", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_OLD", 1, 1, "COND", "1", "COIL_WID", 1);
        DmeTestSupport.var(jdbc, "R_OLD", 1, 2, "RESULT", "Value", "OLD_OUT", 1, "NUMBER");
    }

    @Test
    void 읽는_이름은_조건_열_그룹_조건_Expression_셀_순이고_상수_자기_결과_중복을_뺀다() {
        RuleIo io = reader.read(List.of("R_MAIN")).get("R_MAIN");

        assertTrue(io.exists());
        assertEquals(1, io.releasedVer());
        assertEquals("FIRST", io.hitPolicy());
        assertEquals(List.of("COIL_THK", "X", "Y_IN", "P_IN", "G_IN", "C_IN", "R_IN"), names(io.conds()));
        assertEquals(List.of("OUT_A", "GRP", "OUT_E"), names(io.results()));
    }

    @Test
    void 출처는_컬럼_사전이_먼저이고_선언만_있으면_PROG_아니면_NONE() {
        RuleIo io = reader.read(List.of("R_MAIN")).get("R_MAIN");

        assertEquals(List.of(RuleIo.DICT, RuleIo.NONE, RuleIo.NONE, RuleIo.PROG, RuleIo.NONE, RuleIo.NONE, RuleIo.NONE),
                io.conds().stream().map(IoName::source).toList());
        io.results().forEach(r -> assertNull(r.source()));
    }

    @Test
    void 타입과_표시명은_출처별로_채우고_NONE_은_비운다() {
        RuleIo io = reader.read(List.of("R_MAIN")).get("R_MAIN");

        IoName thk = io.conds().get(0);
        assertEquals(new IoName("COIL_THK", RuleIo.DICT, "두께", "NUMBER", 2, false, null), thk);
        assertEquals(new IoName("P_IN", RuleIo.PROG, "프로그램 입력", "STRING", null, false, null), io.conds().get(3));
        assertEquals(new IoName("X", RuleIo.NONE, null, null, null, false, null), io.conds().get(1));
        assertEquals("NUMBER", io.results().get(0).dataType());
        assertEquals("STRING", io.results().get(1).dataType());
        assertEquals("NUMBER", io.results().get(2).dataType());
    }

    @Test
    void 지금_RELEASED_는_적용_시작과_무관하게_VER_최대다() {
        RuleIo io = reader.read(List.of("R_VER")).get("R_VER");

        assertEquals(2, io.releasedVer());
        assertEquals("UNIQUE", io.hitPolicy());
        assertEquals(List.of("A_NEW"), names(io.conds()));
        assertEquals(List.of("RES_NEW"), names(io.results()));
    }

    @Test
    void RELEASED_가_없으면_버전_null_빈_목록이고_룰_정보는_싣는다() {
        RuleIo io = reader.read(List.of("R_NOREL")).get("R_NOREL");

        assertEquals(new RuleIo("R_NOREL", "미배포 룰", "DERIVE", "CREATED", true, null, null, List.of(), List.of()), io);
    }

    @Test
    void 없는_룰은_exists_false_이고_DEPRECATED_룰도_계산한다() {
        Map<String, RuleIo> out = reader.read(List.of("NO_SUCH", "R_OLD"));

        assertEquals(new RuleIo("NO_SUCH", null, null, null, false, null, null, List.of(), List.of()), out.get("NO_SUCH"));
        RuleIo old = out.get("R_OLD");
        assertEquals("DEPRECATED", old.status());
        assertEquals(1, old.releasedVer());
        assertEquals(List.of(new IoName("COIL_WID", RuleIo.DICT, null, "NUMBER", 0, false, null)), old.conds());
        assertEquals(List.of("OLD_OUT"), names(old.results()));
    }

    @Test
    void 결과는_입력_순서를_지키고_같은_ID_는_한_번이다() {
        Map<String, RuleIo> out = reader.read(List.of("R_VER", "NO_SUCH", "R_MAIN", "R_VER"));

        assertEquals(List.of("R_VER", "NO_SUCH", "R_MAIN"), List.copyOf(out.keySet()));
        assertEquals("주 룰", out.get("R_MAIN").ruleName());
    }

    @Test
    void 생산자는_DEPRECATED_와_RELEASED_없는_룰을_빼고_룰_ID_순이다() {
        // 룰 ID 역순으로 넣는다.
        producer("Z_PROD", "INUSE", 1, "SHARED");
        producer("M_PROD", "INUSE", 1, "SHARED");
        DmeTestSupport.var(jdbc, "M_PROD", 1, 2, "RESULT", "Value", "GV1", 2);
        set("M_PROD", 1, 2, "RES_GRP", "G2");
        DmeTestSupport.var(jdbc, "M_PROD", 1, 3, "RESULT", "Value", "GV2", 3);
        set("M_PROD", 1, 3, "RES_GRP", "G2");
        producer("D_DEP", "DEPRECATED", 1, "SHARED");
        producer("A_PROD", "INUSE", 1, "OLDNAME");                            // 예전 RELEASED 의 결과는 빠진다
        DmeTestSupport.released(jdbc, "A_PROD", 2, "FIRST", "2026-06-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "A_PROD", 2, 1, "RESULT", "Value", "SHARED", 1);
        DmeTestSupport.rule(jdbc, "B_NOREL", "미배포", "DECISION", "INUSE");
        DmeTestSupport.pending(jdbc, "B_NOREL", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "B_NOREL", 1, 1, "RESULT", "Value", "SHARED", 1);

        Map<String, List<String>> producers = reader.producersOfActiveRules();

        assertEquals(List.of("A_PROD", "M_PROD", "Z_PROD"), producers.get("SHARED"));
        assertEquals(List.of("M_PROD"), producers.get("G2"));
        assertFalse(producers.containsKey("OLDNAME"));
        assertFalse(producers.containsKey("GV1"));
        assertFalse(producers.containsKey("GV2"));
        assertFalse(producers.containsKey("OLD_OUT"));                         // R_OLD(DEPRECATED)
        assertFalse(producers.containsKey("RES_OLD"));                         // R_VER 의 예전 RELEASED
        assertEquals(List.of("R_VER"), producers.get("RES_NEW"));
        assertEquals(List.of("R_MAIN"), producers.get("GRP"));
        assertFalse(producers.containsKey("G_A1"));
    }

    @Test
    void 룰_세트_헬퍼는_CHECK_를_통과하는_한_행을_넣는다() {
        DmeTestSupport.ruleSet(jdbc, "SET_A", "세트 A", "[\"R_MAIN\",\"R_VER\"]", "DEPRECATED", 3);

        assertEquals(Map.of("RULE_IDS", "[\"R_MAIN\",\"R_VER\"]", "STATUS", "DEPRECATED", "ROW_VERSION", 3L, "U_USR_ID", "fixture", "VER", 0L),
                jdbc.queryForMap("SELECT RULE_IDS, STATUS, ROW_VERSION, U_USR_ID, VER FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'SET_A'")
                        .entrySet().stream().collect(java.util.stream.Collectors.toMap(e -> e.getKey().toUpperCase(),
                                e -> e.getValue() instanceof Number n ? (Object) n.longValue() : e.getValue())));
    }

    private void producer(String id, String status, int ver, String result) {
        DmeTestSupport.rule(jdbc, id, id, "DECISION", status);
        DmeTestSupport.released(jdbc, id, ver, "FIRST", "2026-01-01 00:00:00", ver == 1 ? "2026-06-01 00:00:00" : null);
        DmeTestSupport.var(jdbc, id, ver, 1, "RESULT", "Value", result, 1);
    }

    private void set(String id, int ver, int varId, String column, String value) {
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET " + column + " = ? WHERE MARU_RULE_ID = ? AND VER = ? AND VAR_ID = ?", value, id, ver, varId);
    }

    private static List<String> names(List<IoName> list) {
        return list.stream().map(IoName::name).toList();
    }

    private static String ref(String name) {
        return "{\"type\":\"VARIABLE_OR_CONSTANT\",\"value\":\"" + name + "\",\"params\":[]}";
    }

    private static String infix(String op, String left, String right) {
        return "{\"type\":\"INFIX_OPERATOR\",\"value\":\"" + op + "\",\"params\":[" + left + "," + right + "]}";
    }

    private static String fn(String name, String... params) {
        return "{\"type\":\"FUNCTION\",\"value\":\"" + name + "\",\"params\":[" + String.join(",", params) + "]}";
    }
}
