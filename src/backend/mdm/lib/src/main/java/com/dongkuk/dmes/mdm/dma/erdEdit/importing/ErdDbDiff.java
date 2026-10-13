package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdAuditColumns;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdTable;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/** DB 와 모델의 차이(README S4, 스펙 D10). 읽기 전용 순수 함수. 반영(applyDbDiff)은 단계 2 다. */
public final class ErdDbDiff {

    public static final String TABLE_ADDED = "TABLE_ADDED";
    public static final String TABLE_REMOVED = "TABLE_REMOVED";
    public static final String COLUMN_ADDED = "COLUMN_ADDED";
    public static final String COLUMN_REMOVED = "COLUMN_REMOVED";
    public static final String COLUMN_CHANGED = "COLUMN_CHANGED";
    public static final String FK_ADDED = "FK_ADDED";
    public static final String FK_REMOVED = "FK_REMOVED";
    /** 표 하나의 컬럼 순서 차이. 모델·DB 양쪽에 있는 컬럼의 상대 순서만 본다(한쪽에만 있는 컬럼은 COLUMN_ADDED·REMOVED 몫). */
    public static final String COLUMN_ORDER = "COLUMN_ORDER";

    private ErdDbDiff() {
    }

    /** 양쪽에 있는 컬럼(물리명)의 상대 순서가 모델과 DB 에서 다른가. */
    static boolean orderDiffers(List<String> modelOrder, List<String> dbOrder) {
        Set<String> inModel = new HashSet<>(modelOrder), inDb = new HashSet<>(dbOrder);
        return !modelOrder.stream().filter(inDb::contains).toList()
                .equals(dbOrder.stream().filter(inModel::contains).toList());
    }

    /**
     * COLUMN_ORDER 반영 뒤 순서: 양쪽에 있는 컬럼은 DB 순서로, 모델에만 있는 컬럼은 기존 상대 순서로 감사 묶음 바로 앞에
     * (ErdAuditColumns.endInsertIndex, 엔진 addColumn 과 같은 규칙). 반영 뒤에는 orderDiffers 가 false 다.
     *
     * @param columnOrder 모델 표의 컬럼 id 순서
     * @param physOf      컬럼 id → 물리명
     * @param dbOrder     DB 컬럼 물리명 순서
     */
    public static List<String> targetOrder(List<String> columnOrder, Function<String, String> physOf, List<String> dbOrder) {
        Map<String, String> idByPhys = new HashMap<>();
        for (String cid : columnOrder) idByPhys.putIfAbsent(physOf.apply(cid), cid);
        List<String> out = new ArrayList<>();
        for (String phys : dbOrder) {
            String cid = idByPhys.get(phys);
            if (cid != null) out.add(cid);
        }
        Set<String> placed = new HashSet<>(out);
        List<String> modelOnly = columnOrder.stream().filter(cid -> !placed.contains(cid)).toList();
        out.addAll(ErdAuditColumns.endInsertIndex(out, physOf), modelOnly);
        return out;
    }

