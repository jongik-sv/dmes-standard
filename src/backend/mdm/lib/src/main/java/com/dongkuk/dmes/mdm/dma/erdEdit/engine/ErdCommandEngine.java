package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdTypeMapping;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;

/** ERD 명령 엔진(스펙 4.1~4.3). 순수 함수 — DB·시각·스프링을 모른다. */
public final class ErdCommandEngine {

    static final Set<String> TABLE_PROPS = Set.of("phys", "logical", "comment");
    static final Set<String> COLUMN_PROPS = Set.of("phys", "logical", "domainId", "dataType", "length", "scale",
            "notNull", "default", "comment");
    static final Set<String> KEY_PROPS = Set.of("name", "columns");
    static final Set<String> RELATION_PROPS = Set.of("identifying", "cardinality", "dbFk");

    private final ErdNaming naming;

    public ErdCommandEngine(ErdNaming naming) {
        this.naming = naming;
    }

    ErdNaming naming() {
        return naming;
    }

    public ApplyOutcome apply(ErdModel current, long baseRev, long newRev, String session, List<ErdCommand> commands) {
        Ctx c = new Ctx(ErdModelCodec.copy(current), baseRev, newRev, session);
        boolean hasRestore = false;
        for (int i = 0; i < commands.size(); i++) {
            c.index = i;
            ErdCommand cmd = commands.get(i);
            hasRestore |= cmd instanceof Restore;
            try {
                if (cmd == null) throw c.invalid("명령이 비었습니다", "op 를 넣으세요", null, null);
                dispatch(c, cmd);
            } catch (Reject r) {
                return new ApplyOutcome.Rejected(r.rejection);
            } catch (RuntimeException e) {
                // 입력이 뜻밖의 모양이라 엔진이 예외를 낸 경우. 작업 사본만 버리면 되므로 원본 모델은 안전하다.
                return new ApplyOutcome.Rejected(new ErdRejection(ErdRejection.INVALID, i,
                        "명령을 처리할 수 없습니다: " + e.getMessage(), "명령 JSON 의 모양과 값 형식을 확인하세요",
                        null, null, null, null, null, null));
            }
        }
        c.index = Math.max(0, commands.size() - 1);
        try {
            ErdIntegrity.check(c, hasRestore);
        } catch (Reject r) {
            return new ApplyOutcome.Rejected(r.rejection);
        }
        List<ErdChange> changes = new ArrayList<>();
        List<ErdChange> restore = new ArrayList<>();
        List<String> touchedColumns = new ArrayList<>();
        Set<String> touchedTables = new TreeSet<>();
        for (var e : c.before.entrySet()) {
            String kind = e.getKey().kind(), id = e.getKey().id();
            JsonNode before = e.getValue();
            JsonNode after = c.snapshot(kind, id);
            changes.add(new ErdChange(kind, id, after == null ? ErdChange.DELETE : ErdChange.UPSERT, after));
            ErdChange back = inverseOf(kind, id, before, after);
            if (back != null) restore.add(back);
            if (kind.equals("column") && after != null) touchedColumns.add(id);
            touchedTables(kind, id, before, after, touchedTables);
        }
        List<ErdWarning> warnings = new ArrayList<>(naming.warnings(c.m, touchedColumns));
        warnings.addAll(c.warnings);
        List<ErdCommand> inverse = restore.isEmpty() ? List.of() : List.of(new Restore(newRev, restore));
        return new ApplyOutcome.Applied(c.m, changes, inverse, warnings, List.copyOf(touchedTables));
    }

    /** deferred 25: 바뀐 요소가 걸친 표 id. 지운 요소는 지우기 전 값, 만든 요소는 만든 뒤 값으로 본다. 다른 모델 부모(null)는 뺀다. */
    private static void touchedTables(String kind, String id, JsonNode before, JsonNode after, Set<String> out) {
        for (JsonNode n : new JsonNode[] {before, after}) {
            if (n == null) continue;
            switch (kind) {
                case "table" -> out.add(id);
                case "column", "key" -> addText(n, "table", out);
                case "relation" -> {
                    addText(n, "child", out);
                    addText(n, "parent", out);
                }
                default -> { }
            }
        }
    }

