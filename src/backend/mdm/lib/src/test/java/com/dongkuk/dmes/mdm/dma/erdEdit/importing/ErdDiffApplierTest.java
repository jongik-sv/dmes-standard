package com.dongkuk.dmes.mdm.dma.erdEdit.importing;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Column;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Constraint;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Table;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ApplyOutcome;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommandEngine;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdNaming;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.InferredRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

/** README "다시 가져오기 반영": 항목 종류별 restore 요소, 낡은 id, 결정한 관계 유지, 스스로 충돌하지 않는 요소 합치기. */
class ErdDiffApplierTest {

    final ErdCommandEngine engine = new ErdCommandEngine(ErdNaming.NONE);
    static final ErdDictionary DICT = new ErdDictionary(TermDictionary.of(List.of()), Set.of(), Set.of(), Map.of(), List.of());

    static final Constraint PK_P = new Constraint("PK_TB_P", "TB_P", "P", List.of("ID"), null, null);
    static final Constraint PK_C = new Constraint("PK_TB_C", "TB_C", "P", List.of("ID"), null, null);
    static final Constraint FK_C_P = new Constraint("FK_TB_C_P", "TB_C", "R", List.of("P_ID"), "TB_P", List.of("ID"));

    static Column col(String name, int pos, String type, Integer len, Integer prec, Integer scale, boolean nullable) {
        return new Column(name, pos, type, len, prec, scale, nullable, null, null);
    }

    static Table tb(String name, Column... cols) {
        return new Table(name, name, List.of(cols));
    }

    /** TB_P(ID PK) · TB_C(ID PK, P_ID, NOTE(10), OLD) · TB_GONE(A). */
    static List<Table> baseTables() {
        return List.of(
                tb("TB_P", col("ID", 1, "VARCHAR2", 10, null, null, false)),
                tb("TB_C", col("ID", 1, "NUMBER", 22, 19, 0, false), col("P_ID", 2, "VARCHAR2", 10, null, null, true),
                        col("NOTE", 3, "VARCHAR2", 10, null, null, true), col("OLD", 4, "CHAR", 1, null, null, true)),
                tb("TB_GONE", col("A", 1, "DATE", 7, null, null, true)));
    }

    /** 가져온 때의 DB. fk 면 TB_C(P_ID) > TB_P(ID) DB FK 가 있다. */
    static ErdDbMeta before(boolean fk) {
        List<Constraint> cons = new ArrayList<>(List.of(PK_P, PK_C));
        if (fk) cons.add(FK_C_P);
        return new ErdDbMeta("S", baseTables(), cons, List.of());
    }

    /**
     * 바뀐 DB: NOTE 길이 20, EXTRA 추가, OLD 삭제, TB_NEW(N_ID PK, P_ID → TB_P) 추가, TB_GONE 삭제,
     * FK_TB_C_P 삭제, FK_TB_C_NOTE(TB_C.NOTE > TB_P.ID) 추가.
     */
    static ErdDbMeta after() {
        return new ErdDbMeta("S", List.of(
                tb("TB_P", col("ID", 1, "VARCHAR2", 10, null, null, false)),
                tb("TB_C", col("ID", 1, "NUMBER", 22, 19, 0, false), col("P_ID", 2, "VARCHAR2", 10, null, null, true),
                        col("NOTE", 3, "VARCHAR2", 20, null, null, true), col("EXTRA", 5, "NUMBER", 22, 5, 0, true)),
                tb("TB_NEW", col("N_ID", 1, "VARCHAR2", 10, null, null, false), col("P_ID", 2, "VARCHAR2", 10, null, null, true))),
            List.of(PK_P, PK_C,
                new Constraint("PK_TB_NEW", "TB_NEW", "P", List.of("N_ID"), null, null),
                new Constraint("FK_TB_NEW_P", "TB_NEW", "R", List.of("P_ID"), "TB_P", List.of("ID")),
                new Constraint("FK_TB_C_NOTE", "TB_C", "R", List.of("NOTE"), "TB_P", List.of("ID"))),
            List.of());
    }

    static final List<String> ALL = List.of(
            "COLUMN_ADDED:TB_C.EXTRA", "COLUMN_CHANGED:TB_C.NOTE", "COLUMN_REMOVED:TB_C.OLD",
            "FK_ADDED:TB_C(NOTE)>TB_P(ID)", "FK_REMOVED:TB_C(P_ID)>TB_P(ID)", "TABLE_ADDED:TB_NEW", "TABLE_REMOVED:TB_GONE");

