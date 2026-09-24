package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSamples.V1_000;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSamples.steelStdRows;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSamples.values;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver.Reason;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver.Resolution;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver.ResolvedRow;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemRow;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

/** TSK-06-03 design.md §4.2 R1~R6 — 카테고리 해석(§6.5). 저장된 정의 기준 읽기 전용 미리보기(D11). */
class MasterCodeCategoryResolverTest {

    private static final BigDecimal OPEN = MasterCodeConventions.OPEN_TO_VER;

    @Test
    void R1_REGEX_는_전체_일치다() {
        List<MasterCodeItemRow> items = List.of(item("82", 1), item("182", 2), item("820", 3), item("1P", 4));

        Resolution r = MasterCodeCategoryResolver.resolve(items, regex("COATING", "8[0-9]", null), List.of());

        assertEquals(List.of("82"), hits(r));
        assertEquals(1, r.hitCount());
        assertEquals(4, r.total());
    }

    @Test
    void R2_대상_칸_LVL1_은_lvl1_값을_보고_NULL_이면_TARGET_NULL() {
        List<MasterCodeItemRow> items = new java.util.ArrayList<>(steelStdRows());
        items.add(new MasterCodeItemRow("FLAT", V1_000, OPEN, values("평", 5, null)));

        Resolution r = MasterCodeCategoryResolver.resolve(items, regex("KS_ONLY", "KS", CategoryDefTarget.LVL1),
                List.of());

        assertEquals(6, r.hitCount());
        assertEquals(List.of("KS-3-CGCC", "KS-3-CGCD", "KS-3-CGCH", "KS-3-CGCH-Z12", "KS-3-CGCH-Z27", "KS-9"),
                hits(r).stream().sorted().toList());
        ResolvedRow flat = row(r, "FLAT");
        assertFalse(flat.hit());
        assertEquals(Reason.TARGET_NULL, flat.reason());
    }

    @Test
    void R3_TABLE_은_CATE_ITEM_과_V_코드의_교집합이고_없는_코드는_경고한다() {
        List<MasterCodeItemRow> items = List.of(item("1P", 11), item("2P", 12), item("82", 21));
        List<MasterCodeCateItemRow> cateItems = List.of(
                new MasterCodeCateItemRow("MAJOR", "1P", V1_000, OPEN),
                new MasterCodeCateItemRow("MAJOR", "83", V1_000, OPEN),
                new MasterCodeCateItemRow("OTHER", "2P", V1_000, OPEN));

        Resolution r = MasterCodeCategoryResolver.resolve(items, table("MAJOR"), cateItems);

        assertEquals(List.of("1P"), hits(r));
        assertEquals(Reason.MEMBER, row(r, "1P").reason());
        assertEquals(Reason.NOT_MEMBER, row(r, "2P").reason());
        assertEquals(List.of("CATE_ITEM_CODE_MISSING:83"), warnings(r));
    }

    @Test
    void R4_결과가_비면_CATEGORY_EMPTY() {
        Resolution r = MasterCodeCategoryResolver.resolve(List.of(item("1P", 11)), regex("COATING", "8[0-9]", null),
                List.of());

        assertEquals(0, r.hitCount());
        assertEquals(List.of("CATEGORY_EMPTY:COATING"), warnings(r));
    }

    @Test
    void R5_근거는_REGEX_MATCH_NO_MATCH_와_대상_값_TABLE_MEMBER() {
        Resolution r = MasterCodeCategoryResolver.resolve(List.of(item("82", 1), item("1P", 2)),
                regex("COATING", "8[0-9]", CategoryDefTarget.CODE), List.of());

        assertEquals(Reason.MATCH, row(r, "82").reason());
        assertEquals("82", row(r, "82").targetValue());
        assertEquals(Reason.NO_MATCH, row(r, "1P").reason());
        assertEquals("1P", row(r, "1P").targetValue());
        assertEquals("REGEX", r.defKind());
        assertEquals("CODE", r.defTarget());
        assertEquals("8[0-9]", r.defExpr());
    }

    @Test
    void R6_정규식_문법_오류는_예외_대신_invalidExpression() {
        Resolution r = MasterCodeCategoryResolver.resolve(List.of(item("82", 1)), regex("BAD", "8[0-9", null),
                List.of());

        assertTrue(r.invalidExpression());
        assertEquals(0, r.hitCount());
        assertEquals(List.of(), hits(r));
    }

    @Test
    void 행은_seq_null_마지막_그다음_코드_순이다() {
        Resolution r = MasterCodeCategoryResolver.resolve(List.of(item("B", null), item("C", 1), item("A", 1)),
                regex("BASE", ".*", null), List.of());

        assertEquals(List.of("A", "C", "B"), r.rows().stream().map(ResolvedRow::code).toList());
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private static MasterCodeItemRow item(String code, Integer seq) {
        return new MasterCodeItemRow(code, V1_000, OPEN, values(code + " 이름", seq, null));
    }

    private static MasterCodeCateRow regex(String id, String expr, CategoryDefTarget target) {
        return new MasterCodeCateRow(new CategoryDefinition(id, id, CategoryKind.REGEX, expr, target, null), V1_000, OPEN);
    }

    private static MasterCodeCateRow table(String id) {
        return new MasterCodeCateRow(new CategoryDefinition(id, id, CategoryKind.TABLE, null, null, null), V1_000, OPEN);
    }

    private static List<String> hits(Resolution r) {
        return r.rows().stream().filter(ResolvedRow::hit).map(ResolvedRow::code).toList();
    }

    private static ResolvedRow row(Resolution r, String code) {
        return r.rows().stream().filter(x -> x.code().equals(code)).findFirst().orElseThrow();
    }

    private static List<String> warnings(Resolution r) {
        return r.warnings().stream().map((MdmCheckIssue w) -> w.code() + ":" + w.itemKey()).toList();
    }
}