    private static void addText(JsonNode n, String field, Set<String> out) {
        JsonNode v = n.get(field);
        if (v != null && v.isTextual()) out.add(v.asText());
    }

    /**
     * 요소 하나를 묶음 전 상태로 되돌리는 역 델타. 만들어진 요소는 delete, 지워진 요소는 전체 upsert,
     * 고쳐진 요소는 바뀐 속성만 담은 patch 다 — 그래야 되돌릴 때 다른 속성의 나중 변경을 건드리지 않는다.
     */
    private static ErdChange inverseOf(String kind, String id, JsonNode before, JsonNode after) {
        if (before == null) return after == null ? null : new ErdChange(kind, id, ErdChange.DELETE, null);
        if (after == null) return new ErdChange(kind, id, ErdChange.UPSERT, before);
        ObjectNode patch = ErdModelCodec.MAPPER.createObjectNode();
        Set<String> props = new LinkedHashSet<>();
        before.fieldNames().forEachRemaining(props::add);
        after.fieldNames().forEachRemaining(props::add);
        props.remove(Ctx.REV);
        for (String p : props) {
            JsonNode b = before.get(p) == null ? NullNode.getInstance() : before.get(p);
            JsonNode a = after.get(p) == null ? NullNode.getInstance() : after.get(p);
            if (!Ctx.jsonEquals(b, a)) patch.set(p, b);
        }
        return patch.isEmpty() ? null : new ErdChange(kind, id, ErdChange.PATCH, patch);
    }

    /** 관계 연산이 PK 지정 같은 다른 명령을 같은 묶음 안에서 부를 때 쓴다. */
    void dispatchPublic(Ctx c, ErdCommand cmd) {
        dispatch(c, cmd);
    }

    private void dispatch(Ctx c, ErdCommand cmd) {
        switch (cmd) {
            case AddTable a -> addTable(c, a);
            case UpdateTable u -> updateTable(c, u);
            case DeleteTable d -> deleteTable(c, d.id());
            case AddColumn a -> addColumn(c, a);
            case UpdateColumn u -> updateColumn(c, u);
            case MoveColumn mv -> moveColumn(c, mv);
            case DeleteColumn d -> deleteColumn(c, d.id());
            case ApplyDomain ad -> applyDomain(c, ad);
            case SetPrimaryKey pk -> setPrimaryKey(c, pk);
            case AddKey a -> addKey(c, a);
            case UpdateKey u -> updateKey(c, u);
            case DeleteKey d -> deleteKey(c, d.id());
            case AddRelation a -> ErdRelationOps.add(this, c, a);
            case UpdateRelation u -> ErdRelationOps.update(this, c, u);
            case ConfirmRelation cr -> ErdRelationOps.setState(c, cr.id(), "CONFIRMED");
            case RejectRelation rr -> ErdRelationOps.setState(c, rr.id(), "REJECTED");
            case DeleteRelation d -> ErdRelationOps.delete(c, d.id());
            case Restore r -> restore(c, r);
        }
    }

    // ---- 표 ----

    private void addTable(Ctx c, AddTable a) {
        String id = c.newIdOrGiven(a.id(), 't');
        requireOracleId(c, a.phys(), "phys", id);
        if (c.m.tables.values().stream().anyMatch(t -> a.phys().equals(t.phys))) {
            throw c.invalid("같은 물리명의 표가 이미 있습니다: " + a.phys(), "다른 물리명을 쓰세요", id, "phys");
        }
        c.touch("table", id);
        ErdTable t = new ErdTable();
        t.phys = a.phys();
        t.logical = a.logical();
        t.comment = a.comment() == null ? "" : a.comment();
        c.m.tables.put(id, t);
        c.m.tombstones.remove(id);
        c.stamp(t.rev, TABLE_PROPS);
    }