    /** 가져온 모델(rev 1, 세션 s-imp). 관계는 준 대로 넣는다. */
    static ErdModel imported(ErdDbMeta meta, List<InferredRelation> rels) {
        AtomicInteger n = new AtomicInteger();
        var built = ErdImportBuilder.build(meta, rels, DICT, 0, ch -> ch + "-" + n.incrementAndGet());
        var out = new ErdCommandEngine(ErdNaming.NONE).apply(ErdModel.empty("m", "S"), 0, 1, "s-imp", List.of(built.restore()));
        return ((ApplyOutcome.Applied) out).next();
    }

    static List<InferredRelation> dbRels(ErdDbMeta meta) {
        return meta.constraints().stream().filter(k -> k.type().equals("R"))
                .map(k -> new InferredRelation(k.table(), k.columns(), k.refTable(), k.refColumns(), "DB",
                        List.of(new ErdEvidence("DB_FK", k.name())), null)).toList();
    }

    /** 새 요소 id 몸통 n1, n2, … — 가져오기의 순번 id(t-1, c-2 …)와 겹치지 않는다. */
    static Supplier<String> seq() {
        AtomicInteger n = new AtomicInteger();
        return () -> "n" + n.incrementAndGet();
    }

    static String tableId(ErdModel m, String phys) {
        return m.tables.entrySet().stream().filter(e -> phys.equals(e.getValue().phys)).findFirst().orElseThrow().getKey();
    }

    static String columnId(ErdModel m, String table, String phys) {
        String t = tableId(m, table);
        return m.columns.entrySet().stream().filter(e -> t.equals(e.getValue().table) && phys.equals(e.getValue().phys))
                .findFirst().orElseThrow().getKey();
    }

    /** 짝의 첫 자식 컬럼이 table.column 인 관계 id. */
    static String relationIdOn(ErdModel m, String table, String column) {
        String c = columnId(m, table, column);
        return m.relations.entrySet().stream().filter(e -> e.getValue().pairs.get(0).get(0).equals(c))
                .findFirst().orElseThrow().getKey();
    }

    static ErdRelation relationOn(ErdModel m, String table, String column) {
        return m.relations.get(relationIdOn(m, table, column));
    }

    ErdModel apply(ErdModel m, long base, long rev, String session, ErdCommand.Restore restore) {
        var out = engine.apply(m, base, rev, session, List.of(restore));
        assertThat(out).as("rejected: %s", out instanceof ApplyOutcome.Rejected r ? r.rejection() : null)
                .isInstanceOf(ApplyOutcome.Applied.class);
        return ((ApplyOutcome.Applied) out).next();
    }

    /** 모든 종류를 한 번에 고르면 엔진이 받아들이고, 다시 계산한 차이가 비어 있다. */
    @Test
    void appliesEveryKindAndDiffBecomesEmpty() {
        ErdModel m = imported(before(true), dbRels(before(true)));
        assertThat(ErdDbDiff.diff(m, after())).extracting(ErdDbDiffItem::id).containsExactlyElementsOf(ALL);
        var built = ErdDiffApplier.build(m, after(), DICT, ALL, 1, seq());
        assertThat(built.staleIds()).isEmpty();
        assertThat(built.restore().sinceRev()).isEqualTo(1);
        ErdModel next = apply(m, 1, 2, "s-a", built.restore());

        assertThat(ErdDbDiff.diff(next, after())).isEmpty();
        assertThat(next.tables.values()).extracting(t -> t.phys).containsExactlyInAnyOrder("TB_P", "TB_C", "TB_NEW");
        ErdRelation old = relationOn(next, "TB_C", "P_ID");
        assertThat(old.dbFk).isFalse();
        assertThat(old.state).isEqualTo("CONFIRMED");   // DB 에서 FK 가 빠진 DB 상태 관계
        ErdRelation note = relationOn(next, "TB_C", "NOTE");
        assertThat(note.state).isEqualTo("DB");
        assertThat(note.dbFk).isTrue();
        assertThat(note.evidence).containsExactly(new ErdEvidence("DB_FK", "FK_TB_C_NOTE"));
        assertThat(relationOn(next, "TB_NEW", "P_ID").state).isEqualTo("DB");   // 새 표의 DB FK 도 함께 들어온다
        assertThat(next.tables.get(tableId(m, "TB_C")).columnOrder).extracting(id -> next.columns.get(id).phys)
                .containsExactly("ID", "P_ID", "NOTE", "EXTRA");

        var s = built.summary();
        assertThat(List.of(s.items(), s.tablesAdded(), s.tablesRemoved(), s.columnsAdded(), s.columnsRemoved(),
                s.columnsChanged(), s.relationsAdded(), s.dbFkSet(), s.dbFkCleared())).containsExactly(7, 1, 1, 1, 1, 1, 2, 0, 1);
        assertThat(s.removedIds()).containsExactlyInAnyOrder(
                columnId(m, "TB_C", "OLD"), tableId(m, "TB_GONE"), columnId(m, "TB_GONE", "A"));
    }

