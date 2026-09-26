package com.dongkuk.dmes.mdm.common.rule.confirm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.common.rule.confirm.RuleVersionDiffs.Row;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleDiffConventions;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * TSK-08-05 design §3.1 「RuleVersionDiffsTest」 — 06 「버전 비교」(06:1253-1277)를 Java 로 옮긴 row_id diff(I13). 행 목록은 손으로 만든다.
 */
class RuleVersionDiffsTest {

    private static final String C12 = "{\"1\":{\"op\":\"GE\",\"left\":\"1.6\"},\"4\":{\"val\":\"A\"}}";
    private static final String C15_OLD = "{\"1\":{\"op\":\"GT\",\"left\":\"1000\"},\"4\":{\"val\":\"B\"}}";
    private static final String C15_NEW = "{\"1\":{\"op\":\"GT\",\"left\":\"1500\"},\"4\":{\"val\":\"B\"}}";
    private static final String C16 = "{\"1\":{\"op\":\"LT\",\"left\":\"1\"},\"4\":{\"val\":\"C\"}}";
    private static final String C17 = "{\"1\":{\"op\":\"IN\",\"list\":[\"X\",\"Y\"]},\"4\":{\"val\":\"D\"}}";

    private static List<String> keys(List<VersionDiffEntry> entries) {
        return entries.stream().map(VersionDiffEntry::key).toList();
    }

    private static List<DiffKind> kinds(List<VersionDiffEntry> entries) {
        return entries.stream().map(VersionDiffEntry::kind).toList();
    }

    private static VersionDiffEntry entry(List<VersionDiffEntry> entries, String key) {
        return entries.stream().filter(e -> e.key().equals(key)).findFirst().orElseThrow();
    }

    @Test
    void DF1_06_버전_비교_예시_그대로() {
        List<Row> old = List.of(new Row(12, 1, C12), new Row(15, 2, C15_OLD), new Row(16, 3, C16));
        List<Row> now = List.of(new Row(12, 1, C12), new Row(15, 2, C15_NEW), new Row(17, 3, C17));

        List<VersionDiffEntry> d = RuleVersionDiffs.diff(old, now);

        assertEquals(List.of("12", "15", "16", "17"), keys(d));
        assertEquals(List.of(DiffKind.SAME, DiffKind.CHANGED, DiffKind.REMOVED, DiffKind.ADDED), kinds(d));
        assertEquals(RuleVersionDiffs.canonicalCells(C15_OLD), entry(d, "15").oldValues().get(MdmRuleDiffConventions.CELLS));
        assertEquals(RuleVersionDiffs.canonicalCells(C15_NEW), entry(d, "15").newValues().get(MdmRuleDiffConventions.CELLS));
    }

    @Test
    void DF2_셀이_같고_seq_만_다르면_CHANGED_이고_SEQ_가_이전_이후를_담는다() {
        List<VersionDiffEntry> d = RuleVersionDiffs.diff(List.of(new Row(3, 1, C12)), List.of(new Row(3, 2, C12)));

        assertEquals(List.of(DiffKind.CHANGED), kinds(d));
        assertEquals(1, d.get(0).oldValues().get(MdmRuleDiffConventions.SEQ));
        assertEquals(2, d.get(0).newValues().get(MdmRuleDiffConventions.SEQ));
        assertEquals(d.get(0).oldValues().get(MdmRuleDiffConventions.CELLS), d.get(0).newValues().get(MdmRuleDiffConventions.CELLS));
    }

    @Test
    void DF3_최초_버전은_모든_행이_ADDED_이고_oldValues_가_null() {
        List<VersionDiffEntry> d = RuleVersionDiffs.diff(List.of(), List.of(new Row(1, 1, C12), new Row(2, 2, C16)));

        assertEquals(List.of(DiffKind.ADDED, DiffKind.ADDED), kinds(d));
        d.forEach(e -> assertNull(e.oldValues(), e.toString()));
        d.forEach(e -> assertNotNull(e.newValues(), e.toString()));
    }