    private void updateTable(Ctx c, UpdateTable u) {
        ErdTable t = c.table(u.id());
        c.requireKnownKeys(u.set(), TABLE_PROPS, u.id());
        c.checkConflict(t.rev, u.set().keySet(), u.id(), c.node(t));
        c.touch("table", u.id());
        for (var e : u.set().entrySet()) {
            switch (e.getKey()) {
                case "phys" -> {
                    String phys = c.strReq(u.set(), "phys", u.id());
                    requireOracleId(c, phys, "phys", u.id());
                    boolean dup = c.m.tables.entrySet().stream()
                            .anyMatch(x -> !x.getKey().equals(u.id()) && phys.equals(x.getValue().phys));
                    if (dup) throw c.invalid("같은 물리명의 표가 이미 있습니다: " + phys, "다른 물리명을 쓰세요", u.id(), "phys");
                    t.phys = phys;
                }
                case "logical" -> t.logical = c.strOrNull(u.set(), "logical", u.id());
                case "comment" -> t.comment = c.strOrNull(u.set(), "comment", u.id());
                default -> throw new IllegalStateException();
            }
        }
        c.stamp(t.rev, u.set().keySet());
    }

    void deleteTable(Ctx c, String id) {
        ErdTable t = c.table(id);
        c.checkConflict(t.rev, t.rev.keySet(), id, c.node(t));
        // deferred 31: 딸린 컬럼·키·관계도 지우기 전에 충돌을 본다(deleteColumn·deleteKey·ErdRelationOps.delete 가 늘 검사한다).
        for (String colId : List.copyOf(t.columnOrder)) deleteColumn(c, colId);
        for (var e : List.copyOf(c.m.keys.entrySet())) if (id.equals(e.getValue().table)) deleteKey(c, e.getKey());
        for (var e : List.copyOf(c.m.relations.entrySet())) {
            ErdRelation r = e.getValue();
            if (id.equals(r.child) || id.equals(r.parent)) ErdRelationOps.delete(c, e.getKey());
        }
        c.touch("table", id);
        c.m.tables.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }

    // ---- 컬럼 ----

    void addColumn(Ctx c, AddColumn a) {
        ErdTable t = c.table(a.table());
        String id = c.newIdOrGiven(a.id(), 'c');
        String phys = a.phys();
        Long domainId = a.domainId();
        if (phys == null) {
            ErdColumnFill fill = ErdColumnFill.fromLogical(naming, c, a.logical(), id);  // 논리명 → 물리명·도메인(후보가 여럿이면 NEEDS_CHOICE)
            phys = fill.phys();
            if (domainId == null) domainId = fill.domainId();
        }
        requireOracleId(c, phys, "phys", id);
        String finalPhys = phys;
        if (t.columnOrder.stream().anyMatch(cid -> finalPhys.equals(c.m.columns.get(cid).phys))) {
            throw c.invalid("표 " + t.phys + " 에 같은 물리명의 컬럼이 있습니다: " + phys, "다른 물리명을 쓰세요", id, "phys");
        }
        c.touch("table", a.table());
        c.touch("column", id);
        ErdColumn col = new ErdColumn();
        col.table = a.table();
        col.phys = phys;
        col.logical = a.logical();
        col.domainId = domainId;
        col.dataType = a.dataType();
        col.length = a.length();
        col.scale = a.scale();
        col.notNull = Boolean.TRUE.equals(a.notNull());
        col.defaultValue = a.defaultValue();
        col.comment = a.comment() == null ? "" : a.comment();
        if (col.dataType == null && domainId != null) naming.domain(domainId).ifPresent(d -> copyDomain(col, d));
        c.m.columns.put(id, col);
        c.m.tombstones.remove(id);
        int pos = a.position() == null ? t.columnOrder.size() : Math.max(0, Math.min(a.position(), t.columnOrder.size()));
        t.columnOrder.add(pos, id);
        c.stamp(col.rev, COLUMN_PROPS);
        c.stamp(t.rev, Set.of("columnOrder"));
    }