    /** Review Focus 5: 확정·기각한 관계에 걸린 FK_ADDED 는 dbFk 만 켜고 상태를 그대로 둔다. 추정 관계는 DB 가 된다. */
    @Test
    void fkAddedKeepsDecidedRelationState() {
        List<InferredRelation> inferred = List.of(new InferredRelation("TB_C", List.of("P_ID"), "TB_P", List.of("ID"),
                "INFERRED", List.of(new ErdEvidence("NAME_RULE", "PK 이름 일치")), 2));
        String item = "FK_ADDED:TB_C(P_ID)>TB_P(ID)";
        for (String decided : new String[] {"CONFIRMED", "REJECTED", "INFERRED"}) {
            ErdModel m = imported(before(false), inferred);
            String rid = relationIdOn(m, "TB_C", "P_ID");
            long rev = 1;
            if (!decided.equals("INFERRED")) {
                ErdCommand cmd = decided.equals("CONFIRMED") ? new ErdCommand.ConfirmRelation(rid) : new ErdCommand.RejectRelation(rid);
                m = ((ApplyOutcome.Applied) engine.apply(m, 1, 2, "s-b", List.of(cmd))).next();
                rev = 2;
            }
            assertThat(ErdDbDiff.diff(m, before(true))).extracting(ErdDbDiffItem::id).containsExactly(item);
            var built = ErdDiffApplier.build(m, before(true), DICT, List.of(item), rev, seq());
            ErdModel next = apply(m, rev, rev + 1, "s-a", built.restore());
            assertThat(next.relations).as(decided).hasSize(1);
            ErdRelation r = next.relations.get(rid);
            assertThat(r.dbFk).as(decided).isTrue();
            assertThat(r.state).as(decided).isEqualTo(decided.equals("INFERRED") ? "DB" : decided);
            assertThat(r.candidateRank).as(decided).isEqualTo(decided.equals("INFERRED") ? null : 2);
            assertThat(r.evidence).as(decided).contains(new ErdEvidence("DB_FK", "FK_TB_C_P"));
            assertThat(built.summary().dbFkSet()).isEqualTo(1);
            assertThat(built.summary().relationsAdded()).isZero();
        }
    }

    @Test
    void staleIdsAreReturnedWithoutRestore() {
        ErdModel m = imported(before(true), dbRels(before(true)));
        var built = ErdDiffApplier.build(m, after(), DICT,
                List.of("COLUMN_CHANGED:TB_C.NOTE", "COLUMN_ADDED:TB_X.Y", "COLUMN_ADDED:TB_X.Y"), 1, seq());
        assertThat(built.restore()).isNull();
        assertThat(built.summary()).isNull();
        assertThat(built.staleIds()).containsExactly("COLUMN_ADDED:TB_X.Y");
    }

