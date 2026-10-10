package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdKey;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdTable;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * 다시 가져오기 반영(import kind=APPLY_DIFF, README S2-14·스펙 D10)의 restore 요소 만들기. 순수 함수 — DB·스프링을 모른다.
 *
 * <p>넘겨받은 모델(서비스가 잠근 뒤 읽은 것)로 차이를 다시 계산하고, 고른 항목을 모델 사본에 차례로 적용한 뒤 원래 모델과의 차이를
 * restore 요소로 만든다. 요소는 (kind, id) 마다 하나다 — 엔진 restore 는 같은 묶음 안에서 앞 요소가 찍은 rev 도 "sinceRev 뒤의
 * 변경" 으로 보므로, 같은 요소를 두 번 적으면 스스로 충돌한다. 지운 요소는 delete 하나로 끝난다(지움이 고침보다 앞선다).
 *
 * <p>적용 순서: TABLE_ADDED → COLUMN_ADDED → 새 표의 DB FK → COLUMN_CHANGED → FK_ADDED → COLUMN_REMOVED → TABLE_REMOVED →
 * FK_REMOVED. 새 표·새 컬럼을 먼저 넣어야 FK 의 부모·컬럼이 풀린다.
 *
 * <p>검사 나눔: 항목 수(1~500)와 "모델에 표가 없음" 은 서비스가 본다. 여기서는 잠근 모델 기준으로 항목 id 를 본다.
 */
public final class ErdDiffApplier {

    /**
     * @param restore  넣을 restore(sinceRev = 요청 baseRev). staleIds 가 비어 있지 않으면 null.
     * @param summary  반영 요약. staleIds 가 비어 있지 않으면 null.
     * @param staleIds 넣을 수 없는 항목 id(요청 순서): 지금 차이 목록에 없는 id, 그리고 자식·부모 표나 컬럼이 모델에도 같은 묶음의
     *                 새 항목에도 없어 풀 수 없는 FK_ADDED. 비어 있지 않으면 서비스가 INVALID 로 거절한다.
     */
    public record Built(ErdCommand.Restore restore, Summary summary, List<String> staleIds) {}

    /** README ErdDiffApplySummary. removedIds 는 delete 요소 id(정렬). */
    public record Summary(int items, int tablesAdded, int tablesRemoved, int columnsAdded, int columnsRemoved,
                          int columnsChanged, int relationsAdded, int dbFkSet, int dbFkCleared, List<String> removedIds) {}

    private static final String REV = "_rev";
    private static final List<String> ADD_KINDS = List.of(ErdDbDiff.TABLE_ADDED, ErdDbDiff.COLUMN_ADDED);
    private static final List<String> OTHER_KINDS = List.of(ErdDbDiff.COLUMN_CHANGED, ErdDbDiff.FK_ADDED,
            ErdDbDiff.COLUMN_REMOVED, ErdDbDiff.TABLE_REMOVED, ErdDbDiff.FK_REMOVED);

    private record Key(String kind, String id) {}

    private final ErdModel original;
    private final ErdModel work;
    private final ErdDbMeta meta;
    private final ErdDictionary dict;
    private final Function<Character, String> ids;
    /** 사본에서 건드린 요소(처음 건드린 순서). 요소는 이 순서로 하나씩 나간다. */
    private final Set<Key> touched = new LinkedHashSet<>();
    private final List<String> newTables = new ArrayList<>();
    private int tablesAdded, tablesRemoved, columnsAdded, columnsRemoved, columnsChanged, relationsAdded, dbFkSet, dbFkCleared;

    private ErdDiffApplier(ErdModel model, ErdDbMeta meta, ErdDictionary dict, Function<Character, String> ids) {
        this.original = model;
        this.work = ErdModelCodec.copy(model);
        this.meta = meta;
        this.dict = dict;
        this.ids = ids;
    }