    private void updateColumn(Ctx c, UpdateColumn u) {
        ErdColumn col = c.column(u.id());
        c.requireKnownKeys(u.set(), COLUMN_PROPS, u.id());
        c.checkConflict(col.rev, u.set().keySet(), u.id(), c.node(col));
        c.touch("column", u.id());
        for (var e : u.set().entrySet()) {
            String key = e.getKey();
            switch (key) {
                case "phys" -> {
                    String phys = c.strReq(u.set(), key, u.id());
                    requireOracleId(c, phys, "phys", u.id());
                    ErdTable t = c.m.tables.get(col.table);
                    boolean dup = t.columnOrder.stream()
                            .anyMatch(cid -> !cid.equals(u.id()) && phys.equals(c.m.columns.get(cid).phys));
                    if (dup) throw c.invalid("같은 물리명의 컬럼이 있습니다: " + phys, "다른 물리명을 쓰세요", u.id(), "phys");
                    col.phys = phys;
                }
                case "logical" -> col.logical = c.strOrNull(u.set(), key, u.id());
                case "domainId" -> col.domainId = c.longOrNull(u.set(), key, u.id());
                case "dataType" -> col.dataType = c.strOrNull(u.set(), key, u.id());
                case "length" -> col.length = c.intOrNull(u.set(), key, u.id());
                case "scale" -> col.scale = c.intOrNull(u.set(), key, u.id());
                case "notNull" -> col.notNull = c.bool(u.set(), key, u.id());
                case "default" -> col.defaultValue = c.strOrNull(u.set(), key, u.id());
                case "comment" -> col.comment = c.strOrNull(u.set(), key, u.id());
                default -> throw new IllegalStateException();
            }
        }
        c.stamp(col.rev, u.set().keySet());
    }

    private void moveColumn(Ctx c, MoveColumn mv) {
        ErdColumn col = c.column(mv.id());
        ErdTable t = c.m.tables.get(col.table);
        c.checkConflict(t.rev, Set.of("columnOrder"), col.table, c.node(t));
        c.touch("table", col.table);
        t.columnOrder.remove(mv.id());
        t.columnOrder.add(Math.max(0, Math.min(mv.position(), t.columnOrder.size())), mv.id());
        c.stamp(t.rev, Set.of("columnOrder"));
    }

    /**
     * 컬럼 삭제. 이 컬럼을 가진 키는 줄이고(비면 지우고), 이 컬럼이 짝에 든 관계는 지운다. deferred 31: 컬럼 자신, 줄이거나 지우는 키,
     * 지우는 관계의 모든 속성에 충돌 규칙을 쓴다. 표 columnOrder 는 보지 않는다 — 남이 같은 표에 컬럼을 더해도 다른 컬럼 삭제는 통과한다.
     */
    void deleteColumn(Ctx c, String id) {
        ErdColumn col = c.column(id);
        c.checkConflict(col.rev, col.rev.keySet(), id, c.node(col));
        for (var e : List.copyOf(c.m.keys.entrySet())) {
            ErdKey k = e.getValue();
            if (!k.columns.contains(id)) continue;
            c.checkConflict(k.rev, k.rev.keySet(), e.getKey(), c.node(k));
            c.touch("key", e.getKey());
            k.columns.remove(id);
            if (k.columns.isEmpty()) deleteKey(c, e.getKey());
            else c.stamp(k.rev, Set.of("columns"));
        }
        for (var e : List.copyOf(c.m.relations.entrySet())) {
            boolean uses = e.getValue().pairs.stream().anyMatch(p -> p.contains(id));
            if (uses) ErdRelationOps.delete(c, e.getKey());
        }
        ErdTable t = c.m.tables.get(col.table);
        c.touch("table", col.table);
        t.columnOrder.remove(id);
        c.stamp(t.rev, Set.of("columnOrder"));
        c.touch("column", id);
        c.m.columns.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }

    private void applyDomain(Ctx c, ApplyDomain ad) {
        ErdColumn col = c.column(ad.id());
        ErdDomainSpec d = naming.domain(ad.domainId()).orElseThrow(() ->
                c.invalid("없는 도메인입니다: " + ad.domainId(), "도메인 목록에서 고르세요", ad.id(), "domainId"));
        Set<String> props = Set.of("domainId", "dataType", "length", "scale");
        c.checkConflict(col.rev, props, ad.id(), c.node(col));
        c.touch("column", ad.id());
        col.domainId = d.domainId();
        copyDomain(col, d);
        c.stamp(col.rev, props);
    }

