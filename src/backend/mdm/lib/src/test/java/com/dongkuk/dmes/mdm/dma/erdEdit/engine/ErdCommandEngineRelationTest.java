package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 관계 명령(추가·수정·확정/거절·삭제), 식별 관계 PK 복사, 이름 충돌, 표 삭제 연쇄와 되돌리기, 관계 무결성. */
class ErdCommandEngineRelationTest {

    final ErdCommandEngine engine = new ErdCommandEngine(ErdNaming.NONE);

    /** ROLE(PK ROLE_ID) · MAPPING(OBJECT_ID, childHasRoleId 면 ROLE_ID 도 있다) */
    ErdModel base(boolean childHasRoleId) {
        var cmds = new java.util.ArrayList<ErdCommand>(List.of(
                new AddTable("t-r", "TB_MCM_SEC_ROLE", "역할", ""),
                new AddColumn("c-r1", "t-r", "ROLE_ID", "역할아이디", null, "VARCHAR2", 30, null, true, null, "", null),
                new SetPrimaryKey("t-r", List.of("c-r1"), null),
                new AddTable("t-m", "TB_MCM_SEC_ROLE_MAPPING", "역할권한매핑", ""),
                new AddColumn("c-m1", "t-m", "OBJECT_ID", "객체아이디", null, "VARCHAR2", 50, null, true, null, "", null),
                new SetPrimaryKey("t-m", List.of("c-m1"), null)));
        if (childHasRoleId) {
            cmds.add(new AddColumn("c-m2", "t-m", "ROLE_ID", "역할아이디", null, "VARCHAR2", 30, null, false, null, "", null));
        }
        return ((ApplyOutcome.Applied) engine.apply(ErdModel.empty("mcm", "S"), 0, 1, "s-a", cmds)).next();
    }

    ErdRejection rej(ApplyOutcome out) {
        assertThat(out).isInstanceOf(ApplyOutcome.Rejected.class);
        return ((ApplyOutcome.Rejected) out).rejection();
    }