    @Test
    void DF4_객체_키_순서와_공백은_무시하고_배열_순서는_본다() {
        String reordered = "{ \"4\" : {\"val\":\"A\"}, \"1\": {\"left\":\"1.6\", \"op\":\"GE\"} }";
        assertEquals(List.of(DiffKind.SAME), kinds(RuleVersionDiffs.diff(List.of(new Row(1, 1, C12)), List.of(new Row(1, 1, reordered)))));

        String listSwapped = "{\"1\":{\"op\":\"IN\",\"list\":[\"Y\",\"X\"]},\"4\":{\"val\":\"D\"}}";
        assertEquals(List.of(DiffKind.CHANGED), kinds(RuleVersionDiffs.diff(List.of(new Row(1, 1, C17)), List.of(new Row(1, 1, listSwapped)))));

        String astA = "{\"1\":{\"ast\":{\"type\":\"FUNCTION\",\"params\":[{\"type\":\"NUMBER\",\"value\":\"1\"},{\"value\":\"2\",\"type\":\"NUMBER\"}]}}}";
        String astB = "{\"1\":{\"ast\":{\"params\":[{\"value\":\"1\",\"type\":\"NUMBER\"},{\"type\":\"NUMBER\",\"value\":\"2\"}],\"type\":\"FUNCTION\"}}}";
        String astSwapped = "{\"1\":{\"ast\":{\"type\":\"FUNCTION\",\"params\":[{\"type\":\"NUMBER\",\"value\":\"2\"},{\"type\":\"NUMBER\",\"value\":\"1\"}]}}}";
        assertEquals(List.of(DiffKind.SAME), kinds(RuleVersionDiffs.diff(List.of(new Row(1, 1, astA)), List.of(new Row(1, 1, astB)))),
                "중첩 객체 키도 정렬한다");
        assertEquals(List.of(DiffKind.CHANGED), kinds(RuleVersionDiffs.diff(List.of(new Row(1, 1, astA)), List.of(new Row(1, 1, astSwapped)))),
                "AST params 순서는 보존한다");

        assertEquals("{\"a\":{\"c\":\"x\",\"d\":[2,1]},\"b\":1}", RuleVersionDiffs.canonicalCells("{\"b\":1, \"a\":{\"d\":[2,1],\"c\":\"x\"}}"));
    }

    @Test
    void DF5_값_맵은_SEQ_와_CELLS_둘뿐이고_한쪽에만_있으면_반대쪽이_null() {
        List<Row> old = List.of(new Row(1, 1, C12), new Row(2, 2, C15_OLD), new Row(3, 3, C16));
        List<Row> now = List.of(new Row(1, 1, C12), new Row(2, 2, C15_NEW), new Row(4, 3, C17));

        List<VersionDiffEntry> d = RuleVersionDiffs.diff(old, now);

        Set<String> keySet = Set.of(MdmRuleDiffConventions.SEQ, MdmRuleDiffConventions.CELLS);
        for (VersionDiffEntry e : d) {
            for (Map<String, Object> values : Arrays.asList(e.oldValues(), e.newValues())) {
                if (values == null) {
                    continue;
                }
                assertEquals(keySet, values.keySet(), e.toString());
                assertInstanceOf(Integer.class, values.get(MdmRuleDiffConventions.SEQ));
                assertInstanceOf(String.class, values.get(MdmRuleDiffConventions.CELLS));
            }
        }
        assertNotNull(entry(d, "1").oldValues());
        assertNotNull(entry(d, "1").newValues());
        assertNotNull(entry(d, "2").oldValues());
        assertNotNull(entry(d, "2").newValues());
        assertNull(entry(d, "3").newValues(), "REMOVED 는 newValues null");
        assertNotNull(entry(d, "3").oldValues());
        assertNull(entry(d, "4").oldValues(), "ADDED 는 oldValues null");
        assertNotNull(entry(d, "4").newValues());
        assertEquals(RuleVersionDiffs.canonicalCells(C12), entry(d, "1").newValues().get(MdmRuleDiffConventions.CELLS));
    }

    @Test
    void DF6_정렬은_새_seq_없으면_옛_seq_같으면_row_id_이고_DEFAULT_가_맨_앞() {
        List<Row> old = List.of(new Row(9, 0, C12), new Row(5, 1, C12), new Row(7, 2, C16), new Row(8, 3, C16));
        List<Row> now = List.of(new Row(9, 0, C12), new Row(8, 1, C16), new Row(6, 2, C17), new Row(5, 4, C12));

        List<VersionDiffEntry> d = RuleVersionDiffs.diff(old, now);

        // 9(0) · 8(1) · 6(2) · 7(REMOVED, 옛 2) · 5(4)
        assertEquals(List.of("9", "8", "6", "7", "5"), keys(d));
        assertEquals(List.of(DiffKind.SAME, DiffKind.CHANGED, DiffKind.ADDED, DiffKind.REMOVED, DiffKind.CHANGED), kinds(d));
    }

    @Test
    void DF7_key_는_row_id_의_10진_문자열() {
        List<VersionDiffEntry> d = RuleVersionDiffs.diff(List.of(), List.of(new Row(15, 1, C12)));

        assertEquals("15", d.get(0).key());
    }
}