    public static Built build(ErdModel model, ErdDbMeta meta, ErdDictionary dict, List<String> itemIds, long sinceRev) {
        return build(model, meta, dict, itemIds, sinceRev, () -> UUID.randomUUID().toString());
    }

    /** @param idSource 새 요소 id 의 몸통. 접두("t-"·"c-"·"k-"·"r-")는 여기서 붙인다. 기본은 UUID 다. 시험은 순번을 넣는다. */
    public static Built build(ErdModel model, ErdDbMeta meta, ErdDictionary dict, List<String> itemIds, long sinceRev,
                              Supplier<String> idSource) {
        Map<String, ErdDbDiffItem> diff = new LinkedHashMap<>();
        for (ErdDbDiffItem it : ErdDbDiff.diff(model, meta)) diff.put(it.id(), it);
        List<String> wanted = itemIds.stream().distinct().toList();
        List<String> stale = wanted.stream().filter(id -> !diff.containsKey(id)).toList();
        if (!stale.isEmpty()) return new Built(null, null, stale);

        ErdDiffApplier a = new ErdDiffApplier(model, meta, dict, p -> p + "-" + idSource.get());
        List<ErdDbDiffItem> items = wanted.stream().map(diff::get).toList();
        for (String kind : ADD_KINDS) for (ErdDbDiffItem it : ofKind(items, kind)) a.apply(it);
        a.addNewTableForeignKeys();
        Set<String> unresolved = new HashSet<>();
        for (String kind : OTHER_KINDS) for (ErdDbDiffItem it : ofKind(items, kind)) if (!a.apply(it)) unresolved.add(it.id());
        if (!unresolved.isEmpty()) return new Built(null, null, wanted.stream().filter(unresolved::contains).toList());

        List<ErdChange> elements = a.elements();
        List<String> removed = elements.stream().filter(e -> ErdChange.DELETE.equals(e.op())).map(ErdChange::id).sorted().toList();
        Summary s = new Summary(wanted.size(), a.tablesAdded, a.tablesRemoved, a.columnsAdded, a.columnsRemoved,
                a.columnsChanged, a.relationsAdded, a.dbFkSet, a.dbFkCleared, removed);
        return new Built(new ErdCommand.Restore(sinceRev, elements), s, List.of());
    }

    private static List<ErdDbDiffItem> ofKind(List<ErdDbDiffItem> items, String kind) {
        return items.stream().filter(i -> i.kind().equals(kind)).sorted(Comparator.comparing(ErdDbDiffItem::id)).toList();
    }

    /** @return 넣었으면 true. 자식·부모를 풀 수 없는 FK_ADDED 만 false 다. */
    private boolean apply(ErdDbDiffItem it) {
        switch (it.kind()) {
            case ErdDbDiff.TABLE_ADDED -> addTable(it.table());
            case ErdDbDiff.COLUMN_ADDED -> addColumn(it.table(), it.column());
            case ErdDbDiff.COLUMN_CHANGED -> changeColumn(it.table(), it.column(), it.after());
            case ErdDbDiff.FK_ADDED -> {
                return addForeignKey(it);
            }
            case ErdDbDiff.COLUMN_REMOVED -> removeColumn(it.table(), it.column());
            case ErdDbDiff.TABLE_REMOVED -> removeTable(it.table());
            case ErdDbDiff.FK_REMOVED -> clearForeignKey(it);
            default -> throw new IllegalStateException("모르는 차이 종류입니다: " + it.kind());
        }
        return true;
    }

    // ---- 넣기 ----

    private void addTable(String phys) {
        ErdImportBuilder.TablePart part = ErdImportBuilder.oneTable(meta, phys, dict, ids);
        for (ErdChange e : part.elements()) put(e.kind(), e.id(), e.value());
        newTables.add(phys);
        tablesAdded++;
    }

