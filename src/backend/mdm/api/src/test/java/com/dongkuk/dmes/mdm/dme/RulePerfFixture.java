package com.dongkuk.dmes.mdm.dme;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 룰 편집·확정 서버 부하 가드 픽스처 — 샘플 QLTY_GRD_JDG(v1 RELEASED · v2 DRAFT base 1, 소유자 kim)에 이름 변수 네 갈래를 n 개씩 붙인다.
 *
 * <ul>
 *   <li>{@code XV_i} — 컬럼 사전 이름(COLUMN)</li>
 *   <li>{@code PV_i} — 다른 룰 PRD_REL 의 RELEASED 결과 변수(RULE_RESULT)</li>
 *   <li>{@code PU_i} — RELEASED 버전이 없는 룰 PRD_DRAFT 의 결과 변수(UNRESOLVED, 확정 검사 결과 변수 참조 오류)</li>
 *   <li>{@code XC_i} — 컬럼 사전 이름이면서 PRD_DRAFT 가 만드는 이름(확정 검사에서 컬럼으로 빠진다)</li>
 * </ul>
 * 변수 칸은 모두 무관(NA)이다. 테스트 케이스 2건을 둔다.
 */
public final class RulePerfFixture {

    public static final String ID = "QLTY_GRD_JDG";

    private RulePerfFixture() {
    }

    public static void seed(JdbcTemplate jdbc, int n) {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.pending(jdbc, ID, 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, ID, 2);
        long dom = jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME='COIL_THK_D'", Long.class);

        DmeTestSupport.rule(jdbc, "PRD_REL", "생산 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "PRD_REL", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "PRD_REL", 1, 1, "COND", "1", "COIL_THK", 1);
        DmeTestSupport.rule(jdbc, "PRD_DRAFT", "작성 중 룰", "DECISION", "INUSE");
        DmeTestSupport.pending(jdbc, "PRD_DRAFT", 1, "DRAFT", "lee", "FIRST", null);
        DmeTestSupport.var(jdbc, "PRD_DRAFT", 1, 1, "COND", "1", "COIL_THK", 1);

        StringBuilder cells = new StringBuilder();
        for (int i = 0; i < n; i++) {
            DmeTestSupport.column(jdbc, "XV_" + i, dom);
            DmeTestSupport.column(jdbc, "XC_" + i, dom);
            DmeTestSupport.var(jdbc, "PRD_REL", 1, 10 + i, "RESULT", "Value", "PV_" + i, 10 + i, i % 2 == 0 ? "NUMBER" : "STRING");
            DmeTestSupport.var(jdbc, "PRD_DRAFT", 1, 10 + i, "RESULT", "Value", "PU_" + i, 10 + i, "STRING");
            DmeTestSupport.var(jdbc, "PRD_DRAFT", 1, 40 + i, "RESULT", "Value", "XC_" + i, 40 + i, "STRING");
            String[] names = {"XV_", "PV_", "PU_", "XC_"};
            for (int g = 0; g < names.length; g++) {
                int varId = 10 + g * 20 + i;
                for (int ver : new int[] {1, 2}) {
                    DmeTestSupport.var(jdbc, ID, ver, varId, "COND", "1", names[g] + i, varId);
                }
                cells.append(",\"").append(varId).append("\":{\"op\":\"NA\"}");
            }
        }
        if (n > 0) {
            // CELLS 는 CLOB 이라 SQL 안에서 바인드 문자열(4000자 초과 가능)과 잇지 않고, 읽어서 자바에서 이어 다시 쓴다.
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT VER, ROW_ID, CELLS FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = ? AND ROW_KIND = 'NORMAL'", ID);
            for (Map<String, Object> row : rows) {
                String old = (String) row.get("CELLS");
                jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = ? AND VER = ? AND ROW_ID = ?",
                        old.substring(0, old.length() - 1) + cells + "}", ID, row.get("VER"), row.get("ROW_ID"));
            }
        }
        // 룰 밖 이름 — 컬럼 XE_COL·다른 룰 결과 PE_RES(값 테스트 BODY 의 식 열이 읽는다)
        DmeTestSupport.column(jdbc, "XE_COL", dom);
        DmeTestSupport.var(jdbc, "PRD_REL", 1, 90, "RESULT", "Value", "PE_RES", 90, "NUMBER");
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 200, LAST_ROW_ID = 100 WHERE MARU_RULE_ID = ?", ID);
        for (int c = 1; c <= 2; c++) {
            jdbc.update("INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON, ROW_VERSION) "
                    + "VALUES (?, ?, ?, ?, ?, 0)", ID, c, "케이스" + c, "{\"COIL_THK\":\"2.0\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}",
                    c == 1 ? "{\"QLTY_GRD\":\"A\",\"PRC_FCT\":\"1.05\"}" : "{\"QLTY_GRD\":\"B\"}");
        }
    }

    /** 샘플 세 이름과 붙인 이름 변수 모두에 값을 준 판정 입력. */
    public static String inputJson(int n) {
        StringBuilder sb = new StringBuilder("{\"COIL_THK\":\"2.0\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"");
        for (int i = 0; i < n; i++) {
            for (String p : new String[] {"XV_", "PV_", "PU_", "XC_"}) {
                sb.append(",\"").append(p).append(i).append("\":\"").append(i + 1).append('"');
            }
        }
        return sb.append('}').toString();
    }
}
