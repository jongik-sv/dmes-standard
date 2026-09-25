package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.OPEN;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.V1_000;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.V1_001;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.V2_000;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.cateItems;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.item;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.items;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeProcCdLedger.viewAt;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryChanges.Change;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryChanges.Summary;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.CateRow;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.ItemRow;
import java.util.List;
import org.junit.jupiter.api.Test;

/** TSK-06-05 design.md §3.1 CC1~CC4 — 직전 RELEASED 대비 카테고리 해석 요약(§6.4, 불변 규칙 I16). */
class MasterCodeCategoryChangesTest {

    @Test
    void CC1_샘플_v1_001_대_v1_000_은_2P_가_세_카테고리에_추가되고_COATING_은_그대로() {
        Summary summary = MasterCodeCategoryChanges.summarize(viewAt(V1_000), viewAt(V1_001));

        assertEquals(List.of(
                "BASE CHANGED 3->4 +[2P] -[] reduced=false",
                "COLD_MILL CHANGED 1->2 +[2P] -[] reduced=false",
                "MAJOR CHANGED 2->3 +[2P] -[] reduced=false"), lines(summary));
        assertEquals(List.of("도금 공정"), summary.unchanged());
        Change base = summary.changed().get(0);
        assertEquals("전체", base.cateName());
    }

    @Test
    void CC2_샘플_v2_000_대_v1_001_은_82_83_이_빠져_줄어든다() {
        Summary summary = MasterCodeCategoryChanges.summarize(viewAt(V1_001), viewAt(V2_000));

        assertEquals(List.of(
                "BASE CHANGED 4->2 +[] -[82, 83] reduced=true",
                "COATING CHANGED 2->0 +[] -[82, 83] reduced=true",
                "MAJOR CHANGED 3->2 +[] -[82] reduced=true"), lines(summary));
        assertEquals(List.of("냉연 공정"), summary.unchanged());
    }

    @Test
    void CC3_최초_버전은_모든_카테고리가_NEW_이고_before_가_없다() {
        Summary summary = MasterCodeCategoryChanges.summarize(null, viewAt(V1_000));

        assertEquals(List.of(
                "BASE NEW null->3 +[1P, 82, 83] -[] reduced=false",
                "COATING NEW null->2 +[82, 83] -[] reduced=false",
                "COLD_MILL NEW null->1 +[1P] -[] reduced=false",
                "MAJOR NEW null->2 +[1P, 82] -[] reduced=false"), lines(summary));
        assertEquals(List.of(), summary.unchanged());
        assertTrue(summary.changed().stream().allMatch(c -> c.beforeCount() == null));
    }

    @Test
    void CC4_V_에서_닫힌_카테고리는_CLOSED_줄어듦_추가한_카테고리는_NEW() {
        List<CateRow> cates = List.of(
                new CateRow("BASE", V1_000, OPEN, "전체", "REGEX", ".*", "CODE", null),
                new CateRow("COATING", V1_000, V1_001, "도금 공정", "REGEX", "8[0-9]", "CODE", null),
                new CateRow("PLTCM", V1_001, OPEN, "산세 공정", "REGEX", ".P", "CODE", null));

        Summary summary = MasterCodeCategoryChanges.summarize(
                viewAt(V1_000, items(), cates, cateItems()), viewAt(V1_001, items(), cates, cateItems()));

        Change closed = find(summary, "COATING");
        assertEquals("CLOSED", closed.kind());
        assertTrue(closed.reduced());
        assertEquals(2, closed.beforeCount());
        assertNull(closed.afterCount());
        assertEquals(List.of("82", "83"), closed.removedCodes());
        assertEquals("도금 공정", closed.cateName());
        Change added = find(summary, "PLTCM");
        assertEquals("NEW", added.kind());
        assertFalse(added.reduced());
        assertEquals(List.of("1P", "2P"), added.addedCodes());
    }

    @Test
    void CC4_건수가_같아도_빠진_코드가_있으면_줄어듦() {
        List<CateRow> cates = List.of(new CateRow("BASE", V1_000, OPEN, "전체", "REGEX", ".*", "CODE", null));
        List<ItemRow> swapped = List.of(item("X", V1_000, V1_001, "엑스", null, 1),
                item("Y", V1_001, OPEN, "와이", null, 2));

        Summary summary = MasterCodeCategoryChanges.summarize(viewAt(V1_000, swapped, cates, List.of()),
                viewAt(V1_001, swapped, cates, List.of()));

        assertEquals(List.of("BASE CHANGED 1->1 +[Y] -[X] reduced=true"), lines(summary));
    }

    private static Change find(Summary summary, String cateId) {
        return summary.changed().stream().filter(c -> c.cateId().equals(cateId)).findFirst().orElseThrow();
    }

    private static List<String> lines(Summary summary) {
        return summary.changed().stream().map(c -> c.cateId() + " " + c.kind() + " " + c.beforeCount() + "->"
                + c.afterCount() + " +" + c.addedCodes() + " -" + c.removedCodes() + " reduced=" + c.reduced())
                .toList();
    }
}