    private void addColumn(String table, String column) {
        String tid = tableId(table);
        String cid = ids.apply('c');
        work.columns.put(cid, ErdImportBuilder.columnOf(tid, dbColumn(table, column), dict));
        touched.add(new Key("column", cid));
        work.tables.get(tid).columnOrder.add(cid);   // 표 columnOrder 끝에 붙인다
        touched.add(new Key("table", tid));
        columnsAdded++;
    }

    private void changeColumn(String table, String column, Map<String, Object> after) {
        String cid = columnId(tableId(table), column);
        ErdColumn c = work.columns.get(cid);
        c.dataType = (String) after.get("dataType");
        c.length = (Integer) after.get("length");
        c.scale = (Integer) after.get("scale");
        c.notNull = (Boolean) after.get("notNull");
        touched.add(new Key("column", cid));
        columnsChanged++;
    }

    /** 새 표(TABLE_ADDED)가 자식인 DB FK. 부모를 모델에서도 같은 묶음의 새 표에서도 못 찾으면 넣지 않는다(다음 차이의 FK_ADDED). */
    private void addNewTableForeignKeys() {
        for (String phys : newTables) {
            for (ErdDbMeta.Constraint k : meta.constraints()) {
                if (!"R".equals(k.type()) || !phys.equals(k.table())) continue;
                List<List<String>> pairs = resolvePairs(k.table(), k.columns(), k.refTable(), k.refColumns());
                if (pairs == null) continue;
                String rid = ids.apply('r');
                work.relations.put(rid, ErdImportBuilder.dbRelation(meta, k, tableId(k.table()), tableId(k.refTable()), pairs));
                touched.add(new Key("relation", rid));
                relationsAdded++;
            }
        }
    }

    /**
     * FK_ADDED: 같은 자식·부모·짝 집합의 관계가 있으면(상태 무관) dbFk=true. INFERRED 면 DB 로 바꾸고 접기 순위를 지운다.
     * CONFIRMED·REJECTED 는 그대로 둔다(D10). 없으면 새 관계(state DB, 가져오기 규칙의 식별·기수, 근거 DB_FK).
     */
    private boolean addForeignKey(ErdDbDiffItem it) {
        Map<String, Object> fk = it.after();
        String parent = (String) fk.get("parentTable");
        List<String> childCols = strings(fk.get("childColumns"));
        List<String> parentCols = strings(fk.get("parentColumns"));
        List<List<String>> pairs = resolvePairs(it.table(), childCols, parent, parentCols);
        if (pairs == null) return false;
        String childId = tableId(it.table()), parentId = tableId(parent);
        ErdDbMeta.Constraint k = constraint(it.table(), childCols, parent, parentCols);
        String existing = findRelation(childId, parentId, pairs, false);
        if (existing == null) {
            String rid = ids.apply('r');
            work.relations.put(rid, ErdImportBuilder.dbRelation(meta, k, childId, parentId, pairs));
            touched.add(new Key("relation", rid));
            relationsAdded++;
            return true;
        }
        ErdRelation r = work.relations.get(existing);
        r.dbFk = true;
        if ("INFERRED".equals(r.state)) {
            r.state = "DB";
            r.candidateRank = null;
        }
        ErdEvidence ev = new ErdEvidence("DB_FK", k.name());
        if (!r.evidence.contains(ev)) r.evidence.add(ev);
        touched.add(new Key("relation", existing));
        dbFkSet++;
        return true;
    }

    // ---- 지우기·끄기 ----

    private void removeColumn(String table, String column) {
        deleteColumn(columnId(tableId(table), column));
        columnsRemoved++;
    }

    private void removeTable(String phys) {
        String tid = tableId(phys);
        for (String cid : List.copyOf(work.tables.get(tid).columnOrder)) deleteColumn(cid);
        for (var e : List.copyOf(work.keys.entrySet())) if (tid.equals(e.getValue().table)) remove("key", e.getKey());
        for (var e : List.copyOf(work.relations.entrySet())) {
            if (tid.equals(e.getValue().child) || tid.equals(e.getValue().parent)) remove("relation", e.getKey());
        }
        remove("table", tid);
        tablesRemoved++;
    }

