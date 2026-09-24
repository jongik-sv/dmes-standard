package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSamples.entry;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSamples.labels;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSamples.steelStd;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemChecks.Header;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * TSK-06-03 design.md §4.2 H1~H7 — 코드 행 저장 검사(§6.3). 기대값은 원천 04:1148 과 시뮬레이터
 * {@code 04-hier-tree-sim.py} 「저장 검사」 네 줄(§1.4)을 그대로 쓴다.
 */
class MasterCodeItemChecksTest {

    private static final Header STEEL = new Header(3, labels("인장강도"));

    // ── H1 원천 샘플 + 시뮬레이터 저장 검사 4건 ─────────────────────────────

    @Test
    void H1_중간_칸이_빈_X_1_은_LVL_GAP() {
        List<MdmCheckIssue> issues = checkAdded(entry("X-1", "x", 1, null, "KS", null, "KS-3-CGCH"));

        assertEquals(List.of("LVL_GAP"), codes(issues));
        assertEquals("X-1", issues.get(0).itemKey());
        assertEquals("lvl2", issues.get(0).field());
    }

    @Test
    void H1_KS_3_을_JIS_아래에_둔_X_2_는_LVL_PARENT_MISMATCH() {
        List<MdmCheckIssue> issues = checkAdded(entry("X-2", "x", 1, null, "JIS", "KS-3"));

        assertEquals(List.of("LVL_PARENT_MISMATCH"), codes(issues));
        assertEquals("X-2", issues.get(0).itemKey());
        assertEquals("lvl2", issues.get(0).field());
        assertEquals("KS-3는 이미 KS 아래에 있다", issues.get(0).message());
    }

    @Test
    void H1_KS_3_CGCH_Z50_은_통과() {
        assertEquals(List.of(), checkAdded(entry("KS-3-CGCH-Z50", "z50", 1, "270", "KS", "KS-3", "KS-3-CGCH")));
    }

    @Test
    void H1_그룹_값_KS_3_을_JIS_아래_코드로_쓰면_LVL_PARENT_MISMATCH() {
        List<MdmCheckIssue> issues = checkAdded(entry("KS-3", "x", 1, null, "JIS"));

        assertEquals(List.of("LVL_PARENT_MISMATCH"), codes(issues));
        assertEquals("code", issues.get(0).field());
        assertEquals("KS-3는 이미 KS 아래에 있다", issues.get(0).message());
    }

    @Test
    void H1b_다른_행의_코드값을_다른_앞_칸_아래_그룹으로_쓰면_LVL_PARENT_MISMATCH() {
        // Build 보강(변이 18b) — KS-9 는 계층 칸 어디에도 없고 코드값으로만 KS 아래에 있다. 코드값 대조가 없으면 통과한다.
        List<MdmCheckIssue> issues = checkAdded(entry("X-3", "x", 1, null, "JIS", "KS-9"));

        assertEquals(List.of("LVL_PARENT_MISMATCH"), codes(issues));
        assertEquals("lvl2", issues.get(0).field());
        assertEquals("KS-9는 이미 KS 아래에 있다", issues.get(0).message());
        assertEquals(List.of(), checkAdded(entry("X-4", "x", 1, null, "KS", "KS-9")), "같은 앞 칸이면 통과(대조군)");
    }

    // ── H2 LVL_BEYOND_CNT 경계 ──────────────────────────────────────────

    @Test
    void H2_lvlCnt_3_에서_lvl3_은_통과하고_lvl4_는_거부() {
        assertEquals(List.of(), checkAdded(entry("N-1", "n", 1, null, "N", "N-A", "N-B")));

        List<MdmCheckIssue> issues = checkAdded(entry("N-2", "n", 1, null, "N", "N-A", "N-B", "N-C"));
        assertEquals(List.of("LVL_BEYOND_CNT"), codes(issues));
        assertEquals("lvl4", issues.get(0).field());
    }

    @Test
    void H2_lvlCnt_0_에서_lvl1_값은_거부() {
        List<MdmCheckIssue> issues = MasterCodeItemChecks.check(new Header(0, labels()),
                List.of(entry("P1", "p", 1, null, "G")), Set.of("P1"));

        assertEquals(List.of("LVL_BEYOND_CNT"), codes(issues));
        assertEquals("lvl1", issues.get(0).field());
    }

    // ── H3 CODE_FORBIDDEN_CHAR · CODE_REQUIRED ────────────────────────────

    @Test
    void H3_코드의_공백_콤마_탭과_계층_칸_공백은_거부_하이픈은_통과() {
        for (String bad : List.of("A B", "A,B", "A\tB", " A")) {
            List<MdmCheckIssue> issues = checkFlat(entry(bad, "x", 1, null));
            assertEquals(List.of("CODE_FORBIDDEN_CHAR"), codes(issues), "코드 [" + bad + "]");
            assertEquals("code", issues.get(0).field());
        }
        List<MdmCheckIssue> lvl = checkAdded(entry("Q-1", "x", 1, null, "K S"));
        assertEquals(List.of("CODE_FORBIDDEN_CHAR"), codes(lvl));
        assertEquals("lvl1", lvl.get(0).field());
        assertEquals(List.of(), checkFlat(entry("A-B", "x", 1, null)));
    }

    @Test
    void H3_코드가_null_이거나_빈_문자열이면_CODE_REQUIRED() {
        assertEquals(List.of("CODE_REQUIRED"), codes(checkFlat(entry(null, "x", 1, null))));
        assertEquals(List.of("CODE_REQUIRED"), codes(checkFlat(entry("", "x", 1, null))));
    }

