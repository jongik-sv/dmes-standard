package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.*;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 묶음이 끝난 결과 모델의 참조 무결성(스펙 4.2: 끊어진 참조 없음). 표·컬럼·키·관계 규칙을 한 곳에 모았다.
 *
 * <p>되돌리기(Restore)가 든 묶음이 걸리면 CONFLICT — 그 사이 다른 변경과 얽혀 되돌릴 수 없다는 뜻이다.
 * 그 밖의 묶음은 명령이 잘못된 것이므로 INVALID. restore 값 때문에 목록이 null 이거나 모양이 틀려 예외가 나도
 * 같은 규칙으로 거절한다(밖으로 예외를 내보내지 않는다).
 */
final class ErdIntegrity {
    private ErdIntegrity() {}

    static void check(Ctx c, boolean hasRestore) {
        try {
            checkAll(c, hasRestore);
        } catch (Reject r) {
            throw r;
        } catch (RuntimeException e) {
            throw fail(c, hasRestore, "모델 모양이 맞지 않습니다(" + e.getClass().getSimpleName() + ")", null);
        }
    }

    private static void checkAll(Ctx c, boolean hasRestore) {
        ErdModel m = c.m;
        for (Map.Entry<String, ErdTable> t : m.tables.entrySet()) {
            if (t.getValue() == null || t.getValue().columnOrder == null) {
                throw fail(c, hasRestore, "표 " + t.getKey() + " 의 컬럼 순서가 없습니다", t.getKey());
            }
            Set<String> seen = new HashSet<>();
            for (String cid : t.getValue().columnOrder) {
                ErdColumn col = cid == null ? null : m.columns.get(cid);
                if (col == null || !t.getKey().equals(col.table) || !seen.add(cid)) {
                    throw fail(c, hasRestore, "표 " + t.getKey() + " 의 컬럼 순서가 컬럼과 맞지 않습니다: " + cid, t.getKey());
                }
            }
        }
        for (Map.Entry<String, ErdColumn> e : m.columns.entrySet()) {
            ErdTable t = e.getValue() == null ? null : m.tables.get(e.getValue().table);
            if (t == null || !t.columnOrder.contains(e.getKey())) {
                throw fail(c, hasRestore, "컬럼 " + e.getKey() + " 의 표가 없거나 표의 컬럼 순서에 없습니다", e.getKey());
            }
        }
        for (Map.Entry<String, ErdKey> e : m.keys.entrySet()) {
            ErdKey k = e.getValue();
            if (k == null || !m.tables.containsKey(k.table) || k.columns == null || k.columns.isEmpty()) {
                throw fail(c, hasRestore, "키 " + e.getKey() + " 의 표가 없거나 컬럼이 비었습니다", e.getKey());
            }
            for (String cid : k.columns) {
                ErdColumn col = cid == null ? null : m.columns.get(cid);
                if (col == null || !k.table.equals(col.table)) {
                    throw fail(c, hasRestore, "키 " + e.getKey() + " 가 없거나 다른 표의 컬럼을 가리킵니다: " + cid, e.getKey());
                }
            }
        }
        for (Map.Entry<String, ErdRelation> e : m.relations.entrySet()) {
            checkRelation(c, hasRestore, e.getKey(), e.getValue());
        }
    }

    /**
     * 관계: 자식 표가 있고, 부모 표도 있다(다른 모델 관계는 parentRef 가 대신하므로 자식 쪽만 본다).
     * 짝마다 자식 컬럼은 자식 표의 것이고, 같은 모델 관계면 부모 컬럼도 부모 표의 것이다.
     */
    private static void checkRelation(Ctx c, boolean hasRestore, String id, ErdRelation r) {
        ErdModel m = c.m;
        if (r == null || !m.tables.containsKey(r.child)) {
            throw fail(c, hasRestore, "관계 " + id + " 의 자식 표가 없습니다", id);
        }
        boolean cross = r.parentRef != null;
        if (!cross && !m.tables.containsKey(r.parent)) {
            throw fail(c, hasRestore, "관계 " + id + " 의 부모 표가 없습니다", id);
        }
        if (r.pairs == null) {
            throw fail(c, hasRestore, "관계 " + id + " 의 컬럼 짝 목록이 없습니다", id);
        }
        for (List<String> p : r.pairs) {
            if (p == null || p.size() != 2) {
                throw fail(c, hasRestore, "관계 " + id + " 의 컬럼 짝은 [자식, 부모] 두 개여야 합니다", id);
            }
            ErdColumn cc = p.get(0) == null ? null : m.columns.get(p.get(0));
            if (cc == null || !r.child.equals(cc.table)) {
                throw fail(c, hasRestore, "관계 " + id + " 의 자식 컬럼이 없거나 자식 표의 것이 아닙니다: " + p.get(0), id);
            }
            if (!cross) {
                ErdColumn pc = p.get(1) == null ? null : m.columns.get(p.get(1));
                if (pc == null || !r.parent.equals(pc.table)) {
                    throw fail(c, hasRestore, "관계 " + id + " 의 부모 컬럼이 없거나 부모 표의 것이 아닙니다: " + p.get(1), id);
                }
            }
        }
    }

    private static Reject fail(Ctx c, boolean hasRestore, String detail, String elementId) {
        if (hasRestore) {
            return new Reject(new ErdRejection(ErdRejection.CONFLICT, c.index, "다른 변경과 얽혀 되돌릴 수 없습니다: " + detail,
                    "getChangesSince 로 확인한 뒤 직접 고치세요", elementId, null, null, null, null, null));
        }
        return new Reject(new ErdRejection(ErdRejection.INVALID, c.index, "참조가 끊어집니다: " + detail,
                "참조하는 요소를 먼저 고치거나 지우세요", elementId, null, null, null, null, null));
    }
}
