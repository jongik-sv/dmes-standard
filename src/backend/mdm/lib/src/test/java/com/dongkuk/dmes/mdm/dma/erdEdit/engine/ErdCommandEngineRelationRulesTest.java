package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** deferred 29(식별 여부를 바꾸면 자식 PK 가 따라간다), deferred 30(같은 관계 중복 막기, parentRef.columns 일치). */
class ErdCommandEngineRelationRulesTest {

    final ErdCommandEngine engine = new ErdCommandEngine(ErdNaming.NONE);

    ApplyOutcome.Applied ok(ErdModel m, long base, long rev, String session, ErdCommand... cmds) {
        var out = engine.apply(m, base, rev, session, List.of(cmds));
        assertThat(out).as("rejected: %s", out instanceof ApplyOutcome.Rejected r ? r.rejection() : null)
                .isInstanceOf(ApplyOutcome.Applied.class);
        return (ApplyOutcome.Applied) out;
    }

    ErdRejection rej(ApplyOutcome out) {
        assertThat(out).isInstanceOf(ApplyOutcome.Rejected.class);
        return ((ApplyOutcome.Rejected) out).rejection();
    }

    /**
     * rev 1(s-a): TB_ROLE(ROLE_ID PK) · TB_ROLE_MAP(OBJECT_ID, ROLE_ID) · r-1 = 비식별 TB_ROLE_MAP.ROLE_ID > TB_ROLE.ROLE_ID.
     * withChildPk 면 TB_ROLE_MAP 의 PK 는 (OBJECT_ID), 아니면 PK 가 없다.
     */
    ErdModel base(boolean withChildPk) {
        List<ErdCommand> cmds = new ArrayList<>(List.of(
                new AddTable("t-r", "TB_ROLE", "역할", "", false),
                new AddColumn("c-r1", "t-r", "ROLE_ID", "역할아이디", null, "VARCHAR2", 30, null, true, null, "", null),
                new SetPrimaryKey("t-r", List.of("c-r1"), null),
                new AddTable("t-m", "TB_ROLE_MAP", "역할매핑", "", false),
                new AddColumn("c-m1", "t-m", "OBJECT_ID", "객체아이디", null, "VARCHAR2", 50, null, true, null, "", null),
                new AddColumn("c-m2", "t-m", "ROLE_ID", "역할아이디", null, "VARCHAR2", 30, null, false, null, "", null)));
        if (withChildPk) cmds.add(new SetPrimaryKey("t-m", List.of("c-m1"), null));
        cmds.add(new AddRelation("r-1", "t-m", "t-r", null, false, List.of(List.of("c-m2", "c-r1")), null, null));
        return ok(ErdModel.empty("mcm", "S"), 0, 1, "s-a", cmds.toArray(new ErdCommand[0])).next();
    }

    /** 표의 PK 컬럼 목록. PK 가 없으면 null. */
    static List<String> pk(ErdModel m, String table) {
        return m.keys.values().stream().filter(k -> table.equals(k.table) && "PK".equals(k.kind)).findFirst()
                .map(k -> k.columns).orElse(null);
    }

    // ---- deferred 29 ----

    @Test
    void identifyingOnAddsPairColumnsToChildPkAndUndoRemovesThem() {
        var on = ok(base(true), 1, 2, "s-a", new UpdateRelation("r-1", Map.of("identifying", true)));
        assertThat(pk(on.next(), "t-m")).containsExactly("c-m1", "c-m2");
        assertThat(on.next().columns.get("c-m2").notNull).isTrue();
        assertThat(on.changes()).extracting(ErdChange::kind).containsExactlyInAnyOrder("relation", "key", "column");
        ErdModel back = ok(on.next(), 2, 3, "s-a", on.inverse().toArray(new ErdCommand[0])).next();
        assertThat(pk(back, "t-m")).containsExactly("c-m1");
        assertThat(back.relations.get("r-1").identifying).isFalse();
        assertThat(back.columns.get("c-m2").notNull).isFalse();
    }

    @Test
    void identifyingOnCreatesChildPkWhenMissing() {
        var on = ok(base(false), 1, 2, "s-a", new UpdateRelation("r-1", Map.of("identifying", true)));
        assertThat(on.next().keys.values()).filteredOn(k -> "t-m".equals(k.table)).singleElement().satisfies(k -> {
            assertThat(k.kind).isEqualTo("PK");
            assertThat(k.name).isEqualTo("PK_TB_ROLE_MAP");
            assertThat(k.columns).containsExactly("c-m2");
        });
    }