    /** 도메인 타입을 물리 타입으로 바꿔 넣는다(S2-3, deferred 42). STRING 을 그대로 넣으면 TYPE 판정·DB 차이·DDL 이 틀린다. */
    static void copyDomain(ErdColumn col, ErdDomainSpec d) {
        ErdTypeMapping.PhysType p = ErdTypeMapping.physicalOf(d);
        col.dataType = p.dataType();
        col.length = p.length();
        col.scale = p.scale();
    }

    // ---- 키 ----

    private void setPrimaryKey(Ctx c, SetPrimaryKey pk) {
        ErdTable t = c.table(pk.table());
        if (pk.columns() == null) throw c.invalid("columns 가 없습니다", "컬럼 id 목록을 넣으세요", pk.table(), "columns");
        for (String cid : pk.columns()) {
            ErdColumn col = c.column(cid);
            if (!pk.table().equals(col.table)) throw c.invalid("다른 표의 컬럼입니다: " + cid, "같은 표의 컬럼만 고르세요", cid, "columns");
        }
        String keyId = c.m.keys.entrySet().stream()
                .filter(e -> pk.table().equals(e.getValue().table) && "PK".equals(e.getValue().kind))
                .map(Map.Entry::getKey).findFirst().orElse(null);
        if (pk.columns().isEmpty()) {
            if (keyId != null) deleteKey(c, keyId);
            return;
        }
        if (keyId == null) {
            addKey(c, new AddKey(null, pk.table(), "PK", pk.name() == null ? "PK_" + t.phys : pk.name(), pk.columns()));
        } else {
            Map<String, Object> set = new LinkedHashMap<>();
            set.put("columns", pk.columns());
            if (pk.name() != null) set.put("name", pk.name());
            updateKey(c, new UpdateKey(keyId, set));
        }
        for (String cid : pk.columns()) {
            ErdColumn col = c.m.columns.get(cid);
            if (!col.notNull) {
                c.touch("column", cid);
                col.notNull = true;
                c.stamp(col.rev, Set.of("notNull"));
            }
        }
    }

    private void addKey(Ctx c, AddKey a) {
        c.table(a.table());
        if (a.kind() == null || !Set.of("PK", "UK", "IX").contains(a.kind())) {
            throw c.invalid("키 종류는 PK·UK·IX 입니다", "kind 를 고치세요", a.id(), "kind");
        }
        if (a.columns() == null) throw c.invalid("columns 가 없습니다", "컬럼 id 목록을 넣으세요", a.id(), "columns");
        String id = c.newIdOrGiven(a.id(), 'k');
        requireOracleId(c, a.name(), "name", id);
        if (c.m.keys.values().stream().anyMatch(k -> a.name().equals(k.name))) {
            throw c.invalid("같은 이름의 키가 있습니다: " + a.name(), "다른 이름을 쓰세요", id, "name");
        }
        if ("PK".equals(a.kind()) && c.m.keys.values().stream().anyMatch(k -> a.table().equals(k.table) && "PK".equals(k.kind))) {
            throw c.invalid("표에 이미 기본키가 있습니다", "setPrimaryKey 로 바꾸세요", id, "kind");
        }
        requireKeyColumns(c, a.table(), a.columns(), id);
        c.touch("key", id);
        ErdKey k = new ErdKey();
        k.table = a.table();
        k.kind = a.kind();
        k.name = a.name();
        k.columns = new ArrayList<>(a.columns());
        c.m.keys.put(id, k);
        c.m.tombstones.remove(id);
        c.stamp(k.rev, KEY_PROPS);
    }

