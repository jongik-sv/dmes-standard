package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.*;

/** 관계 명령(스펙 4.1·D7·D8). */
final class ErdRelationOps {

    private static final Set<String> PARENT_CARD = Set.of("ONE", "ZERO_OR_ONE");
    private static final Set<String> CHILD_CARD = Set.of("ZERO_OR_MORE", "ONE_OR_MORE", "ZERO_OR_ONE", "ONE");
    private static final Set<String> CLASH_MODES = Set.of("ASK", "REUSE", "RENAME");

    private ErdRelationOps() {
    }

    static void add(ErdCommandEngine e, Ctx c, AddRelation a) {
        String id = c.newIdOrGiven(a.id(), 'r');
        ErdTable child = c.table(a.child());
        boolean cross = a.parentRef() != null;
        boolean dbFk = a.dbFk() == null ? !cross : a.dbFk();
        if (cross && dbFk) {
            throw c.invalid("다른 모델 표와의 관계는 DB FK 로 만들 수 없습니다(ADR 0003)", "dbFk 를 false 로 두세요", id, "dbFk");
        }
        String mode = a.onNameClash() == null ? "ASK" : a.onNameClash();
        if (!CLASH_MODES.contains(mode)) {
            throw c.invalid("onNameClash 값이 틀렸습니다: " + mode, "ASK·REUSE·RENAME 중에서 고르세요", id, "onNameClash");
        }
        List<List<String>> pairs = new ArrayList<>();
        if (cross) {
            ErdCommand.ErdParentRefArg ref = a.parentRef();
            if (isBlank(ref.model()) || isBlank(ref.table())) {
                throw c.invalid("parentRef 에 model·table 이 필요합니다", "다른 모델 id 와 표 id 를 넣으세요", id, "parentRef");
            }
            if (a.pairs() == null || a.pairs().isEmpty()) {
                throw c.invalid("다른 모델 관계는 pairs 가 필요합니다", "[[자식 컬럼 id, 부모 컬럼 id]] 를 넣으세요", id, "pairs");
            }
            for (List<String> p : a.pairs()) {
                requirePair(c, p, id);
                requireColumnOf(c, p.get(0), a.child(), id);
                pairs.add(List.of(p.get(0), p.get(1)));
            }
        } else if (a.pairs() != null && !a.pairs().isEmpty()) {
            c.table(a.parent());
            for (List<String> p : a.pairs()) {
                requirePair(c, p, id);
                requireColumnOf(c, p.get(0), a.child(), id);
                requireColumnOf(c, p.get(1), a.parent(), id);
                pairs.add(List.of(p.get(0), p.get(1)));
            }
        } else {
            if (a.parent() == null) throw c.invalid("parent 가 필요합니다", "부모 표 id 를 넣으세요", id, "parent");
            ErdTable parent = c.table(a.parent());
            List<String> parentPk = c.m.keys.values().stream()
                    .filter(k -> a.parent().equals(k.table) && "PK".equals(k.kind))
                    .findFirst().map(k -> k.columns).orElse(List.of());
            if (parentPk.isEmpty()) {
                throw c.invalid("부모 표에 PK 가 없습니다: " + parent.phys, "부모 표의 PK 를 먼저 정하세요", a.parent(), null);
            }
            ArrayNode clashes = ErdModelCodec.MAPPER.createArrayNode();
            Map<String, String> sameName = new LinkedHashMap<>();
            for (String pcid : parentPk) {
                ErdColumn pc = c.column(pcid);
                child.columnOrder.stream().filter(cid -> pc.phys.equals(c.m.columns.get(cid).phys)).findFirst()
                        .ifPresent(cid -> {
                            sameName.put(pcid, cid);
                            clashes.addObject().put("parentColumn", pcid).put("childColumn", cid).put("phys", pc.phys);
                        });
            }
            if (!sameName.isEmpty() && mode.equals("ASK")) {
                throw c.needsChoice(id, "onNameClash", "자식 표에 같은 이름의 컬럼이 있습니다",
                        "onNameClash 를 REUSE(그 컬럼을 쓴다) 또는 RENAME(접두를 붙여 새로 만든다)으로 다시 보내세요", clashes);
            }
            for (String pcid : parentPk) {
                ErdColumn pc = c.column(pcid);
                String childCol = sameName.get(pcid);
                if (childCol == null || mode.equals("RENAME")) {
                    String phys = childCol == null ? pc.phys : prefix(parent.phys) + "_" + pc.phys;
                    String newId = ErdIds.newId('c');
                    e.addColumn(c, new AddColumn(newId, a.child(), phys, pc.logical, pc.domainId, pc.dataType,
                            pc.length, pc.scale, a.identifying(), null, "", null));
                    childCol = newId;
                }
                pairs.add(List.of(childCol, pcid));
            }
        }
        if (a.identifying()) {
            List<String> pk = new ArrayList<>(c.m.keys.values().stream()
                    .filter(k -> a.child().equals(k.table) && "PK".equals(k.kind))
                    .findFirst().map(k -> k.columns).orElse(List.of()));
            boolean changed = false;
            for (List<String> p : pairs) {
                if (!pk.contains(p.get(0))) {
                    pk.add(p.get(0));
                    changed = true;
                }
            }
            if (changed) e.dispatchPublic(c, new SetPrimaryKey(a.child(), pk, null));
        }
        c.touch("relation", id);
        ErdRelation r = new ErdRelation();
        r.child = a.child();
        r.parent = cross ? null : a.parent();
        r.parentRef = cross
                ? new ErdParentRef(a.parentRef().model(), a.parentRef().table(),
                        a.parentRef().columns() == null ? List.of() : List.copyOf(a.parentRef().columns()))
                : null;
        r.pairs = pairs;
        r.identifying = a.identifying();
        r.dbFk = dbFk;
        r.state = "CONFIRMED";
        c.m.relations.put(id, r);
        c.m.tombstones.remove(id);
        c.stamp(r.rev, Set.of("identifying", "cardinality", "dbFk", "state"));
    }