    @Test
    void identifyingOffRemovesPairColumnsAndDropsEmptyPk() {
        ErdModel on = ok(base(false), 1, 2, "s-a", new UpdateRelation("r-1", Map.of("identifying", true))).next();
        // 켠 상태: 짝 컬럼이 자식 PK 에 들어 있어야 끌 때 빠지는 것을 본 셈이다.
        assertThat(pk(on, "t-m")).containsExactly("c-m2");
        ErdModel off = ok(on, 2, 3, "s-a", new UpdateRelation("r-1", Map.of("identifying", false))).next();
        assertThat(pk(off, "t-m")).isNull();
        ErdModel on2 = ok(base(true), 1, 2, "s-a", new UpdateRelation("r-1", Map.of("identifying", true))).next();
        assertThat(pk(on2, "t-m")).containsExactly("c-m1", "c-m2");
        ErdModel off2 = ok(on2, 2, 3, "s-a", new UpdateRelation("r-1", Map.of("identifying", false))).next();
        assertThat(pk(off2, "t-m")).containsExactly("c-m1");
    }

    /** 끄면서 비어 버린 PK 를 지운 일도 되돌리면 PK 키가 돌아온다. */
    @Test
    void undoOfIdentifyingOffRestoresDeletedPk() {
        ErdModel on = ok(base(false), 1, 2, "s-a", new UpdateRelation("r-1", Map.of("identifying", true))).next();
        var off = ok(on, 2, 3, "s-a", new UpdateRelation("r-1", Map.of("identifying", false)));
        assertThat(pk(off.next(), "t-m")).isNull();
        ErdModel back = ok(off.next(), 3, 4, "s-a", off.inverse().toArray(new ErdCommand[0])).next();
        assertThat(pk(back, "t-m")).containsExactly("c-m2");
        assertThat(back.relations.get("r-1").identifying).isTrue();
    }

    /** 같은 자식 컬럼을 다른 식별 관계도 쓰면 PK 에 남긴다. */
    @Test
    void identifyingOffKeepsColumnNeededByAnotherIdentifyingRelation() {
        ErdModel m = ok(base(true), 1, 2, "s-a",
                new AddTable("t-b", "TB_ROLE_B", "역할비", "", false),
                new AddColumn("c-b1", "t-b", "ROLE_ID", "역할아이디", null, "VARCHAR2", 30, null, true, null, "", null),
                new UpdateRelation("r-1", Map.of("identifying", true)),
                new AddRelation("r-2", "t-m", "t-b", null, true, List.of(List.of("c-m2", "c-b1")), null, null)).next();
        assertThat(pk(m, "t-m")).containsExactly("c-m1", "c-m2");
        ErdModel off = ok(m, 2, 3, "s-a", new UpdateRelation("r-1", Map.of("identifying", false))).next();
        assertThat(pk(off, "t-m")).containsExactly("c-m1", "c-m2");
    }

    @Test
    void identifyingFlipConflictsWhenPeerChangedChildPk() {
        ErdModel peer = ok(base(true), 1, 2, "s-b",
                new AddColumn("c-m3", "t-m", "SEQ", "순번", null, "NUMBER", 5, 0, true, null, "", null),
                new SetPrimaryKey("t-m", List.of("c-m1", "c-m3"), null)).next();
        ErdRejection r = rej(engine.apply(peer, 1, 3, "s-a", List.of(new UpdateRelation("r-1", Map.of("identifying", true)))));
        assertThat(r.code()).isEqualTo("CONFLICT");
        assertThat(r.property()).isEqualTo("columns");
        assertThat(r.bySession()).isEqualTo("s-b");
    }

    @Test
    void unchangedIdentifyingDoesNotTouchPk() {
        // 비식별 관계인데 짝 컬럼(c-m2)이 이미 자식 PK 에 들어 있는 모델. 식별 값이 그대로면 PK 에서 빼지 않는다.
        ErdModel m = ok(base(true), 1, 2, "s-a", new SetPrimaryKey("t-m", List.of("c-m1", "c-m2"), null)).next();
        assertThat(m.relations.get("r-1").identifying).isFalse();
        var same = ok(m, 2, 3, "s-a", new UpdateRelation("r-1", Map.of("identifying", false,
                "cardinality", Map.of("child", "ONE_OR_MORE"))));
        assertThat(same.changes()).extracting(ErdChange::kind).containsExactly("relation");
        assertThat(pk(same.next(), "t-m")).containsExactly("c-m1", "c-m2");
    }

    // ---- deferred 30 ----

