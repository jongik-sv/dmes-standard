package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeItemValues;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** TSK-06-03 design.md §1.3 — 원천 04 샘플 STEEL_STD 8행(lvl_cnt 3, attr01 라벨 `인장강도`)을 순수 시험용으로 옮긴 것. */
final class MasterCodeSamples {

    static final BigDecimal V1_000 = new BigDecimal("1.000");

    private MasterCodeSamples() {
    }

    static List<MasterCodeItemEntry> steelStd() {
        return List.of(
                entry("KS-9", "규격 외 KS", 9, null, "KS", null, null),
                entry("KS-3-CGCC", "CGCC", 1, "270", "KS", "KS-3", null),
                entry("KS-3-CGCD", "CGCD", 2, "270", "KS", "KS-3", null),
                entry("KS-3-CGCH", "CGCH(기본)", 3, "270", "KS", "KS-3", null),
                entry("KS-3-CGCH-Z12", "CGCH Z12", 1, "270", "KS", "KS-3", "KS-3-CGCH"),
                entry("KS-3-CGCH-Z27", "CGCH Z27", 2, "270", "KS", "KS-3", "KS-3-CGCH"),
                entry("JIS-3-CGCC", "CGCC(JIS)", 1, "270", "JIS", "JIS-3", null),
                entry("JIS-4-SPCC", "SPCC", 1, "270", "JIS", "JIS-4", null));
    }

    static List<MasterCodeItemRow> steelStdRows() {
        return steelStd().stream()
                .map(e -> new MasterCodeItemRow(e.code(), V1_000, MasterCodeConventions.OPEN_TO_VER, e.values()))
                .toList();
    }

    static MasterCodeItemEntry entry(String code, String name, Integer seq, String attr01, String... lvls) {
        return new MasterCodeItemEntry(code, values(name, seq, attr01, lvls));
    }

    static MasterCodeItemValues values(String name, Integer seq, String attr01, String... lvls) {
        List<String> l = new ArrayList<>(Arrays.asList(new String[MasterCodeConventions.LVL_SLOTS]));
        for (int i = 0; i < lvls.length; i++) {
            l.set(i, lvls[i]);
        }
        List<String> a = new ArrayList<>(Arrays.asList(new String[MasterCodeConventions.ATTR_SLOTS]));
        a.set(0, attr01);
        return new MasterCodeItemValues(name, null, seq, null, l, a);
    }

    /** 라벨 10칸 — 앞에서부터 준 값, 나머지는 null. */
    static List<String> labels(String... names) {
        List<String> out = new ArrayList<>(Arrays.asList(new String[MasterCodeConventions.ATTR_SLOTS]));
        for (int i = 0; i < names.length; i++) {
            out.set(i, names[i]);
        }
        return out;
    }
}