    /** 컬럼과 딸린 것: 키 columns 를 줄이고(비면 키를 지운다), 짝에 든 관계를 지우고, 표 columnOrder 에서 뺀다. */
    private void deleteColumn(String cid) {
        ErdColumn col = work.columns.get(cid);
        for (var e : List.copyOf(work.keys.entrySet())) {
            ErdKey k = e.getValue();
            if (!k.columns.remove(cid)) continue;
            if (k.columns.isEmpty()) remove("key", e.getKey());
            else touched.add(new Key("key", e.getKey()));
        }
        for (var e : List.copyOf(work.relations.entrySet())) {
            if (e.getValue().pairs.stream().anyMatch(p -> p.contains(cid))) remove("relation", e.getKey());
        }
        work.tables.get(col.table).columnOrder.remove(cid);
        touched.add(new Key("table", col.table));
        remove("column", cid);
    }

    /**
     * FK_REMOVED: 같은 관계(dbFk=true)의 dbFk=false. 상태 DB 는 CONFIRMED 로 바꾼다(DB 에 없는 FK 를 DB 상태로 두지 않는다).
     * 관계를 지우지 않는다. 같은 묶음의 COLUMN_REMOVED·TABLE_REMOVED 가 이미 지운 관계면 건너뛴다.
     */
    private void clearForeignKey(ErdDbDiffItem it) {
        Map<String, Object> fk = it.before();
        String parent = (String) fk.get("parentTable");
        List<List<String>> pairs = resolvePairs(it.table(), strings(fk.get("childColumns")), parent, strings(fk.get("parentColumns")));
        if (pairs == null) return;
        String rid = findRelation(tableId(it.table()), tableId(parent), pairs, true);
        if (rid == null) return;
        ErdRelation r = work.relations.get(rid);
        r.dbFk = false;
        if ("DB".equals(r.state)) r.state = "CONFIRMED";
        touched.add(new Key("relation", rid));
        dbFkCleared++;
    }

    // ---- 요소 만들기 ----

    /** 원래 모델과 사본의 차이를 요소마다 하나로: 없어졌으면 delete, 새로 생겼으면 upsert(_rev 없이), 바뀌었으면 바뀐 속성만 patch. */
    private List<ErdChange> elements() {
        List<ErdChange> out = new ArrayList<>();
        for (Key k : touched) {
            JsonNode before = snapshot(original, k), after = snapshot(work, k);
            if (after == null) {
                if (before != null) out.add(new ErdChange(k.kind(), k.id(), ErdChange.DELETE, null));
                continue;
            }
            ObjectNode a = ((ObjectNode) after).deepCopy();
            a.remove(REV);
            if (before == null) {
                out.add(new ErdChange(k.kind(), k.id(), ErdChange.UPSERT, a));
                continue;
            }
            ObjectNode patch = ErdModelCodec.MAPPER.createObjectNode();
            Set<String> props = new LinkedHashSet<>();
            before.fieldNames().forEachRemaining(props::add);
            a.fieldNames().forEachRemaining(props::add);
            props.remove(REV);
            for (String p : props) {
                JsonNode b = before.get(p) == null ? NullNode.getInstance() : before.get(p);
                JsonNode v = a.get(p) == null ? NullNode.getInstance() : a.get(p);
                if (!b.equals(v)) patch.set(p, v);
            }
            if (!patch.isEmpty()) out.add(new ErdChange(k.kind(), k.id(), ErdChange.PATCH, patch));
        }
        return out;
    }

    private static JsonNode snapshot(ErdModel m, Key k) {
        Object o = switch (k.kind()) {
            case "table" -> m.tables.get(k.id());
            case "column" -> m.columns.get(k.id());
            case "key" -> m.keys.get(k.id());
            case "relation" -> m.relations.get(k.id());
            default -> throw new IllegalArgumentException(k.kind());
        };
        return o == null ? null : ErdModelCodec.MAPPER.valueToTree(o);
    }

