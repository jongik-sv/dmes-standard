package com.dongkuk.dmes.mdm.dmb.layout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * TSK-05-03 design.md §3.1·§6.2 — 등록 검증 표 7행(03 원문 순서)과 거부 코드 배정(불변 I12).
 */
class LayoutCheckTableTest {

    private static List<String> results(LayoutCheckTable.Result r) {
        return r.checks().stream().map(c -> (String) c.get("RESULT")).toList();
    }

    @Test
    void 검증_표는_03_의_7종을_원문_순서로_7행_낸다() {
        LayoutCheckTable.Result r = LayoutCheckTable.build(List.of(), List.of());
        assertEquals(7, r.checks().size());
        assertEquals(List.of(1, 2, 3, 4, 5, 6, 7), r.checks().stream().map(c -> c.get("NO")).toList());
        assertEquals(List.of("본문 항목의 컬럼이 컬럼 사전에 없음", "CONST 값이 도메인 유효 식 위반", "전송 단위의 차원 불일치",
                "숫자 표현 자리 부족", "FILLER 가 아닌 항목에 길이 직접 입력", "trans_unit 과 unit_item 동시 입력",
                "unit_item 이 같은 레이아웃의 항목을 가리키지 않음"), r.checks().stream().map(c -> c.get("CONDITION")).toList());
        assertEquals(List.of("L01", "L12", "L13", "L14", "L02", "L05", "L15"), r.checks().stream().map(c -> c.get("CODE")).toList());
        assertEquals(List.of("PASS", "PASS", "PASS", "PASS", "PASS", "PASS", "PASS"), results(r));
        assertTrue(r.passed());
        assertTrue(r.otherIssues().isEmpty());
    }

    @Test
    void L01_L12_L13_L14_L05_L15_는_각각_1_2_3_4_6_7번_행으로_간다() {
        Map<LayoutIssueCode, Integer> rows = Map.of(LayoutIssueCode.L01, 1, LayoutIssueCode.L12, 2, LayoutIssueCode.L13, 3,
                LayoutIssueCode.L14, 4, LayoutIssueCode.L05, 6, LayoutIssueCode.L15, 7);
        for (Map.Entry<LayoutIssueCode, Integer> e : rows.entrySet()) {
            LayoutIssue issue = LayoutIssue.of(e.getKey(), 3, "X", "문구 " + e.getKey());
            LayoutCheckTable.Result r = LayoutCheckTable.build(List.of(issue), List.of());
            for (Map<String, Object> row : r.checks()) {
                boolean hit = row.get("NO").equals(e.getValue());
                assertEquals(hit ? "FAIL" : "PASS", row.get("RESULT"), e.getKey() + " → " + row);
                if (hit) {
                    assertEquals(List.of(issue.summary()), row.get("MESSAGES"));
                }
            }
            assertFalse(r.passed());
            assertTrue(r.otherIssues().isEmpty());
        }
    }

    @Test
    void 번호_5_행은_FILLER_가_아닌_항목의_FILLER_LENGTH_L02_만_센다() {
        LayoutCheckTable.Result length = LayoutCheckTable.build(
                List.of(LayoutIssue.of(LayoutIssueCode.L02, 2, "FILLER_LENGTH", "DATA 항목에는 FILLER_LENGTH 를 넣을 수 없다")), List.of());
        assertEquals("FAIL", results(length).get(4));
        assertEquals(1, results(length).stream().filter("FAIL"::equals).count());

        LayoutCheckTable.Result other = LayoutCheckTable.build(
                List.of(LayoutIssue.of(LayoutIssueCode.L02, 2, "DEFAULT_VALUE", "DATA 항목에는 DEFAULT_VALUE 를 넣을 수 없다")), List.of());
        assertEquals("PASS", results(other).get(4));
        assertEquals(1, other.otherIssues().size());
        assertEquals("L02", other.otherIssues().get(0).get("CODE"));
        assertEquals("DEFAULT_VALUE", other.otherIssues().get(0).get("FIELD"));
        assertFalse(other.passed());
    }

    @Test
    void 경고만_있으면_WARN_이고_통과다() {
        LayoutCheckTable.Result r = LayoutCheckTable.build(List.of(), List.of(LayoutIssue.of(LayoutIssueCode.L12, 2, "DEFAULT_VALUE", "판정 불가")));
        assertEquals("WARN", results(r).get(1));
        assertTrue(r.passed());
    }
}
