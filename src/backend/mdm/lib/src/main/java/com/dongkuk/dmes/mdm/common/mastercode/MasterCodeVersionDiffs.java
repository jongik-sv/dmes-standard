package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.CateItemRow;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.CateRow;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.ItemRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeDiffConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentTable;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.Function;

/**
 * 버전 V 의 diff(TSK-06-05 design.md §6.2) — 순수 규칙(Spring·DB 없음). 세 표에서 from_ver = V 인 행(새)과 to_ver = V 인
 * 행(닫힘)만 보고(04:48), 같은 키의 닫힘·새 쌍은 CHANGED 하나로 합친다. 값이 같은 쌍은 항목을 내지 않고 SAME 을 내지 않는다.
 * 미적용 버전이 하나뿐이라(04:284) 이것이 곧 직전 RELEASED 대비 diff 다.
 *
 * <p>키는 D10({@link MasterCodeDiffConventions}), 값 맵 키는 물리 칼럼명(UPPER_SNAKE)이고 PK·FROM_VER·TO_VER·감사 칼럼을
 * 넣지 않는다. 버전 비교는 {@code compareTo} 로 한다 — SQLite 가 scale 이 다른 BigDecimal 을 돌려줄 수 있다.
 */
public final class MasterCodeVersionDiffs {

    private MasterCodeVersionDiffs() {
    }

    public static List<VersionDiffEntry> diff(BigDecimal v, List<ItemRow> items, List<CateRow> cates,
                                              List<CateItemRow> cateItems) {
        List<VersionDiffEntry> out = new ArrayList<>();
        out.addAll(table(v, items, r -> itemKey(r.code()), ItemRow::fromVer, ItemRow::toVer,
                MasterCodeVersionDiffs::itemValues));
        out.addAll(table(v, cates, r -> cateKey(r.cateId()), CateRow::fromVer, CateRow::toVer,
                MasterCodeVersionDiffs::cateValues));
        out.addAll(table(v, cateItems, r -> cateItemKey(r.cateId(), r.code()), CateItemRow::fromVer,
                CateItemRow::toVer, r -> new LinkedHashMap<>()));
        return out;
    }

    public static String itemKey(String code) {
        return key(MasterCodeSegmentTable.ITEM, code);
    }

    public static String cateKey(String cateId) {
        return key(MasterCodeSegmentTable.CATE, cateId);
    }

    public static String cateItemKey(String cateId, String code) {
        return key(MasterCodeSegmentTable.CATE_ITEM, cateId + MasterCodeDiffConventions.KEY_PART_SEPARATOR + code);
    }

    private static String key(MasterCodeSegmentTable table, String part) {
        return table.name() + MasterCodeDiffConventions.TABLE_KEY_SEPARATOR + part;
    }

    private static <R> List<VersionDiffEntry> table(BigDecimal v, List<R> rows, Function<R, String> key,
                                                    Function<R, BigDecimal> from, Function<R, BigDecimal> to,
                                                    Function<R, Map<String, Object>> values) {
        Map<String, R> opened = new TreeMap<>();
        Map<String, R> closed = new TreeMap<>();
        for (R row : rows) {
            if (from.apply(row).compareTo(v) == 0) {
                opened.put(key.apply(row), row);
            }
            if (to.apply(row).compareTo(v) == 0) {
                closed.put(key.apply(row), row);
            }
        }
        TreeSet<String> keys = new TreeSet<>(opened.keySet());
        keys.addAll(closed.keySet());
        List<VersionDiffEntry> out = new ArrayList<>();
        for (String k : keys) {
            R now = opened.get(k);
            R old = closed.get(k);
            if (now != null && old != null) {
                Map<String, Object> oldValues = values.apply(old);
                Map<String, Object> newValues = values.apply(now);
                if (!Objects.equals(oldValues, newValues)) {
                    out.add(new VersionDiffEntry(k, DiffKind.CHANGED, oldValues, newValues));
                }
            } else if (now != null) {
                out.add(new VersionDiffEntry(k, DiffKind.ADDED, null, values.apply(now)));
            } else {
                out.add(new VersionDiffEntry(k, DiffKind.REMOVED, values.apply(old), null));
            }
        }
        return out;
    }

    private static Map<String, Object> itemValues(ItemRow r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("NAME", r.name());
        m.put("ALTER_NAME", r.alterName());
        m.put("SEQ", r.seq());
        m.put("DESCRIPTION", r.description());
        for (int i = 0; i < r.lvl().size(); i++) {
            m.put("LVL" + (i + 1), r.lvl().get(i));
        }
        for (int i = 0; i < r.attrs().size(); i++) {
            m.put(String.format("ATTR%02d", i + 1), r.attrs().get(i));
        }
        return m;
    }

    private static Map<String, Object> cateValues(CateRow r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("CATE_NAME", r.cateName());
        m.put("DEF_KIND", r.defKind());
        m.put("DEF_EXPR", r.defExpr());
        m.put("DEF_TARGET", r.defTarget());
        m.put("DESCRIPTION", r.description());
        return m;
    }
}