    private void put(String kind, String id, JsonNode value) {
        var mapper = ErdModelCodec.MAPPER;
        try {
            switch (kind) {
                case "table" -> work.tables.put(id, mapper.treeToValue(value, ErdTable.class));
                case "column" -> work.columns.put(id, mapper.treeToValue(value, ErdColumn.class));
                case "key" -> work.keys.put(id, mapper.treeToValue(value, ErdKey.class));
                case "relation" -> work.relations.put(id, mapper.treeToValue(value, ErdRelation.class));
                default -> throw new IllegalArgumentException(kind);
            }
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("가져오기 요소를 읽을 수 없습니다: " + id, e);
        }
        touched.add(new Key(kind, id));
    }

    private void remove(String kind, String id) {
        switch (kind) {
            case "table" -> work.tables.remove(id);
            case "column" -> work.columns.remove(id);
            case "key" -> work.keys.remove(id);
            case "relation" -> work.relations.remove(id);
            default -> throw new IllegalArgumentException(kind);
        }
        touched.add(new Key(kind, id));
    }

    // ---- 찾기(사본 기준 — 같은 묶음에서 넣거나 지운 것이 보인다) ----

    private String tableId(String phys) {
        for (var e : work.tables.entrySet()) if (phys.equals(e.getValue().phys)) return e.getKey();
        return null;
    }

    private String columnId(String tableId, String phys) {
        if (tableId == null) return null;
        for (String cid : work.tables.get(tableId).columnOrder) if (phys.equals(work.columns.get(cid).phys)) return cid;
        return null;
    }

    /** 물리명 짝 → [자식 컬럼 id, 부모 컬럼 id] 목록. 표·컬럼 하나라도 없으면 null. */
    private List<List<String>> resolvePairs(String child, List<String> childCols, String parent, List<String> parentCols) {
        String c = tableId(child), p = tableId(parent);
        if (c == null || p == null || childCols.size() != parentCols.size()) return null;
        List<List<String>> out = new ArrayList<>();
        for (int i = 0; i < childCols.size(); i++) {
            String a = columnId(c, childCols.get(i)), b = columnId(p, parentCols.get(i));
            if (a == null || b == null) return null;
            out.add(List.of(a, b));
        }
        return out;
    }

    /** 같은 모델의 같은 자식·부모·짝 집합(순서 무관) 관계. onlyDbFk 면 dbFk=true 인 것만 본다. */
    private String findRelation(String childId, String parentId, List<List<String>> pairs, boolean onlyDbFk) {
        Set<List<String>> want = new HashSet<>(pairs);
        for (var e : work.relations.entrySet()) {
            ErdRelation r = e.getValue();
            if (r.parentRef == null && childId.equals(r.child) && parentId.equals(r.parent)
                    && (!onlyDbFk || r.dbFk) && new HashSet<>(r.pairs).equals(want)) return e.getKey();
        }
        return null;
    }

    private ErdDbMeta.Column dbColumn(String table, String column) {
        return meta.tables().stream().filter(t -> t.name().equals(table)).flatMap(t -> t.columns().stream())
                .filter(c -> c.name().equals(column)).findFirst()
                .orElseThrow(() -> new IllegalStateException("DB 메타에 없는 컬럼입니다: " + table + "." + column));
    }

    private ErdDbMeta.Constraint constraint(String table, List<String> cols, String refTable, List<String> refCols) {
        return meta.constraints().stream().filter(k -> "R".equals(k.type()) && k.table().equals(table) && k.columns().equals(cols)
                        && Objects.equals(k.refTable(), refTable) && k.refColumns().equals(refCols)).findFirst()
                .orElseThrow(() -> new IllegalStateException("DB 메타에 없는 FK 입니다: " + table + cols + ">" + refTable + refCols));
    }

    @SuppressWarnings("unchecked")
    private static List<String> strings(Object o) {
        return (List<String>) o;
    }
}
