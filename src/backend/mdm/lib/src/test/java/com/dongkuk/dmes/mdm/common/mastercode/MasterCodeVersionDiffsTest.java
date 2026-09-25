package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.OPEN;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.V1_000;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.V1_001;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.V2_000;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.cateItems;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.cates;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.item;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.items;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.CateItemRow;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.CateRow;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.ItemRow;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/** TSK-06-05 design.md §3.1 DF1~DF7 — 버전 V 의 diff(§6.2, 불변 규칙 I12·I13·I14). */
class MasterCodeVersionDiffsTest {

    @Test
    void DF1_샘플_v2_000_은_82_83_과_MAJOR_82_의_REMOVED_세_행뿐() {
        List<VersionDiffEntry> diff = MasterCodeVersionDiffs.diff(V2_000, items(), cates(), cateItems());

        assertEquals(List.of("ITEM:82 REMOVED", "ITEM:83 REMOVED", "CATE_ITEM:MAJOR,82 REMOVED"), summary(diff));
        for (VersionDiffEntry e : diff) {
            assertNull(e.newValues(), e.key());
        }
        assertEquals("2CGL", diff.get(0).oldValues().get("NAME"));
        assertEquals("3CGL", diff.get(1).oldValues().get("NAME"));
    }

    @Test
    void DF2_샘플_v1_001_은_83_이름_변경과_2P_추가() {
        List<VersionDiffEntry> diff = MasterCodeVersionDiffs.diff(V1_001, items(), cates(), cateItems());

        assertEquals(List.of("ITEM:2P ADDED", "ITEM:83 CHANGED", "CATE_ITEM:COLD_MILL,2P ADDED",
                "CATE_ITEM:MAJOR,2P ADDED"), summary(diff));
        VersionDiffEntry changed = diff.get(1);
        assertEquals("3CGl", changed.oldValues().get("NAME"));
        assertEquals("3CGL", changed.newValues().get("NAME"));
        VersionDiffEntry added = diff.get(0);
        assertNull(added.oldValues());
        assertEquals("PLTCM2", added.newValues().get("NAME"));
        assertEquals(12, added.newValues().get("SEQ"));
    }

    @Test
    void DF3_최초_버전은_모두_ADDED() {
        List<VersionDiffEntry> diff = MasterCodeVersionDiffs.diff(V1_000, items(), cates(), cateItems());

        assertEquals(List.of("ITEM:1P ADDED", "ITEM:82 ADDED", "ITEM:83 ADDED", "CATE:BASE ADDED",
                "CATE:COATING ADDED", "CATE:COLD_MILL ADDED", "CATE:MAJOR ADDED", "CATE_ITEM:COLD_MILL,1P ADDED",
                "CATE_ITEM:MAJOR,1P ADDED", "CATE_ITEM:MAJOR,82 ADDED"), summary(diff));
        assertTrue(diff.stream().allMatch(e -> e.kind() == DiffKind.ADDED && e.oldValues() == null));
    }

    @Test
    void DF4_닫힌_행과_새_행의_값이_같으면_항목을_내지_않는다() {
        List<ItemRow> rows = new ArrayList<>(List.of(
                item("A", V1_000, V1_001, "에이", null, 1),
                item("A", V1_001, OPEN, "에이", null, 1),
                item("B", V1_000, V1_001, "비", null, 2),
                item("B", V1_001, OPEN, "비2", null, 2)));
        List<CateRow> cateRows = List.of(
                new CateRow("C", V1_000, V1_001, "씨", "TABLE", null, null, null),
                new CateRow("C", V1_001, OPEN, "씨", "TABLE", null, null, null));
        List<CateItemRow> members = List.of(
                new CateItemRow("C", "A", V1_000, V1_001),
                new CateItemRow("C", "A", V1_001, OPEN));

        List<VersionDiffEntry> diff = MasterCodeVersionDiffs.diff(V1_001, rows, cateRows, members);

        assertEquals(List.of("ITEM:B CHANGED"), summary(diff));
        assertFalse(diff.stream().anyMatch(e -> e.kind() == DiffKind.SAME));
    }