    /** 컬럼 삭제와 그 컬럼의 FK 삭제를 함께 고르면 관계는 delete 하나다(patch 뒤 delete 로 스스로 충돌하지 않는다). */
    @Test
    void removedColumnAndItsForeignKeyBecomeOneDelete() {
        ErdModel m = imported(before(true), dbRels(before(true)));
        ErdDbMeta noPid = new ErdDbMeta("S", List.of(
                tb("TB_P", col("ID", 1, "VARCHAR2", 10, null, null, false)),
                tb("TB_C", col("ID", 1, "NUMBER", 22, 19, 0, false), col("NOTE", 3, "VARCHAR2", 10, null, null, true),
                        col("OLD", 4, "CHAR", 1, null, null, true)),
                tb("TB_GONE", col("A", 1, "DATE", 7, null, null, true))), List.of(PK_P, PK_C), List.of());
        List<String> ids = List.of("COLUMN_REMOVED:TB_C.P_ID", "FK_REMOVED:TB_C(P_ID)>TB_P(ID)");
        assertThat(ErdDbDiff.diff(m, noPid)).extracting(ErdDbDiffItem::id).containsExactlyElementsOf(ids);
        String rid = relationIdOn(m, "TB_C", "P_ID");
        var built = ErdDiffApplier.build(m, noPid, DICT, ids, 1, seq());
        assertThat(built.restore().elements()).filteredOn(e -> e.id().equals(rid)).singleElement()
                .satisfies(e -> assertThat(e.op()).isEqualTo(ErdChange.DELETE));
        ErdModel next = apply(m, 1, 2, "s-a", built.restore());
        assertThat(next.relations).isEmpty();
        assertThat(ErdDbDiff.diff(next, noPid)).isEmpty();
        assertThat(built.summary().columnsRemoved()).isEqualTo(1);
        assertThat(built.summary().dbFkCleared()).isZero();
        assertThat(built.summary().removedIds()).containsExactlyInAnyOrder(columnId(m, "TB_C", "P_ID"), rid);
    }

    /** 부모가 새 표인 FK_ADDED 는 그 표의 TABLE_ADDED 를 함께 골라야 들어간다. */
    @Test
    void foreignKeyToUnselectedNewTableIsStale() {
        ErdModel m = imported(before(false), List.of());
        List<Table> tables = new ArrayList<>(baseTables());
        tables.add(tb("TB_NEW2", col("ID", 1, "VARCHAR2", 10, null, null, false)));
        ErdDbMeta withNew2 = new ErdDbMeta("S", tables, List.of(PK_P, PK_C,
                new Constraint("PK_TB_NEW2", "TB_NEW2", "P", List.of("ID"), null, null),
                new Constraint("FK_TB_C_NEW2", "TB_C", "R", List.of("P_ID"), "TB_NEW2", List.of("ID"))), List.of());
        String fk = "FK_ADDED:TB_C(P_ID)>TB_NEW2(ID)", table = "TABLE_ADDED:TB_NEW2";
        assertThat(ErdDbDiff.diff(m, withNew2)).extracting(ErdDbDiffItem::id).containsExactly(fk, table);

        var alone = ErdDiffApplier.build(m, withNew2, DICT, List.of(fk), 1, seq());
        assertThat(alone.restore()).isNull();
        assertThat(alone.staleIds()).containsExactly(fk);

        var both = ErdDiffApplier.build(m, withNew2, DICT, List.of(fk, table), 1, seq());
        ErdModel next = apply(m, 1, 2, "s-a", both.restore());
        assertThat(ErdDbDiff.diff(next, withNew2)).isEmpty();
        assertThat(both.summary().relationsAdded()).isEqualTo(1);
    }

    /** sinceRev = 요청 baseRev: 차이를 본 뒤 남이 같은 속성을 고쳤으면 CONFLICT 이고, 그 rev 를 본 뒤 보내면 들어간다. */
    @Test
    void peerChangeAfterBaseRevConflicts() {
        ErdModel m = imported(before(true), dbRels(before(true)));
        String note = columnId(m, "TB_C", "NOTE");
        ErdModel peer = ((ApplyOutcome.Applied) engine.apply(m, 1, 2, "s-b",
                List.of(new ErdCommand.UpdateColumn(note, Map.of("length", 30))))).next();
        var stale = ErdDiffApplier.build(peer, after(), DICT, List.of("COLUMN_CHANGED:TB_C.NOTE"), 1, seq());
        ErdRejection r = ((ApplyOutcome.Rejected) engine.apply(peer, 1, 3, "s-a", List.of(stale.restore()))).rejection();
        assertThat(r.code()).isEqualTo("CONFLICT");
        assertThat(r.elementId()).isEqualTo(note);
        assertThat(r.property()).isEqualTo("length");
        assertThat(r.byRev()).isEqualTo(2);
        var fresh = ErdDiffApplier.build(peer, after(), DICT, List.of("COLUMN_CHANGED:TB_C.NOTE"), 2, seq());
        assertThat(apply(peer, 2, 3, "s-a", fresh.restore()).columns.get(note).length).isEqualTo(20);
    }
}
