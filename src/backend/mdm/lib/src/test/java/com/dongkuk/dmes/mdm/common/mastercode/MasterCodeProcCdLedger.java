package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.CateItemRow;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.CateRow;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.ItemRow;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeVersionView;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * TSK-06-05 design.md §3.1 — 원천 04:1059-1092 PROC_CD 원장(DRAFT v2.000 이 82·83 을 닫은 뒤 모습)을 순수 시험용으로 옮긴 것.
 * {@link #items()} 등은 조회 모델({@link MasterCodeLedgerQueries}) 행 모양, {@link #viewAt} 은 {@code from_ver <= V < to_ver}
 * 로 거른 버전 V 의 모습이다.
 */
final class MasterCodeProcCdLedger {

    static final String ID = "PROC_CD";
    static final BigDecimal V1_000 = new BigDecimal("1.000");
    static final BigDecimal V1_001 = new BigDecimal("1.001");
    static final BigDecimal V2_000 = new BigDecimal("2.000");
    static final BigDecimal OPEN = new BigDecimal("9999.000");

    private MasterCodeProcCdLedger() {
    }

    static List<ItemRow> items() {
        return List.of(
                item("1P", V1_000, OPEN, "PLTCM", "PLTCM", 11),
                item("2P", V1_001, OPEN, "PLTCM2", "PLTCM", 12),
                item("82", V1_000, V2_000, "2CGL", "CGL", 21),
                item("83", V1_000, V1_001, "3CGl", "CGL", 22),
                item("83", V1_001, V2_000, "3CGL", "CGL", 22));
    }

    static List<CateRow> cates() {
        return List.of(
                new CateRow("BASE", V1_000, OPEN, "전체", "REGEX", ".*", "CODE", null),
                new CateRow("COATING", V1_000, OPEN, "도금 공정", "REGEX", "8[0-9]", "CODE", null),
                new CateRow("COLD_MILL", V1_000, OPEN, "냉연 공정", "TABLE", null, null, null),
                new CateRow("MAJOR", V1_000, OPEN, "주요 공정", "TABLE", null, null, null));
    }

    static List<CateItemRow> cateItems() {
        return List.of(
                new CateItemRow("COLD_MILL", "1P", V1_000, OPEN),
                new CateItemRow("COLD_MILL", "2P", V1_001, OPEN),
                new CateItemRow("MAJOR", "1P", V1_000, OPEN),
                new CateItemRow("MAJOR", "2P", V1_001, OPEN),
                new CateItemRow("MAJOR", "82", V1_000, V2_000));
    }

    static MasterCodeVersionView viewAt(BigDecimal v) {
        return viewAt(v, items(), cates(), cateItems());
    }

    static MasterCodeVersionView viewAt(BigDecimal v, List<ItemRow> items, List<CateRow> cates,
                                        List<CateItemRow> cateItems) {
        List<MasterCodeItemRow> itemRows = items.stream().filter(r -> valid(r.fromVer(), r.toVer(), v))
                .map(r -> new MasterCodeItemRow(r.code(), r.fromVer(), r.toVer(), new MasterCodeItemValues(r.name(),
                        r.alterName(), r.seq(), r.description(), r.lvl(), r.attrs())))
                .sorted(MasterCodeCategoryResolver.ITEM_ORDER).toList();
        List<MasterCodeCateRow> cateRows = cates.stream().filter(r -> valid(r.fromVer(), r.toVer(), v))
                .map(r -> new MasterCodeCateRow(new CategoryDefinition(r.cateId(), r.cateName(),
                        CategoryKind.valueOf(r.defKind()), r.defExpr(),
                        r.defTarget() == null ? null : CategoryDefTarget.valueOf(r.defTarget()), r.description()),
                        r.fromVer(), r.toVer()))
                .toList();
        List<MasterCodeCateItemRow> cateItemRows = cateItems.stream().filter(r -> valid(r.fromVer(), r.toVer(), v))
                .map(r -> new MasterCodeCateItemRow(r.cateId(), r.code(), r.fromVer(), r.toVer())).toList();
        return new MasterCodeVersionView(new VersionRef(VersionTarget.MASTER_CODE, ID, v), itemRows, cateRows,
                cateItemRows);
    }

    static ItemRow item(String code, BigDecimal from, BigDecimal to, String name, String alterName, Integer seq) {
        return new ItemRow(code, from, to, name, alterName, seq, null, slots(5), slots(10));
    }

    static List<String> slots(int n) {
        return Collections.unmodifiableList(new ArrayList<>(Arrays.asList(new String[n])));
    }

    private static boolean valid(BigDecimal from, BigDecimal to, BigDecimal v) {
        return from.compareTo(v) <= 0 && v.compareTo(to) < 0;
    }
}