    private void updateKey(Ctx c, UpdateKey u) {
        ErdKey k = c.key(u.id());
        c.requireKnownKeys(u.set(), KEY_PROPS, u.id());
        c.checkConflict(k.rev, u.set().keySet(), u.id(), c.node(k));
        c.touch("key", u.id());
        if (u.set().containsKey("name")) {
            String name = c.strReq(u.set(), "name", u.id());
            requireOracleId(c, name, "name", u.id());
            boolean dup = c.m.keys.entrySet().stream()
                    .anyMatch(x -> !x.getKey().equals(u.id()) && name.equals(x.getValue().name));
            if (dup) throw c.invalid("같은 이름의 키가 있습니다: " + name, "다른 이름을 쓰세요", u.id(), "name");
            k.name = name;
        }
        if (u.set().containsKey("columns")) {
            List<String> cols = c.strList(u.set(), "columns", u.id());
            requireKeyColumns(c, k.table, cols, u.id());
            k.columns = new ArrayList<>(cols);
        }
        c.stamp(k.rev, u.set().keySet());
    }

    /** 키 컬럼 목록 검사: 비어 있지 않고, 중복 없고, 모두 있는 컬럼이며, 키의 표 소속이다. */
    private static void requireKeyColumns(Ctx c, String table, List<String> columns, String keyId) {
        if (columns.isEmpty()) throw c.invalid("키 컬럼이 비었습니다", "컬럼 id 를 하나 이상 넣으세요", keyId, "columns");
        if (new HashSet<>(columns).size() != columns.size()) {
            throw c.invalid("키 컬럼이 중복됩니다", "같은 컬럼을 두 번 넣지 마세요", keyId, "columns");
        }
        for (String cid : columns) {
            ErdColumn col = c.column(cid);
            if (!Objects.equals(table, col.table)) {
                throw c.invalid("다른 표의 컬럼입니다: " + cid, "같은 표의 컬럼만 고르세요", keyId, "columns");
            }
        }
    }

    void deleteKey(Ctx c, String id) {
        ErdKey k = c.key(id);
        c.checkConflict(k.rev, k.rev.keySet(), id, c.node(k));
        c.touch("key", id);
        c.m.keys.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }

    // ---- 되돌리기 ----