    @Test
    void duplicateRelationIsInvalidEvenWhenRejected() {
        ErdModel m = ok(base(true), 1, 2, "s-a", new RejectRelation("r-1")).next();
        ErdRejection r = rej(engine.apply(m, 2, 3, "s-a",
                List.of(new AddRelation("r-2", "t-m", "t-r", null, false, List.of(List.of("c-m2", "c-r1")), null, null))));
        assertThat(r.code()).isEqualTo("INVALID");
        assertThat(r.elementId()).isEqualTo("r-1");
        assertThat(r.message()).contains("REJECTED");
        assertThat(r.hint()).isEqualTo("confirmRelation 또는 updateRelation 으로 기존 관계를 쓰세요");
        // 짝을 주지 않고 그려도(ASK·REUSE) 같은 관계가 되면 이름 겹침 선택 전에 막는다.
        for (String mode : new String[] {null, "REUSE"}) {
            ErdRejection drawn = rej(engine.apply(m, 2, 3, "s-a",
                    List.of(new AddRelation("r-2", "t-m", "t-r", null, false, null, mode, null))));
            assertThat(drawn.code()).as(String.valueOf(mode)).isEqualTo("INVALID");
            assertThat(drawn.elementId()).isEqualTo("r-1");
        }
        // RENAME 은 새 컬럼을 만드므로 다른 관계다.
        var renamed = ok(m, 2, 3, "s-a", new AddRelation("r-2", "t-m", "t-r", null, false, null, "RENAME", null));
        assertThat(renamed.next().relations).containsKeys("r-1", "r-2");
    }

    @Test
    void pairOrderDoesNotMakeANewRelation() {
        ErdModel m = ok(base(true), 1, 2, "s-a", new AddRelation("r-2", "t-m", "t-r", null, false,
                List.of(List.of("c-m1", "c-r1"), List.of("c-m2", "c-r1")), null, null)).next();
        ErdRejection r = rej(engine.apply(m, 2, 3, "s-a", List.of(new AddRelation("r-3", "t-m", "t-r", null, false,
                List.of(List.of("c-m2", "c-r1"), List.of("c-m1", "c-r1")), null, null))));
        assertThat(r.code()).isEqualTo("INVALID");
        assertThat(r.elementId()).isEqualTo("r-2");
    }

    @Test
    void crossModelParentRefColumnsFollowPairs() {
        ErdModel m = base(true);
        ErdRejection bad = rej(engine.apply(m, 1, 2, "s-a", List.of(new AddRelation("r-x", "t-m", null,
                new ErdParentRefArg("mdm", "t-x", List.of("c-y")), false, List.of(List.of("c-m2", "c-x")), null, null))));
        assertThat(bad.code()).isEqualTo("INVALID");
        assertThat(bad.property()).isEqualTo("parentRef");
        ErdModel withRef = ok(m, 1, 2, "s-a", new AddRelation("r-x", "t-m", null,
                new ErdParentRefArg("mdm", "t-x", null), false, List.of(List.of("c-m2", "c-x")), null, null)).next();
        assertThat(withRef.relations.get("r-x").parentRef.columns()).containsExactly("c-x");
        // 빈 목록은 null 처럼 짝으로 채운다.
        ErdModel emptyRef = ok(m, 1, 2, "s-a", new AddRelation("r-e", "t-m", null,
                new ErdParentRefArg("mdm", "t-x", List.of()), false, List.of(List.of("c-m2", "c-x")), null, null)).next();
        assertThat(emptyRef.relations.get("r-e").parentRef.columns()).containsExactly("c-x");
        // 같은 컬럼이라도 순서가 pairs 의 부모 쪽과 다르면 거절한다.
        ErdRejection order = rej(engine.apply(m, 1, 2, "s-a", List.of(new AddRelation("r-o", "t-m", null,
                new ErdParentRefArg("mdm", "t-x", List.of("c-x2", "c-x1")), false,
                List.of(List.of("c-m1", "c-x1"), List.of("c-m2", "c-x2")), null, null))));
        assertThat(order.code()).isEqualTo("INVALID");
        assertThat(order.property()).isEqualTo("parentRef");
        ErdRejection dup = rej(engine.apply(withRef, 2, 3, "s-a", List.of(new AddRelation("r-y", "t-m", null,
                new ErdParentRefArg("mdm", "t-x", List.of("c-x")), false, List.of(List.of("c-m2", "c-x")), null, null))));
        assertThat(dup.code()).isEqualTo("INVALID");
        assertThat(dup.elementId()).isEqualTo("r-x");
    }
}