    // ── H4 ATTR_WITHOUT_LABEL ─────────────────────────────────────────────

    @Test
    void H4_라벨_없는_attr02_값은_거부_attr01_과_null_은_통과() {
        MasterCodeItemEntry ok = entry("A1", "a", 1, "v1");
        assertEquals(List.of(), checkFlat(ok));

        MasterCodeItemEntry nullAttr = entry("A2", "a", 1, "v1");
        nullAttr.values().attrs().set(1, null);
        assertEquals(List.of(), checkFlat(nullAttr));

        MasterCodeItemEntry bad = entry("A3", "a", 1, "v1");
        bad.values().attrs().set(1, "v2");
        List<MdmCheckIssue> issues = checkFlat(bad);
        assertEquals(List.of("ATTR_WITHOUT_LABEL"), codes(issues));
        assertEquals("attr02", issues.get(0).field());
    }

    // ── H5 검사 기준은 V 에 유효한 행 ─────────────────────────────────────

    @Test
    void H5_넘겨받은_V_모습에_없는_닫힌_행은_판정에_끼지_않는다() {
        // V 모습에는 Q(경로 X, G) 가 없다(닫혔다) — Y 아래 G 를 새로 쓰는 행은 통과한다.
        Header two = new Header(2, labels());
        List<MasterCodeItemEntry> view = new ArrayList<>(List.of(entry("R", "r", 1, null, "Y")));
        MasterCodeItemEntry added = entry("N", "n", 1, null, "Y", "G");
        view.add(added);
        assertEquals(List.of(), MasterCodeItemChecks.check(two, view, Set.of("N")));

        view.add(0, entry("Q", "q", 1, null, "X", "G"));
        assertEquals(List.of("LVL_PARENT_MISMATCH"), codes(MasterCodeItemChecks.check(two, view, Set.of("N"))),
                "같은 행이 V 모습에 있으면 거부된다(대조군)");
    }

    // ── H6 자기 코드는 비교에서 뺀다 ──────────────────────────────────────

    @Test
    void H6_같은_경로로_이름만_바꾼_수정은_통과() {
        List<MasterCodeItemEntry> view = replace(steelStd(), entry("KS-3-CGCH", "새 이름", 3, "270", "KS", "KS-3"));

        assertEquals(List.of(), MasterCodeItemChecks.check(STEEL, view, Set.of("KS-3-CGCH")));
    }

    @Test
    void H6_자손이_있는_코드의_경로를_바꾸면_LVL_PARENT_MISMATCH() {
        List<MasterCodeItemEntry> view = replace(steelStd(), entry("KS-3-CGCH", "x", 3, "270", "JIS", "JIS-3"));

        List<MdmCheckIssue> issues = MasterCodeItemChecks.check(STEEL, view, Set.of("KS-3-CGCH"));
        assertEquals(List.of("LVL_PARENT_MISMATCH"), codes(issues));
        assertEquals("code", issues.get(0).field());
    }

    @Test
    void H6_코드가_자기_계층_값과_같아도_자기_행과는_비교하지_않는다() {
        // 코드 G 가 자기 lvl1 에도 G 를 쓴다. 자기 행을 비교에 넣으면 "G 는 이미 (뿌리) 아래" 로 거부된다.
        List<MasterCodeItemEntry> view = List.of(entry("G", "g", 1, null, "G"));

        assertEquals(List.of(), MasterCodeItemChecks.check(new Header(1, labels()), view, Set.of("G")));
    }

    // ── H7 검사 대상은 touched 행뿐 ───────────────────────────────────────

    @Test
    void H7_touched_가_아닌_옛_행의_위반은_이슈를_내지_않는다() {
        List<MasterCodeItemEntry> view = new ArrayList<>(steelStd());
        view.add(entry("OLD-1", "old", 1, null, "KS", "KS-3", "KS-3-CGCH", "OLD"));
        view.add(entry("NEW-1", "new", 1, "270", "KS", "KS-3"));

        assertEquals(List.of(), MasterCodeItemChecks.check(STEEL, view, Set.of("NEW-1")));
        assertEquals(List.of("LVL_BEYOND_CNT"), codes(MasterCodeItemChecks.check(STEEL, view, Set.of("OLD-1"))),
                "대조군 — touched 로 넣으면 걸린다");
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private static List<MdmCheckIssue> checkAdded(MasterCodeItemEntry added) {
        List<MasterCodeItemEntry> view = new ArrayList<>(steelStd());
        view.add(added);
        java.util.HashSet<String> touched = new java.util.HashSet<>();
        touched.add(added.code());
        return MasterCodeItemChecks.check(STEEL, view, touched);
    }

    private static List<MdmCheckIssue> checkFlat(MasterCodeItemEntry added) {
        java.util.HashSet<String> touched = new java.util.HashSet<>();
        touched.add(added.code());
        return MasterCodeItemChecks.check(new Header(0, labels("라벨1")), List.of(added), touched);
    }

    private static List<MasterCodeItemEntry> replace(List<MasterCodeItemEntry> view, MasterCodeItemEntry changed) {
        List<MasterCodeItemEntry> out = new ArrayList<>();
        for (MasterCodeItemEntry e : view) {
            out.add(e.code().equals(changed.code()) ? changed : e);
        }
        assertTrue(out.contains(changed));
        return out;
    }

    private static List<String> codes(List<MdmCheckIssue> issues) {
        return issues.stream().map(MdmCheckIssue::code).toList();
    }
}