    public static List<ErdDbDiffItem> diff(ErdModel model, ErdDbMeta meta) {
        List<ErdDbDiffItem> out = new ArrayList<>();
        Map<String, ErdTable> modelTables = new LinkedHashMap<>();
        model.tables.values().forEach(t -> modelTables.put(t.phys, t));
        Set<String> dbTables = new HashSet<>();
        for (ErdDbMeta.Table t : meta.tables()) {
            dbTables.add(t.name());
            ErdTable mt = modelTables.get(t.name());
            if (mt == null) {
                out.add(item(TABLE_ADDED, t.name(), null, null, null, t.name()));
                continue;
            }
            Map<String, ErdColumn> modelCols = new LinkedHashMap<>();
            for (String cid : mt.columnOrder) {
                ErdColumn c = model.columns.get(cid);
                if (c != null) modelCols.put(c.phys, c);
            }
            Set<String> dbCols = new HashSet<>();
            for (ErdDbMeta.Column c : t.columns()) {
                dbCols.add(c.name());
                ErdImportBuilder.ColumnType ty = ErdImportBuilder.typeOf(c);
                Map<String, Object> after = type(ty.dataType(), ty.length(), ty.scale(), !c.nullable());
                ErdColumn mc = modelCols.get(c.name());
                if (mc == null) {
                    out.add(item(COLUMN_ADDED, t.name(), c.name(), null, after, t.name() + "." + c.name()));
                } else {
                    Map<String, Object> before = type(mc.dataType, mc.length, mc.scale, mc.notNull);
                    if (!before.equals(after)) out.add(item(COLUMN_CHANGED, t.name(), c.name(), before, after, t.name() + "." + c.name()));
                }
            }
            for (ErdColumn mc : modelCols.values()) {
                if (!dbCols.contains(mc.phys)) {
                    out.add(item(COLUMN_REMOVED, t.name(), mc.phys, type(mc.dataType, mc.length, mc.scale, mc.notNull), null,
                            t.name() + "." + mc.phys));
                }
            }
            List<String> dbOrder = t.columns().stream().map(ErdDbMeta.Column::name).toList();
            if (orderDiffers(new ArrayList<>(modelCols.keySet()), dbOrder)) {   // 물리명 null 이 있을 수 있어 List.copyOf 를 쓰지 않는다
                out.add(item(COLUMN_ORDER, t.name(), null, null, null, t.name()));
            }
        }
        for (String phys : modelTables.keySet()) {
            if (!dbTables.contains(phys)) out.add(item(TABLE_REMOVED, phys, null, null, null, phys));
        }
        // 짝 순서만 다른 FK 는 같은 FK 다(deferred 30 의 짝 집합, ErdDiffApplier.findRelation 과 같은 규칙).
        // 맞춰 보기는 짝 집합 키로 하고, 항목 id 는 그쪽(DB·모델)의 순서 그대로 쓴다.
        Map<String, Fk> dbFks = new LinkedHashMap<>();
        for (ErdDbMeta.Constraint k : meta.constraints()) {
            if ("R".equals(k.type())) {
                Fk fk = new Fk(k.table(), k.columns(), k.refTable(), k.refColumns());
                dbFks.put(fk.matchKey(), fk);
            }
        }
        Map<String, Fk> modelFks = new LinkedHashMap<>();
        for (ErdRelation r : model.relations.values()) {
            Fk fk = modelFk(model, r);
            if (fk != null) modelFks.put(fk.matchKey(), fk);
        }
        dbFks.forEach((match, fk) -> {
            if (!modelFks.containsKey(match) && modelTables.containsKey(fk.child())) {
                out.add(item(FK_ADDED, fk.child(), null, null, fk.json(), fk.key()));
            }
        });
        modelFks.forEach((match, fk) -> {
            if (!dbFks.containsKey(match) && dbTables.contains(fk.child())) {
                out.add(item(FK_REMOVED, fk.child(), null, fk.json(), null, fk.key()));
            }
        });
        out.sort(Comparator.comparing(ErdDbDiffItem::id));
        return out;
    }

    private record Fk(String child, List<String> childColumns, String parent, List<String> parentColumns) {
        /** 항목 id 꼬리. 짝 순서를 그대로 둔다. */
        String key() {
            return fkKey(child, childColumns, parent, parentColumns);
        }

        /** 맞춰 보기 키. 짝(자식=부모)을 정렬해 순서를 지운다. */
        String matchKey() {
            List<String> pairs = new ArrayList<>();
            for (int i = 0; i < childColumns.size(); i++) pairs.add(childColumns.get(i) + "=" + parentColumns.get(i));
            pairs.sort(Comparator.naturalOrder());
            return child + ">" + parent + "{" + String.join(",", pairs) + "}";
        }

        Map<String, Object> json() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("parentTable", parent);
            m.put("childColumns", childColumns);
            m.put("parentColumns", parentColumns);
            return m;
        }
    }

    /** dbFk 관계를 물리명으로. 다른 모델 부모(parentRef)·끊어진 참조는 null. */
    private static Fk modelFk(ErdModel m, ErdRelation r) {
        if (!r.dbFk || r.parentRef != null) return null;
        ErdTable child = m.tables.get(r.child), parent = m.tables.get(r.parent);
        if (child == null || parent == null) return null;
        List<String> cc = new ArrayList<>(), pc = new ArrayList<>();
        for (List<String> p : r.pairs) {
            ErdColumn c = m.columns.get(p.get(0)), q = m.columns.get(p.get(1));
            if (c == null || q == null) return null;
            cc.add(c.phys);
            pc.add(q.phys);
        }
        return new Fk(child.phys, cc, parent.phys, pc);
    }

    static String fkKey(String child, List<String> childColumns, String parent, List<String> parentColumns) {
        return child + "(" + String.join(",", childColumns) + ")>" + parent + "(" + String.join(",", parentColumns) + ")";
    }

    /** null 값을 담아야 하므로 Map.of 를 쓰지 않는다. */
    private static Map<String, Object> type(String dataType, Integer length, Integer scale, boolean notNull) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("dataType", dataType);
        m.put("length", length);
        m.put("scale", scale);
        m.put("notNull", notNull);
        return m;
    }

    private static ErdDbDiffItem item(String kind, String table, String column, Map<String, Object> before,
                                      Map<String, Object> after, String idTail) {
        return new ErdDbDiffItem(kind + ":" + idTail, kind, table, column, before, after);
    }
}