    static void update(Ctx c, UpdateRelation u) {
        ErdRelation r = c.relation(u.id());
        c.requireKnownKeys(u.set(), ErdCommandEngine.RELATION_PROPS, u.id());
        c.checkConflict(r.rev, u.set().keySet(), u.id(), c.node(r));
        c.touch("relation", u.id());
        for (String key : u.set().keySet()) {
            switch (key) {
                case "identifying" -> r.identifying = c.bool(u.set(), key, u.id());
                case "dbFk" -> {
                    boolean v = c.bool(u.set(), key, u.id());
                    if (v && r.parentRef != null) {
                        throw c.invalid("다른 모델 표와의 관계는 DB FK 로 만들 수 없습니다", "dbFk 를 false 로 두세요", u.id(), "dbFk");
                    }
                    r.dbFk = v;
                }
                case "cardinality" -> {
                    Map<String, String> card = cardinalityArg(c, u.set().get(key), u.id());
                    String p = card.getOrDefault("parent", r.cardinality.parent);
                    String ch = card.getOrDefault("child", r.cardinality.child);
                    if (!PARENT_CARD.contains(p) || !CHILD_CARD.contains(ch)) {
                        throw c.invalid("카디널리티 값이 틀렸습니다", "parent: " + PARENT_CARD + ", child: " + CHILD_CARD, u.id(), "cardinality");
                    }
                    r.cardinality.parent = p;
                    r.cardinality.child = ch;
                }
                default -> throw new IllegalStateException();
            }
        }
        c.stamp(r.rev, u.set().keySet());
    }

    static void setState(Ctx c, String id, String state) {
        ErdRelation r = c.relation(id);
        c.checkConflict(r.rev, Set.of("state"), id, c.node(r));
        c.touch("relation", id);
        r.state = state;
        c.stamp(r.rev, Set.of("state"));
    }

    /** deferred 31: 직접 지울 때도, 표·컬럼 삭제에 딸려 지울 때도 충돌을 본다. */
    static void delete(Ctx c, String id) {
        ErdRelation r = c.relation(id);
        c.checkConflict(r.rev, r.rev.keySet(), id, c.node(r));
        c.touch("relation", id);
        c.m.relations.remove(id);
        c.m.tombstones.put(id, new PropRev(c.newRev, c.session));
    }

    /** TB_MCM_SEC_ROLE → MCM_SEC_ROLE (RENAME 접두). */
    static String prefix(String tablePhys) {
        return tablePhys.startsWith("TB_") ? tablePhys.substring(3) : tablePhys;
    }

    // ---- 입력 검사 ----

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static void requirePair(Ctx c, List<String> p, String relId) {
        if (p == null || p.size() != 2 || p.get(0) == null || p.get(1) == null) {
            throw c.invalid("pairs 의 각 항목은 [자식 컬럼 id, 부모 컬럼 id] 두 개여야 합니다", "pairs 를 고치세요", relId, "pairs");
        }
    }

    /** 컬럼이 있고 기대한 표의 것인지 확인한다. */
    private static void requireColumnOf(Ctx c, String columnId, String tableId, String relId) {
        ErdColumn col = c.column(columnId);
        if (!Objects.equals(tableId, col.table)) {
            throw c.invalid("짝의 컬럼이 다른 표 소속입니다: " + columnId, "자식 컬럼은 자식 표, 부모 컬럼은 부모 표의 것을 고르세요", relId, "pairs");
        }
    }

    private static Map<String, String> cardinalityArg(Ctx c, Object v, String relId) {
        if (!(v instanceof Map<?, ?> raw)) {
            throw c.invalid("cardinality 는 {parent, child} 객체여야 합니다", "{\"parent\":\"ONE\",\"child\":\"ZERO_OR_MORE\"} 모양으로 보내세요", relId, "cardinality");
        }
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> en : raw.entrySet()) {
            if (!(en.getKey() instanceof String k) || !(k.equals("parent") || k.equals("child"))) {
                throw c.invalid("cardinality 에는 parent·child 만 쓸 수 있습니다: " + en.getKey(), "parent·child 만 넣으세요", relId, "cardinality");
            }
            if (!(en.getValue() instanceof String s)) {
                throw c.invalid("cardinality." + k + " 는 문자열이어야 합니다", "ONE·ZERO_OR_ONE 같은 값을 문자열로 보내세요", relId, "cardinality");
            }
            out.put(k, s);
        }
        return out;
    }
}