    @Test
    void identifyingRelationCopiesParentPkIntoChildPk() {
        var out = (ApplyOutcome.Applied) engine.apply(base(false), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, true, null, null, null)));
        ErdModel m = out.next();
        var rel = m.relations.get("r-1");
        String childCol = rel.pairs.get(0).get(0);
        assertThat(m.columns.get(childCol).phys).isEqualTo("ROLE_ID");
        assertThat(rel.pairs.get(0).get(1)).isEqualTo("c-r1");
        assertThat(m.keys.values()).filteredOn(k -> "t-m".equals(k.table) && "PK".equals(k.kind))
                .singleElement().satisfies(k -> assertThat(k.columns).containsExactly("c-m1", childCol));
        assertThat(rel.state).isEqualTo("CONFIRMED");
        assertThat(rel.dbFk).isTrue();
        assertThat(out.changes()).extracting(ErdChange::kind).contains("column", "relation", "key", "table");
    }

    @Test
    void nameClashAsksByDefault() {
        var out = engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, null, null)));
        var rej = ((ApplyOutcome.Rejected) out).rejection();
        assertThat(rej.code()).isEqualTo("NEEDS_CHOICE");
        assertThat(rej.choices().toString()).contains("c-m2");
    }

    @Test
    void nameClashReuseUsesExistingColumn() {
        var out = (ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "REUSE", null)));
        assertThat(out.next().relations.get("r-1").pairs).containsExactly(List.of("c-m2", "c-r1"));
    }

    @Test
    void crossModelRelationCannotBeDbFk() {
        var out = engine.apply(base(true), 1, 2, "s-a", List.of(new AddRelation("r-1", "t-m", null,
                new ErdParentRefArg("mdm", "t-x", List.of("c-x")), false, List.of(List.of("c-m2", "c-x")), null, true)));
        assertThat(((ApplyOutcome.Rejected) out).rejection().code()).isEqualTo("INVALID");
    }

    @Test
    void crossModelRelationKeepsParentRefAndDbFkFalse() {
        var out = (ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a", List.of(new AddRelation("r-1", "t-m", null,
                new ErdParentRefArg("mdm", "t-x", List.of("c-x")), false, List.of(List.of("c-m2", "c-x")), null, null)));
        var rel = out.next().relations.get("r-1");
        assertThat(rel.dbFk).isFalse();
        assertThat(rel.parent).isNull();
        assertThat(rel.parentRef.model()).isEqualTo("mdm");
        assertThat(rel.pairs).containsExactly(List.of("c-m2", "c-x"));
    }

    @Test
    void confirmAndRejectChangeStateOnly() {
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "REUSE", null)))).next();
        m.relations.get("r-1").state = "INFERRED";
        ErdModel rejected = ((ApplyOutcome.Applied) engine.apply(m, 2, 3, "s-a", List.of(new RejectRelation("r-1")))).next();
        assertThat(rejected.relations.get("r-1").state).isEqualTo("REJECTED");
        assertThat(rejected.relations).containsKey("r-1");
        ErdModel confirmed = ((ApplyOutcome.Applied) engine.apply(rejected, 3, 4, "s-a", List.of(new ConfirmRelation("r-1")))).next();
        assertThat(confirmed.relations.get("r-1").state).isEqualTo("CONFIRMED");
    }

    @Test
    void deleteParentTableRemovesRelationsAndUndoRestoresAll() {
        var withRel = (ApplyOutcome.Applied) engine.apply(base(false), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, true, null, null, null)));
        var del = (ApplyOutcome.Applied) engine.apply(withRel.next(), 2, 3, "s-a", List.of(new DeleteTable("t-r")));
        assertThat(del.next().relations).isEmpty();
        assertThat(del.next().tables).doesNotContainKey("t-r");
        ErdModel back = ((ApplyOutcome.Applied) engine.apply(del.next(), 3, 4, "s-a", del.inverse())).next();
        assertThat(back.tables).containsKey("t-r");
        assertThat(back.relations).containsKey("r-1");
        assertThat(back.keys.values()).filteredOn(k -> "t-r".equals(k.table)).hasSize(1);
    }

    @Test
    void updateRelationCardinality() {
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "REUSE", null)))).next();
        var out = (ApplyOutcome.Applied) engine.apply(m, 2, 3, "s-a", List.of(new UpdateRelation("r-1",
                Map.of("cardinality", Map.of("parent", "ZERO_OR_ONE", "child", "ONE_OR_MORE")))));
        assertThat(out.next().relations.get("r-1").cardinality.child).isEqualTo("ONE_OR_MORE");
        assertThat(out.next().relations.get("r-1").cardinality.parent).isEqualTo("ZERO_OR_ONE");
    }

    @Test
    void updateRelationRejectsWrongTypesAndValues() {
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "REUSE", null)))).next();
        for (Map<String, Object> set : List.<Map<String, Object>>of(
                Map.of("identifying", "yes"),
                Map.of("dbFk", 1),
                Map.of("cardinality", "ONE"),
                Map.of("cardinality", Map.of("child", 3)),
                Map.of("cardinality", Map.of("child", "MANY")),
                Map.of("cardinality", Map.of("other", "ONE")),
                Map.of("state", "REJECTED"))) {
            assertThat(rej(engine.apply(m, 2, 3, "s-a", List.of(new UpdateRelation("r-1", set)))).code())
                    .as(set.toString()).isEqualTo("INVALID");
        }
    }

    @Test
    void updateRelationUndoIsPropertyLevelAndConflictChecked() {
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "REUSE", null)))).next();
        var upd = (ApplyOutcome.Applied) engine.apply(m, 2, 3, "s-a", List.of(new UpdateRelation("r-1",
                Map.of("identifying", true))));
        assertThat(upd.changes()).hasSize(1);
        assertThat(upd.inverse()).hasSize(1);
        Restore back = (Restore) upd.inverse().get(0);
        assertThat(back.elements()).singleElement().satisfies(e -> {
            assertThat(e.op()).isEqualTo(ErdChange.PATCH);
            assertThat(e.value().fieldNames()).toIterable().containsExactly("identifying");
        });
        // 다른 세션이 base 이후 고친 속성은 CONFLICT
        assertThat(rej(engine.apply(upd.next(), 2, 4, "s-b", List.of(new UpdateRelation("r-1",
                Map.of("identifying", false))))).code()).isEqualTo("CONFLICT");
        // 되돌리면 원래 값
        ErdModel undone = ((ApplyOutcome.Applied) engine.apply(upd.next(), 3, 4, "s-a", upd.inverse())).next();
        assertThat(undone.relations.get("r-1").identifying).isFalse();
    }

    @Test
    void deleteRelationAndUndo() {
        var add = (ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "REUSE", null)));
        var del = (ApplyOutcome.Applied) engine.apply(add.next(), 2, 3, "s-a", List.of(new DeleteRelation("r-1")));
        assertThat(del.next().relations).isEmpty();
        assertThat(rej(engine.apply(del.next(), 3, 4, "s-a", List.of(new DeleteRelation("r-1")))).code()).isEqualTo("NOT_FOUND");
        ErdModel back = ((ApplyOutcome.Applied) engine.apply(del.next(), 3, 4, "s-a", del.inverse())).next();
        assertThat(back.relations.get("r-1").pairs).containsExactly(List.of("c-m2", "c-r1"));
    }

    @Test
    void renameClashMakesPrefixedColumn() {
        var out = (ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "RENAME", null)));
        ErdModel m = out.next();
        String childCol = m.relations.get("r-1").pairs.get(0).get(0);
        assertThat(childCol).isNotEqualTo("c-m2");
        assertThat(m.columns.get(childCol).phys).isEqualTo("MCM_SEC_ROLE_ROLE_ID");
    }

    @Test
    void undoOfIdentifyingAddRelationRemovesCopiedPkColumns() {
        var out = (ApplyOutcome.Applied) engine.apply(base(false), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, true, null, null, null)));
        ErdModel m = ((ApplyOutcome.Applied) engine.apply(out.next(), 2, 3, "s-a", out.inverse())).next();
        assertThat(m.relations).isEmpty();
        assertThat(m.columns.keySet()).containsExactlyInAnyOrder("c-r1", "c-m1");
        assertThat(m.tables.get("t-m").columnOrder).containsExactly("c-m1");
        assertThat(m.keys.values()).filteredOn(k -> "t-m".equals(k.table) && "PK".equals(k.kind))
                .singleElement().satisfies(k -> assertThat(k.columns).containsExactly("c-m1"));
    }

    @Test
    void danglingRelationAfterRestoreIsRejectedByIntegrity() {
        var withRel = (ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "REUSE", null)));
        var del = (ApplyOutcome.Applied) engine.apply(withRel.next(), 2, 3, "s-a", List.of(new DeleteTable("t-r")));
        // 관계만 되살리고 부모 표는 그대로 지워 둔 restore
        ObjectNode relJson = ErdModelCodec.MAPPER.valueToTree(withRel.next().relations.get("r-1"));
        var out = engine.apply(del.next(), 3, 4, "s-a", List.of(new Restore(3,
                List.of(new ErdChange("relation", "r-1", ErdChange.UPSERT, relJson)))));
        assertThat(rej(out).code()).isEqualTo("CONFLICT");
    }

    @Test
    void relationPairColumnInWrongTableIsRejected() {
        var withRel = (ApplyOutcome.Applied) engine.apply(base(true), 1, 2, "s-a",
                List.of(new AddRelation("r-1", "t-m", "t-r", null, false, null, "REUSE", null)));
        ObjectNode relJson = ErdModelCodec.MAPPER.valueToTree(withRel.next().relations.get("r-1"));
        // 자식 컬럼 자리에 부모 표 컬럼을 넣은 patch 는 무결성 검사에 걸린다
        relJson.putArray("pairs").addArray().add("c-r1").add("c-r1");
        var out = engine.apply(withRel.next(), 2, 3, "s-a", List.of(new Restore(2,
                List.of(new ErdChange("relation", "r-1", ErdChange.PATCH, relJson)))));
        assertThat(rej(out).code()).isEqualTo("CONFLICT");
    }

    @Test
    void nullColumnOrderFromRestoreIsRejectedNotThrown() {
        ErdModel m = base(false);
        ObjectNode t = ErdModelCodec.MAPPER.valueToTree(m.tables.get("t-r"));
        t.putNull("columnOrder");
        var out = engine.apply(m, 1, 2, "s-a", List.of(new Restore(1,
                List.of(new ErdChange("table", "t-x", ErdChange.UPSERT, t)))));
        assertThat(rej(out).code()).isEqualTo("CONFLICT");
    }
}