    @Test
    void DF4_값이_null_로_바뀐_칸도_다른_값이라_CHANGED() {
        List<ItemRow> rows = List.of(
                new ItemRow("A", V1_000, V1_001, "에이", null, 1, null, lvls("G"), MasterCodeProcCdLedger.slots(10)),
                new ItemRow("A", V1_001, OPEN, "에이", null, 1, null, lvls((String) null),
                        MasterCodeProcCdLedger.slots(10)));

        List<VersionDiffEntry> diff = MasterCodeVersionDiffs.diff(V1_001, rows, List.of(), List.of());

        assertEquals(List.of("ITEM:A CHANGED"), summary(diff));
        assertEquals("G", diff.get(0).oldValues().get("LVL1"));
        assertTrue(diff.get(0).newValues().containsKey("LVL1"));
        assertNull(diff.get(0).newValues().get("LVL1"));
    }

    @Test
    void DF5_값_맵_키는_물리_칼럼명이고_PK_선분_칼럼이_없다() {
        List<VersionDiffEntry> diff = MasterCodeVersionDiffs.diff(V1_000, items(), cates(), cateItems());

        Map<String, Object> item = find(diff, "ITEM:1P").newValues();
        assertEquals(List.of("NAME", "ALTER_NAME", "SEQ", "DESCRIPTION", "LVL1", "LVL2", "LVL3", "LVL4", "LVL5",
                "ATTR01", "ATTR02", "ATTR03", "ATTR04", "ATTR05", "ATTR06", "ATTR07", "ATTR08", "ATTR09", "ATTR10"),
                List.copyOf(item.keySet()));
        Map<String, Object> cate = find(diff, "CATE:COATING").newValues();
        assertEquals(List.of("CATE_NAME", "DEF_KIND", "DEF_EXPR", "DEF_TARGET", "DESCRIPTION"),
                List.copyOf(cate.keySet()));
        assertEquals("8[0-9]", cate.get("DEF_EXPR"));
        assertEquals("REGEX", cate.get("DEF_KIND"));
        assertEquals(Map.of(), find(diff, "CATE_ITEM:MAJOR,1P").newValues());
    }

    @Test
    void DF6_버전_비교는_scale_을_무시한다() {
        List<VersionDiffEntry> scaled = MasterCodeVersionDiffs.diff(new BigDecimal("2"), items(), cates(), cateItems());

        assertEquals(List.of("ITEM:82 REMOVED", "ITEM:83 REMOVED", "CATE_ITEM:MAJOR,82 REMOVED"), summary(scaled));

        List<ItemRow> unscaled = List.of(
                item("A", new BigDecimal("1"), new BigDecimal("1.001"), "에이", null, 1),
                item("A", new BigDecimal("1.0010"), OPEN, "에이2", null, 1));
        assertEquals(List.of("ITEM:A CHANGED"), summary(MasterCodeVersionDiffs.diff(V1_001, unscaled, List.of(),
                List.of())));
    }

    @Test
    void DF7_정렬은_ITEM_CATE_CATE_ITEM_순이고_표_안에서_키_오름차순() {
        List<ItemRow> rows = List.of(item("Z", V1_001, OPEN, "z", null, 1), item("A", V1_001, OPEN, "a", null, 2));
        List<CateRow> cateRows = List.of(new CateRow("K", V1_001, OPEN, "k", "TABLE", null, null, null),
                new CateRow("B", V1_001, OPEN, "b", "TABLE", null, null, null));
        List<CateItemRow> members = List.of(new CateItemRow("K", "A", V1_001, OPEN),
                new CateItemRow("B", "Z", V1_001, OPEN), new CateItemRow("B", "A", V1_001, OPEN));

        List<VersionDiffEntry> diff = MasterCodeVersionDiffs.diff(V1_001, rows, cateRows, members);

        assertEquals(List.of("ITEM:A", "ITEM:Z", "CATE:B", "CATE:K", "CATE_ITEM:B,A", "CATE_ITEM:B,Z",
                "CATE_ITEM:K,A"), diff.stream().map(VersionDiffEntry::key).toList());
    }

    private static List<String> lvls(String lvl1) {
        List<String> l = new ArrayList<>(MasterCodeProcCdLedger.slots(5));
        l.set(0, lvl1);
        return l;
    }

    private static VersionDiffEntry find(List<VersionDiffEntry> diff, String key) {
        return diff.stream().filter(e -> e.key().equals(key)).findFirst().orElseThrow();
    }

    private static List<String> summary(List<VersionDiffEntry> diff) {
        return diff.stream().map(e -> e.key() + " " + e.kind()).collect(Collectors.toList());
    }
}