    /**
     * 속성 단위 되돌리기. sinceRev 는 되돌릴 명령의 rev(R)다.
     * <ul>
     *   <li>delete: 있으면 R 뒤에 고쳐진 속성이 없을 때만 지운다.</li>
     *   <li>upsert(전체): 없으면 R 뒤의 tombstone 이 없을 때만 되살린다. 있으면 patch 처럼 속성별로 되돌린다.</li>
     *   <li>patch: 값이 다르고 R 뒤에 고쳐진(세션 무관) 속성이 있으면 CONFLICT, 아니면 그 속성만 되돌린다.</li>
     *   <li>바뀐 요소가 하나도 없으면 INVALID(S2-24) — 이미 되돌린 rev 를 다시 되돌릴 때다.</li>
     * </ul>
     * 참조 무결성은 묶음 뒤 {@link ErdIntegrity} 가 판정한다.
     */
    private void restore(Ctx c, Restore r) {
        if (r.elements() == null) throw c.invalid("elements 가 없습니다", "되돌릴 요소 목록을 넣으세요", null, "elements");
        for (ErdChange e : r.elements()) {
            if (e == null || e.id() == null || e.kind() == null || e.op() == null) {
                throw c.invalid("restore 요소에 kind·id·op 가 모두 있어야 합니다", "getChangesSince 가 준 값을 그대로 쓰세요", null, "elements");
            }
            if (!Set.of("table", "column", "key", "relation").contains(e.kind())) {
                throw c.invalid("되돌릴 수 없는 종류입니다: " + e.kind(), "table·column·key·relation 만 됩니다", e.id(), "kind");
            }
            if (!Set.of(ErdChange.UPSERT, ErdChange.DELETE, ErdChange.PATCH).contains(e.op())) {
                throw c.invalid("알 수 없는 op 입니다: " + e.op(), "upsert·delete·patch 만 됩니다", e.id(), "op");
            }
            if (!e.op().equals(ErdChange.DELETE) && !(e.value() instanceof ObjectNode)) {
                throw c.invalid("restore 값은 요소 JSON 객체여야 합니다: " + e.id(), "getChangesSince 가 준 값을 그대로 쓰세요", e.id(), "value");
            }
        }
        boolean changed = false;
        for (ErdChange e : r.elements()) {
            String kind = e.kind(), id = e.id();
            JsonNode now = c.snapshot(kind, id);
            switch (e.op()) {
                case ErdChange.DELETE -> {
                    if (now == null) continue;
                    for (var pr : c.revOf(kind, id).entrySet()) {
                        if (pr.getValue().rev() > r.sinceRev()) {
                            throw restoreConflict(c, id, pr.getKey(), pr.getValue(), now.get(pr.getKey()));
                        }
                    }
                    c.touch(kind, id);
                    c.put(kind, id, null);
                    changed = true;
                }
                case ErdChange.UPSERT -> {
                    if (now == null) {
                        PropRev tomb = c.m.tombstones.get(id);
                        if (tomb != null && tomb.rev() > r.sinceRev()) throw restoreConflict(c, id, null, tomb, null);
                        ObjectNode node = ((ObjectNode) e.value()).deepCopy();
                        node.remove(Ctx.REV);
                        List<String> all = new ArrayList<>();
                        node.fieldNames().forEachRemaining(all::add);
                        c.stampNode(node, all);
                        c.touch(kind, id);
                        c.put(kind, id, node);
                        changed = true;
                    } else {
                        Set<String> props = new LinkedHashSet<>();
                        e.value().fieldNames().forEachRemaining(props::add);
                        now.fieldNames().forEachRemaining(props::add);
                        props.remove(Ctx.REV);
                        changed |= patchExisting(c, r.sinceRev(), kind, id, now, e.value(), props);
                    }
                }
                default -> {  // PATCH
                    if (now == null) {
                        PropRev tomb = c.m.tombstones.get(id);
                        if (tomb != null) throw restoreConflict(c, id, null, tomb, null);
                        throw c.invalid("없는 요소 id 입니다: " + id, "getModelText 로 id 를 확인하세요", id, null);
                    }
                    Set<String> props = new LinkedHashSet<>();
                    e.value().fieldNames().forEachRemaining(props::add);
                    props.remove(Ctx.REV);
                    changed |= patchExisting(c, r.sinceRev(), kind, id, now, e.value(), props);
                }
            }
        }
        // S2-24: 이미 되돌렸거나 값이 같아 바뀐 것이 없으면 빈 rev·빈 기록을 만들지 않는다.
        if (!changed) throw c.invalid("되돌릴 변경이 없습니다. 이미 되돌렸거나 값이 같습니다", "변경 기록에서 다른 rev 를 고르세요", null, null);
    }

    /** @return 바꾼 속성이 있으면 true */
    private static boolean patchExisting(Ctx c, long since, String kind, String id, JsonNode now, JsonNode want,
                                      Set<String> props) {
        ObjectNode node = ((ObjectNode) now).deepCopy();
        Map<String, PropRev> revs = c.revOf(kind, id);
        List<String> changed = new ArrayList<>();
        for (String p : props) {
            JsonNode w = want.get(p) == null ? NullNode.getInstance() : want.get(p);
            JsonNode h = now.get(p) == null ? NullNode.getInstance() : now.get(p);
            if (Ctx.jsonEquals(w, h)) continue;
            PropRev pr = revs.get(p);
            if (pr != null && pr.rev() > since) throw restoreConflict(c, id, p, pr, h);
            node.set(p, w);
            changed.add(p);
        }
        if (changed.isEmpty()) return false;
        c.stampNode(node, changed);
        c.touch(kind, id);
        c.put(kind, id, node);
        return true;
    }

    private static Reject restoreConflict(Ctx c, String id, String prop, PropRev by, JsonNode current) {
        return c.conflict(id, prop, by, current, "되돌리려는 뒤에 다른 변경이 이 요소를 고쳤습니다",
                "getChangesSince 로 확인한 뒤 직접 고치세요");
    }

    // ---- 공통 ----

    static void requireOracleId(Ctx c, String s, String prop, String elementId) {
        if (!ErdIds.isOracleIdentifier(s)) {
            throw c.invalid("Oracle 식별자 규칙에 맞지 않습니다: " + s,
                    "영문 대문자로 시작하고 대문자·숫자·_ 만 128자 이내로 쓰세요", elementId, prop);
        }
    }
}
